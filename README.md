# J3C AI Cake

A private learning tool with an investment lens. It explains Jensen Huang's five-layer AI cake (energy, chips, infrastructure, models, applications), the plate underneath it (capital, data, talent, policy, materials), and where the money is flowing, then tests whether you can use the framework.

Education only, not investment advice. Personal use.

## What's in it

| Tab | What it does |
| --- | --- |
| Cake | Tap any layer or plate item. Follow-the-dollar split, current bottleneck. |
| Layers | Full brief per layer: money model, chokepoints, players, bull and bear, US vs China, exit rules. |
| Capital & Deals | Capex guidance, actual capex from SEC filings, deals, contested numbers, plate players, data centers. |
| Watchlist | 85 public names tagged by layer, with multi-layer mixes. |
| My Portfolio | Enter positions; see exposure by layer, concentration flags, and the exit rules that apply to you. |
| Cycle | Build-out → Digestion → Overbuild → Bust dial, signals, historical analogs. |
| Train | Quiz with confidence scoring and spaced review, sort drill, scenario lab, prediction log, progress. |

A Simple / Analyst switch in the header changes the reading level everywhere.

Your answers, predictions, and positions are saved in your browser only. Use **Train → Progress** to copy them to another device. Nothing personal is stored in this repo.

## Files

```
index.html, app.js          the site (no build step, no dependencies)
data/cake.json              framework, facts with source tiers, deals, cycle, scenarios, questions
data/watchlist.json         tickers by layer
data/holdings.json          EXAMPLE positions only
data/live.json              Tier 1 numbers from the weekly pull (SEC EDGAR, FRED)
data/snapshots/             one dated copy per weekly pull
briefings/                  weekly one-page briefings
scripts/fetch_tier1.py      weekly SEC and FRED pull with sanity checks
scripts/validate.py         data checks run before every commit
AGENT.md                    standing rules for the weekly Claude run
```

## Weekly updates

1. **Sunday ~5:15 pm ET** — GitHub Action pulls SEC capex and depreciation plus FRED credit spreads, runs the sanity checks, and opens a pull request.
2. **Sunday evening** — a Claude scheduled task follows `AGENT.md`: researches the week, applies the trust stack, adds facts, deals, and quiz questions, writes the briefing, and opens a pull request.
3. **You** — review and merge. Nothing reaches the live site without your merge.

One-time setup for the Action:
- Settings → Secrets and variables → Actions → New secret `SEC_USER_AGENT` with a value like `J3C AI Cake you@example.com` (SEC asks for a contact).
- Settings → Actions → General → Workflow permissions → tick **Allow GitHub Actions to create and approve pull requests**.

## Private hosting (Cloudflare, free)

GitHub Pages from a private repo still publishes a public website, so host it on Cloudflare instead:

1. Create a free account at cloudflare.com.
2. Workers & Pages → Create → Pages → Connect to Git → choose `J3CLEG/j3c-ai-cake`. Build command: none. Output directory: `/`.
3. Zero Trust → Access → Applications → Add → Self-hosted. Point it at your `*.pages.dev` address and allow only your email address.

Every merge to `main` redeploys automatically.

## Run locally

```
python3 -m http.server 8000
```
then open http://localhost:8000. Opening `index.html` directly from disk will not load the data files.
