#!/usr/bin/env python3
"""Weekly Tier 1 data pull for the J3C AI Cake site.

Pulls only primary sources:
  * SEC EDGAR XBRL company facts: quarterly capex and D&A for the hyperscalers
  * FRED (St. Louis Fed): high-yield credit spread and 10-year Treasury yield

Writes:
  data/live.json                  latest values the site reads
  data/snapshots/YYYY-MM-DD.json  dated copy, kept forever (git history)
  data/checks.json                sanity-check report (the PR body quotes it)

Sanity rules (the "trust stack"):
  * A quarter already on file that changes by more than 5% is flagged as a restatement.
  * A FRED series that moves more than 25% week over week is flagged for review.
  * A source that fails keeps its previous value and is marked stale, never blanked.

Standard library only. Usage: python3 scripts/fetch_tier1.py [--offline FIXTURE_DIR]
"""
import csv
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
UA = os.environ.get("SEC_USER_AGENT", "J3C-AI-Cake personal research admin@example.com")

CAPEX_TAGS = ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"]
DA_TAGS = ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndOther", "DepreciationAndAmortization",
           "DepreciationAmortizationAndAccretionNet", "Depreciation", "DepreciationOfPropertyPlantAndEquipment"]
FRED_SERIES = {
    "BAMLH0A0HYM2": "US high-yield option-adjusted spread (%)",
    "DGS10": "10-year Treasury yield (%)",
}
RESTATE_TOL = 0.05
MOVE_TOL = 0.25


def http_get(url, headers=None, timeout=30):
    """GET with SEC-friendly pacing: 1s between calls, one retry after a 429."""
    for attempt in (1, 2):
        time.sleep(1.0 if attempt == 1 else 15.0)
        req = urllib.request.Request(url, headers=headers or {"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 2:
                raise


def _quarters_from_ytd(units):
    """Cash-flow items are reported year-to-date (3, 6, 9, 12 months from fiscal-year start).
    Rebuild single quarters by differencing successive cumulative values that share a start date.
    Returns {period_end: {...}} keyed by the quarter's end date."""
    latest = {}  # (start, end) -> fact from the most recent filing
    for f in units:
        if f.get("form") not in ("10-Q", "10-K", "10-Q/A", "10-K/A") or not f.get("start") or not f.get("end"):
            continue
        key = (f["start"], f["end"])
        if key not in latest or (f.get("filed") or "") > (latest[key].get("filed") or ""):
            latest[key] = f
    by_start = {}
    for (start, end), f in latest.items():
        by_start.setdefault(start, []).append(f)
    out = {}
    for start, facts in by_start.items():
        facts.sort(key=lambda x: x["end"])
        prev_val = 0
        prev_end = start
        for f in facts:
            months = (int(f["end"][:4]) - int(prev_end[:4])) * 12 + int(f["end"][5:7]) - int(prev_end[5:7])
            if 2 <= months <= 4:  # one quarter beyond the previous cumulative point
                out[f["end"]] = {"value": f["val"] - prev_val, "filed": f.get("filed"), "form": f.get("form"), "accn": f.get("accn")}
            prev_val, prev_end = f["val"], f["end"]
    return out


def quarterly_series(facts, tags):
    """Return (tag, {quarter_end: {...}}) for the tag with the most recent data; last 8 quarters."""
    usgaap = facts.get("facts", {}).get("us-gaap", {})
    best = (None, {})
    for tag in tags:
        units = usgaap.get(tag, {}).get("units", {}).get("USD")
        if not units:
            continue
        q = _quarters_from_ytd(units)
        if q and (not best[1] or max(q) > max(best[1])):
            best = (tag, q)
    tag, q = best
    return tag, dict(sorted(q.items())[-8:])


def fred_latest(series_id, fetch):
    text = fetch(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}")
    rows = [r for r in csv.reader(io.StringIO(text))][1:]
    rows = [(d, v) for d, v in rows if v not in (".", "")]
    if not rows:
        raise ValueError("no observations")
    d, v = rows[-1]
    return {"date": d, "value": float(v)}


def load_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def main(argv):
    offline = None
    if "--offline" in argv:
        offline = argv[argv.index("--offline") + 1]

    def fetch(url):
        if offline:
            key = url.split("CIK")[-1].split(".json")[0] if "companyfacts" in url else url.split("id=")[-1]
            with open(os.path.join(offline, key + (".json" if "companyfacts" in url else ".csv"))) as f:
                return f.read()
        return http_get(url)

    cake = load_json(os.path.join(DATA, "cake.json"), {})
    ciks = cake.get("capex", {}).get("edgar_ciks", {})
    prev = load_json(os.path.join(DATA, "live.json"), {"edgar": {}, "fred": {}})
    today = date.today().isoformat()
    live = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "tier": 1, "edgar": {}, "fred": {}}
    checks = {"run": today, "ok": [], "flags": [], "errors": []}

    for ticker, cik in ciks.items():
        old = prev.get("edgar", {}).get(ticker, {})
        try:
            facts = json.loads(fetch(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"))
            ctag, capex = quarterly_series(facts, CAPEX_TAGS)
            dtag, da = quarterly_series(facts, DA_TAGS)
            if not capex:
                raise ValueError("no quarterly capex tag found")
            for frame, cur in capex.items():
                if cur["value"] < 0:
                    checks["flags"].append(f"{ticker} {frame} reconstructed capex is negative; check filings")
                was = old.get("capex", {}).get(frame)
                if was and was["value"] and abs(cur["value"] / was["value"] - 1) > RESTATE_TOL:
                    checks["flags"].append(f"{ticker} {frame} capex changed {was['value']/1e9:.1f}B -> {cur['value']/1e9:.1f}B (possible restatement)")
            live["edgar"][ticker] = {"capex_tag": ctag, "capex": capex, "da_tag": dtag, "da": da, "stale": False,
                                      "source": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-Q"}
            latest = list(capex)[-1]
            checks["ok"].append(f"{ticker}: latest capex {latest} = ${capex[latest]['value']/1e9:.1f}B ({capex[latest]['form']} filed {capex[latest]['filed']})")
        except Exception as e:  # keep last good value, mark stale
            checks["errors"].append(f"{ticker}: {e}")
            if old:
                live["edgar"][ticker] = dict(old, stale=True)

    for sid, label in FRED_SERIES.items():
        old = prev.get("fred", {}).get(sid)
        try:
            cur = fred_latest(sid, fetch)
            cur["label"] = label
            cur["source"] = f"https://fred.stlouisfed.org/series/{sid}"
            if old and old.get("value") and abs(cur["value"] / old["value"] - 1) > MOVE_TOL:
                checks["flags"].append(f"{sid} moved {old['value']} -> {cur['value']} (>25% in a week; review before trusting)")
            live["fred"][sid] = cur
            checks["ok"].append(f"{sid}: {cur['value']} on {cur['date']}")
        except Exception as e:
            checks["errors"].append(f"{sid}: {e}")
            if old:
                live["fred"][sid] = dict(old, stale=True)

    # Internal consistency of hand-entered guidance
    for r in cake.get("capex", {}).get("rows", []):
        if r["guide_low"] > r["guide_high"]:
            checks["flags"].append(f"{r['company']} guidance low > high in cake.json")

    os.makedirs(os.path.join(DATA, "snapshots"), exist_ok=True)
    for path, obj in ((os.path.join(DATA, "live.json"), live),
                      (os.path.join(DATA, "snapshots", f"{today}.json"), live),
                      (os.path.join(DATA, "checks.json"), checks)):
        with open(path, "w") as f:
            json.dump(obj, f, indent=1)
            f.write("\n")

    print(f"ok={len(checks['ok'])} flags={len(checks['flags'])} errors={len(checks['errors'])}")
    for k in ("flags", "errors"):
        for line in checks[k]:
            print(f"{k[:-1].upper()}: {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
