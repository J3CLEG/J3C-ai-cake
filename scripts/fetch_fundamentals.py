#!/usr/bin/env python3
"""Tier 1 company financials from SEC EDGAR for every watchlist ticker that files with the SEC.

For each company: latest fiscal year and trailing twelve months (sum of the last four
reported quarters, rebuilt from year-to-date filings) of revenue, operating income, net
income, operating cash flow, capex, free cash flow, and R&D.

Companies listed only abroad (Korea, Japan, Germany, France) do not file with the SEC;
their numbers come from the researched company profiles instead.

Writes data/fundamentals.json. Standard library only.
Usage: python3 scripts/fetch_fundamentals.py [TICKER ...]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_tier1 import http_get, _quarters_from_ytd  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
ANNUAL_FORMS = ("10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A", "10-KT")

METRICS = {
    "revenue": [("us-gaap", "Revenues"), ("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax"),
                ("us-gaap", "RevenueFromContractWithCustomerIncludingAssessedTax"), ("us-gaap", "RegulatedAndUnregulatedOperatingRevenue"),
                ("us-gaap", "ElectricUtilityRevenue"),
                ("us-gaap", "SalesRevenueNet"), ("us-gaap", "RevenuesNetOfInterestExpense"),
                ("us-gaap", "GrossInvestmentIncomeOperating"), ("us-gaap", "InterestAndDividendIncomeOperating"),
                ("ifrs-full", "Revenue"), ("ifrs-full", "RevenueFromContractsWithCustomers")],
    "operating_income": [("us-gaap", "OperatingIncomeLoss"), ("ifrs-full", "ProfitLossFromOperatingActivities")],
    "net_income": [("us-gaap", "NetIncomeLoss"), ("us-gaap", "NetIncomeLossAvailableToCommonStockholdersBasic"),
                   ("us-gaap", "NetIncreaseDecreaseInNetAssetsResultingFromOperations"),
                   ("ifrs-full", "ProfitLossAttributableToOwnersOfParent"), ("ifrs-full", "ProfitLoss")],
    "operating_cash_flow": [("us-gaap", "NetCashProvidedByUsedInOperatingActivities"),
                            ("ifrs-full", "CashFlowsFromUsedInOperatingActivities")],
    "capex": [("us-gaap", "PaymentsToAcquirePropertyPlantAndEquipment"), ("us-gaap", "PaymentsToAcquireProductiveAssets"),
              ("ifrs-full", "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities")],
    "rnd": [("us-gaap", "ResearchAndDevelopmentExpense"), ("us-gaap", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"),
            ("ifrs-full", "ResearchAndDevelopmentExpense")],
}


def months_between(start, end):
    return (int(end[:4]) - int(start[:4])) * 12 + int(end[5:7]) - int(start[5:7])


def pick_units(node):
    """Use the currency with the most facts: the reporting currency, not a convenience translation."""
    units = {k: v for k, v in node.get("units", {}).items() if "/" not in k and k.isalpha() and len(k) == 3}
    if not units:
        return None, None
    k = max(units, key=lambda u: (len(units[u]), u == "USD"))
    return k, units[k]


def metric(facts, choices, prefer_largest=False):
    """Best tag = the one with the most recent annual period. For revenue, ties on period go to the
    largest value, because narrower tags (one revenue stream) are always smaller than the total."""
    best = None
    for tax, tag in choices:
        node = facts.get("facts", {}).get(tax, {}).get(tag)
        if not node:
            continue
        cur, units = pick_units(node)
        if not units:
            continue
        annual = [f for f in units if f.get("form") in ANNUAL_FORMS and f.get("start") and 11 <= months_between(f["start"], f["end"]) <= 13]  # 52/53-week years
        if not annual:
            continue
        annual.sort(key=lambda f: (f["end"], f.get("filed", "")))
        fy = annual[-1]
        q = _quarters_from_ytd(units)
        ends = sorted(q)[-4:]
        ttm = None
        if len(ends) == 4 and months_between(ends[0], ends[-1]) == 9 and ends[-1] > fy["end"]:
            ttm = {"end": ends[-1], "value": sum(q[e]["value"] for e in ends)}
        cand = {"tag": f"{tax}:{tag}", "currency": cur,
                "fy": {"end": fy["end"], "value": fy["val"], "form": fy.get("form"), "filed": fy.get("filed")},
                "ttm": ttm}
        if best is None or cand["fy"]["end"] > best["fy"]["end"] or (
                prefer_largest and cand["fy"]["end"] == best["fy"]["end"] and cand["currency"] == best["currency"]
                and cand["fy"]["value"] > best["fy"]["value"]):
            best = cand
    return best


def main(argv):
    wl = json.load(open(os.path.join(DATA, "watchlist.json")))
    want = [i["t"] for i in wl["items"]]
    if argv:
        want = [t for t in want if t in argv]
    cikmap = {v["ticker"].upper(): str(v["cik_str"]).zfill(10)
              for v in json.loads(http_get("https://www.sec.gov/files/company_tickers.json")).values()}
    path = os.path.join(DATA, "fundamentals.json")
    try:
        prev = json.load(open(path))
    except (OSError, ValueError):
        prev = {"items": {}}
    out = {"tier": 1, "source": "SEC EDGAR XBRL company facts", "items": dict(prev.get("items", {})),
           "not_sec_filers": [] if not argv else list(prev.get("not_sec_filers", []))}
    for t in want:
        cik = cikmap.get(t)
        if not cik:
            if t not in out["not_sec_filers"]:
                out["not_sec_filers"].append(t)
            continue
        try:
            facts = json.loads(http_get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"))
        except Exception as e:
            print(f"ERROR {t}: {e}")
            if t in out["items"]:
                out["items"][t]["stale"] = True
            continue
        rec = {"cik": cik, "entity": facts.get("entityName"), "stale": False,
               "filings": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-K&dateb=&owner=include&count=40"}
        for name, choices in METRICS.items():
            m = metric(facts, choices, prefer_largest=(name == "revenue"))
            if m:
                rec[name] = m
        if "operating_cash_flow" in rec and "capex" in rec:
            ocf, cap = rec["operating_cash_flow"], rec["capex"]
            if ocf["fy"]["end"] == cap["fy"]["end"]:
                rec["fcf_fy"] = ocf["fy"]["value"] - cap["fy"]["value"]
        out["items"][t] = rec
        r = rec.get("revenue")
        print(f"ok {t}: revenue FY{r['fy']['end'][:4]} {r['currency']} {r['fy']['value']/1e9:.1f}B" if r else f"ok {t}: no revenue tag")
    from datetime import datetime, timezone
    out["generated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    print(f"done: {len(out['items'])} companies; not SEC filers: {', '.join(out['not_sec_filers']) or 'none'}")


if __name__ == "__main__":
    main(sys.argv[1:])
