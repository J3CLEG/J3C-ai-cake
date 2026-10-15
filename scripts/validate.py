#!/usr/bin/env python3
"""Validate the site's data files before any commit. Exit code 1 on any problem.

Checks: JSON parses; every public player and plate ticker is on the watchlist; every
watchlist mix sums to 1 and includes its primary layer; every cited source key exists;
every question has a valid answer index; capex guidance low <= high.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
problems = []


def load(name):
    try:
        with open(os.path.join(ROOT, "data", name)) as f:
            return json.load(f)
    except Exception as e:
        problems.append(f"{name}: {e}")
        return None


cake, wl = load("cake.json"), load("watchlist.json")
load("holdings.json")
if cake and wl:
    tickers = {i["t"]: i for i in wl["items"]}
    for layer in cake["layers"]:
        for t in layer["players_public"]:
            if t not in tickers:
                problems.append(f"{layer['id']} lists {t}, which is not on the watchlist")
    for g in cake["capital"]["groups"]:
        for t in g["tickers"]:
            if t not in tickers:
                problems.append(f"plate group {g['id']} lists {t}, which is not on the watchlist")
    for i in wl["items"]:
        if "mix" in i:
            if abs(sum(i["mix"].values()) - 1) > 1e-6:
                problems.append(f"{i['t']} mix does not sum to 1")
            if i["layer"] not in i["mix"]:
                problems.append(f"{i['t']} primary layer missing from its mix")
    used = set()

    def walk(o):
        if isinstance(o, dict):
            if o.get("source"):
                used.add(o["source"])
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(cake)
    for s in sorted(used - set(cake["sources"])):
        problems.append(f"source key '{s}' is cited but not defined in sources")
    ids = set()
    for q in cake["questions"]:
        if q["id"] in ids:
            problems.append(f"duplicate question id {q['id']}")
        ids.add(q["id"])
        if not 0 <= q["a"] < len(q["options"]):
            problems.append(f"question {q['id']} answer index out of range")
    for r in cake["capex"]["rows"]:
        if r["guide_low"] > r["guide_high"]:
            problems.append(f"{r['company']} guidance low > high")

co = load("companies.json")
if co and wl:
    for i in wl["items"]:
        c = co["items"].get(i["t"])
        if not c:
            problems.append(f"{i['t']} has no company profile")
            continue
        for k in ("name", "fiscal_period", "currency", "segments", "how_it_makes_money", "sources"):
            if not c.get(k):
                problems.append(f"{i['t']} profile missing {k}")
        segs = [s.get("revenue_b") for s in c.get("segments", []) if s.get("revenue_b") is not None]
        tot = c.get("revenue_total_b")
        if tot and segs and abs(sum(segs) - tot) > max(0.1, 0.03 * abs(tot)):
            problems.append(f"{i['t']} segments sum {sum(segs):.2f} vs total {tot}")
        if not any(str(s.get("url", "")).startswith("http") for s in c.get("sources", [])):
            problems.append(f"{i['t']} profile has no source link")

if problems:
    print("\n".join("PROBLEM: " + p for p in problems))
    sys.exit(1)
print("data ok")
