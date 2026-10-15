# Weekly agent instructions

These are the standing rules for the weekly Claude run that keeps the J3C AI Cake site current.
The run happens Sunday evening, after the GitHub Action has pulled Tier 1 numbers (SEC, FRED).
Jay reviews every change as a pull request. Nothing goes straight to `main`.

## 1. Get set up
1. Clone `J3CLEG/j3c-ai-cake` and work on a new branch `weekly/YYYY-MM-DD`.
2. Read `data/cake.json`, `data/watchlist.json`, `data/live.json`, `data/checks.json`, and the most recent file in `briefings/`.
3. If an open pull request from the GitHub Action exists (`data/weekly-*`), read its FLAG and ERROR lines.

## 2. Research the past 7 days
Search the web for each of these separately (one query per item, not combined):
- Capex guidance changes from Amazon, Microsoft, Alphabet, Meta, Oracle
- Data center M&A, joint ventures, and large leases
- Private credit and bond financings for data centers or GPUs
- Power purchase agreements and utility load announcements tied to data centers
- Chip news: NVIDIA, Broadcom, AMD, TSMC, HBM supply, export controls
- Model pricing changes and frontier lab funding rounds
- AI-related IPOs, acquisitions, delistings, and ticker changes (for the watchlist)
- Neocloud financing and stress (CoreWeave, Nebius); BDC discounts to NAV

Earnings seasons (mid-January to February, mid-April to May, mid-July to August, mid-October to November) get extra depth on capex, cloud revenue, and AI revenue run-rates.

## 3. Trust stack (non-negotiable)
- **Tiers.** T1: SEC filings, company earnings releases and press releases, government data. T2: S&P Global, Synergy, FT, Bloomberg, Reuters, WSJ. T3: everything else.
- **Every new fact gets a source.** Add the source to `sources` with title, URL, and tier, then cite its key.
- **Two-source rule.** A T2 or T3 number goes into `facts` or `deals` only when two independent sources agree within about 10%. Two articles that trace back to the same original count as one source.
- **Contested panel.** Numbers that disagree, or rest on one source, go into `capital.contested` with the competing values and why.
- **Never overwrite T1 with a lower tier.** If a newsletter disagrees with a filing, the filing wins and the disagreement goes to contested if it matters.
- **Big moves need a filing.** Any change of more than 25% to an existing figure needs a T1 source.
- **Be suspicious of fluent research sites.** Some publish AI-generated "research" with internally inconsistent totals and wrong dates. Check dates against known events.
- **Stale beats wrong.** If you cannot verify something, leave the old value and note it in the briefing.

## 4. Update the data
- `cake.json`
  - `capex.rows`: update guidance only from the company's own release or call (T1).
  - `capital.facts`, `capital.deals`, `capital.contested`: add the week's verified items. Keep the deals table to the 12 largest or most instructive; move older ones out.
  - `cycle.signals`: update each status (`build`, `watch`, `warn`, `bad`, `pending`) and value. Update `high-yield credit spreads` from `live.json`. Change `current_stage` or `position` only with a one-line reason in the briefing.
  - `cycle.bottleneck`: change only when the evidence clearly shifts.
  - `questions`: add 3 to 5 new questions drawn from this week's verified news. Use the next free id (`q31`, `q32`…), a layer, a level (Recall, Explain, Apply, Analyze, Predict), 4 options, the answer index, and a `why` that teaches.
  - `meta.last_verified`: today's date.
- `watchlist.json`: add, rename, or remove tickers for IPOs, acquisitions, and delistings. Set `as_of`.
- Run `python3 scripts/validate.py`. Fix every problem before committing.
- Never add personal holdings or account details to the repo.

## 5. Write the briefing
Create `briefings/YYYY-MM-DD.md`, one page, plain language:
1. **The week in one paragraph.**
2. **By layer:** energy, chips, infrastructure, models, applications, capital. One to three bullets each; skip quiet layers.
3. **Money in vs money out:** latest actual capex from `live.json` vs revenue signals.
4. **Cycle clock:** stage, any signal changes, and why.
5. **Exit rules tripped:** check every layer's `exit_rules` against the week's evidence. Say plainly if none tripped.
6. **Contested this week.**
7. **Three predictions to log** before the next earnings dates, each with a suggested probability.
8. **Sources** as markdown links.

## 6. Deliver
Commit (`Weekly update YYYY-MM-DD`), push the branch, and open a pull request titled `Weekly update YYYY-MM-DD` whose body is the briefing.
If the push or pull request fails, put the briefing text in your final message so it is not lost.
