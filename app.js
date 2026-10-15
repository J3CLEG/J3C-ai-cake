/* J3C AI Cake — single-page app. No build step, no dependencies.
   Data: data/cake.json (framework, facts, quizzes), data/watchlist.json, data/holdings.json (example).
   Personal progress is saved in this browser only (localStorage). Use Train > Progress to export/import. */
(function () {
  "use strict";

  const LAYER_ORDER = ["applications", "models", "infrastructure", "chips", "energy"];
  const ALL_LAYERS = ["energy", "chips", "infrastructure", "models", "applications", "capital"];
  const LNAME = { company: "Companies", energy: "Energy", chips: "Chips", infrastructure: "Infrastructure", models: "Models", applications: "Applications", capital: "Capital (plate)", plate: "Plate", demand: "Demand" };
  const STORE_KEY = "j3c-ai-cake-v1";

  let D = null, W = null, H = null;          // cake, watchlist, example holdings
  let LIVE = null;                            // data/live.json from the weekly Tier 1 pull (optional)
  let CO = {}, FUND = {};                     // researched company profiles; SEC financials
  let WL = {};                                // ticker -> watchlist item
  let state = { mode: "simple", sel: "energy", layerSel: "energy", wlFilter: "all", wlQuery: "", train: "quiz" };
  let store = loadStore();

  // ---------- utilities ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cvar = (layer) => `var(--${layer === "plate" ? "capital" : layer === "company" ? "focus" : layer})`;
  const fmtUSD = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const pct = (n) => (n * 100).toFixed(0) + "%";

  function loadStore() {
    const base = { attempts: [], srs: {}, predictions: [], drills: [], scenarios: [], holdings: null };
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return Object.assign(base, JSON.parse(raw)); } catch (e) {}
    return base;
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {} }
  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }
  function tierBadge(srcKey, tierOverride) {
    const src = srcKey && D.sources[srcKey];
    const tier = tierOverride || (src && src.tier) || 3;
    const label = "T" + tier;
    const title = esc(D.meta.tiers[tier] || "");
    if (src) return `<a class="tier t${tier}" href="${esc(src.url)}" target="_blank" rel="noopener" title="${title}">${label} · ${esc(src.title)}</a>`;
    return `<span class="tier t${tier}" title="${title}">${label}</span>`;
  }
  function factList(facts) {
    if (!facts || !facts.length) return "";
    return `<div>${facts.map((f) => `<div class="fact"><p>${esc(f.text)}</p><div class="meta">${tierBadge(f.source, f.tier)}${f.as_of ? `<span class="mono">as of ${esc(f.as_of)}</span>` : ""}</div></div>`).join("")}</div>`;
  }
  function tickerChips(list) {
    return `<div class="chips">${list.map((t) => tkLink(t)).join("")}</div>`;
  }
  const layerById = (id) => D.layers.find((l) => l.id === id);
  function tkLink(t) { const w = WL[t]; return `<a class="tk tklink" href="#c-${esc(t)}" title="${esc(w ? w.name + " — " + w.role : t)}">${esc(t)}</a>`; }

  // ---------- boot ----------
  async function boot() {
    try {
      const [c, w, h] = await Promise.all(["data/cake.json", "data/watchlist.json", "data/holdings.json"].map((u) => fetch(u, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); })));
      D = c; W = w; H = h;
      W.items.forEach((i) => { WL[i.t] = i; });
      try { const r = await fetch("data/live.json", { cache: "no-store" }); if (r.ok) LIVE = await r.json(); } catch (e) { LIVE = null; }
      try { const r = await fetch("data/companies.json", { cache: "no-store" }); if (r.ok) CO = (await r.json()).items || {}; } catch (e) { CO = {}; }
      try { const r = await fetch("data/fundamentals.json", { cache: "no-store" }); if (r.ok) FUND = (await r.json()).items || {}; } catch (e) { FUND = {}; }
    } catch (e) {
      $("#main").innerHTML = `<div class="panel"><h3>Data did not load</h3><p>The page could not read its data files (${esc(e.message)}). If you opened index.html straight from your computer, serve the folder instead (for example <span class="mono">python3 -m http.server</span>) or use the hosted site.</p></div>`;
      return;
    }
    try { const m = localStorage.getItem(STORE_KEY + "-mode"); if (m === "analyst") state.mode = "analyst"; } catch (e) {}
    $("#verified").textContent = "verified " + D.meta.last_verified;
    $("#foot").innerHTML = `${esc(D.meta.disclaimer)} Framework: ${esc(D.meta.framework_origin)}. Source tiers: T1 primary filings and government data · T2 established secondary · T3 provisional.`;
    $("#mode-simple").addEventListener("click", () => setMode("simple"));
    $("#mode-analyst").addEventListener("click", () => setMode("analyst"));
    window.addEventListener("hashchange", route);
    setMode(state.mode, true);
    route();
  }
  function setMode(m, silent) {
    state.mode = m;
    $("#main").dataset.mode = m;
    $("#mode-simple").setAttribute("aria-pressed", String(m === "simple"));
    $("#mode-analyst").setAttribute("aria-pressed", String(m === "analyst"));
    try { localStorage.setItem(STORE_KEY + "-mode", m); } catch (e) {}
    if (!silent) route();
  }

  const VIEWS = { company: viewCompany, cake: viewCake, layers: viewLayers, capital: viewCapital, watchlist: viewWatchlist, portfolio: viewPortfolio, cycle: viewCycle, train: viewTrain };
  function route() {
    let h = (location.hash || "#cake").slice(1);
    if (ALL_LAYERS.includes(h) && h !== "capital") { state.layerSel = h; h = "layers"; }
    if (h.startsWith("c-") && WL[h.slice(2)]) { state.company = h.slice(2); h = "company"; }
    if (!VIEWS[h]) h = "cake";
    document.querySelectorAll("#tabs a").forEach((a) => a.setAttribute("aria-current", a.getAttribute("href") === "#" + (h === "company" ? "watchlist" : h) ? "page" : "false"));
    $("#main").innerHTML = `<div class="view">${VIEWS[h]()}</div>`;
    window.scrollTo(0, 0);
    const hook = HOOKS[h]; if (hook) hook();
  }
  const HOOKS = {};

  // ---------- CAKE ----------
  function detailFor(id) {
    if (id === "demand") {
      const d = D.demand;
      return `<div class="panel detail" style="--c:var(--demand)"><div class="swatch"></div><span class="eyebrow">Above the cake</span><h3>${esc(d.name)}: ${esc(d.tag)}</h3>
        <p class="simple-only">${esc(d.simple)}</p><p class="analyst-only">${esc(d.analyst)}</p>
        <div class="eyebrow">Watch</div><ul class="ticks">${d.metrics.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>${factList(d.facts)}</div>`;
    }
    const pl = D.plate.find((p) => p.id === id);
    if (pl) {
      return `<div class="panel detail" style="--c:var(--capital)"><div class="swatch"></div><span class="eyebrow">The plate</span><h3>${esc(pl.name)}</h3>
        <p class="simple-only">${esc(pl.simple)}</p><p class="analyst-only">${esc(pl.analyst)}</p>
        ${id === "capital" ? `<a href="#capital">Open Capital &amp; Deals →</a>` : ""}</div>`;
    }
    const l = layerById(id);
    return `<div class="panel detail" style="--c:${cvar(l.id)}"><div class="swatch"></div><span class="eyebrow">Layer ${l.n} · ${esc(l.metaphor)}</span><h3>${esc(l.name)}</h3>
      <p class="simple-only">${esc(l.simple)}</p><p class="analyst-only">${esc(l.analyst)}</p>
      <div class="eyebrow">How it makes money</div><p>${esc(l.money)}</p>
      <div class="eyebrow">Biggest public players</div>${tickerChips(l.players_public.slice(0, 10))}
      <a href="#${l.id}">Full layer brief →</a></div>`;
  }
  function viewCake() {
    const layers = LAYER_ORDER.map((id) => layerById(id));
    const core = `<button type="button" class="demand-band" data-sel="demand" aria-pressed="${state.sel === "demand"}"><span class="mono small">0</span><span><span class="nm">Demand</span> <span class="small muted">· who pays</span></span><span class="mono small muted">top</span></button>
      <div class="core" role="group" aria-label="The five layers">${layers.map((l, i) => `<button type="button" class="stratum ${i === 0 ? "s-apps" : ""}" style="--c:${cvar(l.id)}" data-sel="${l.id}" aria-pressed="${state.sel === l.id}"><span class="n">L${l.n}</span><span><span class="nm">${esc(l.name)}</span><br><span class="mt">${esc(l.metaphor)}</span></span><span class="depth">${l.id === D.cycle.bottleneck.layer ? "◆ bottleneck" : ""}</span></button>`).join("")}</div>
      <div class="plate"><span class="lbl">The plate</span><div class="row">${D.plate.map((p) => `<button type="button" data-sel="${p.id}" aria-pressed="${state.sel === p.id}">${esc(p.name)}</button>`).join("")}</div></div>`;

    const total = D.capex.rows.reduce((s, r) => s + (r.guide_low + r.guide_high) / 2, 0);
    const df = D.dollar_flow;
    const bn = D.cycle.bottleneck;
    return `
      <section class="section">
        <span class="eyebrow">Energy → chips → infrastructure → models → applications</span>
        <h2>AI is a physical stack, built from the power plant up</h2>
        <p class="lede">Tap any layer to see what it is, who the players are, and how money moves. Demand sits on top, the plate of capital and raw inputs sits underneath. Switch to Analyst for the deeper read.</p>
      </section>
      <div class="cake-wrap">
        <div>${core}</div>
        <div id="detail">${detailFor(state.sel)}</div>
      </div>
      <div class="stats">
        <div class="stat"><span class="v num">~$${Math.round(total)}B</span><span class="k">Big-four 2026 capex plans (midpoints)</span>${tierBadge("ft_tally")}</div>
        <div class="stat"><span class="v num">+${Math.round((total / D.capex.prior_year_total - 1) * 100)}%</span><span class="k">vs $${D.capex.prior_year_total}B in 2025</span>${tierBadge("ft_tally")}</div>
        <div class="stat"><span class="v" style="color:${cvar(bn.layer)}">${esc(LNAME[bn.layer])}</span><span class="k">Current bottleneck. ${esc(bn.why)}</span></div>
      </div>
      <section class="section">
        <span class="eyebrow">Follow the dollar</span>
        <h3>Where ${esc(df.start)} goes</h3>
        <p class="small muted">${esc(df.label)}</p>
        <div class="flowbar" role="img" aria-label="Split of a $20 subscription across layers">${df.steps.map((s) => `<div style="--c:${cvar(s.layer)};flex:${s.amount}">$${s.amount.toFixed(s.amount % 1 ? 2 : 0)}</div>`).join("")}</div>
        <ol class="clean flowlist">${df.steps.map((s) => `<li style="--c:${cvar(s.layer)}"><span class="amt">$${s.amount.toFixed(2)}</span><span><b>${esc(LNAME[s.layer])}.</b> ${esc(s.text)}</span></li>`).join("")}</ol>
      </section>
      <section class="section">
        <span class="eyebrow">Who's telling this story</span>
        <div class="panel"><p>The five-layer cake comes from NVIDIA's CEO, and NVIDIA sits in layer 2. The framework is useful, and it also happens to frame NVIDIA as the center of everything. Read each layer's bear case as seriously as the bull case.</p></div>
      </section>`;
  }
  HOOKS.cake = function () {
    document.querySelectorAll("[data-sel]").forEach((b) => b.addEventListener("click", () => {
      state.sel = b.dataset.sel;
      document.querySelectorAll("[data-sel]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.sel === state.sel)));
      $("#detail").innerHTML = detailFor(state.sel);
      if (window.innerWidth < 760) $("#detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
    }));
  };

  // ---------- LAYERS ----------
  function viewLayers() {
    const l = layerById(state.layerSel) || D.layers[0];
    const facts = l.facts || [];
    return `
      <section class="section">
        <span class="eyebrow">Layer briefs</span>
        <div class="chips" role="group" aria-label="Choose a layer">${D.layers.map((x) => `<button type="button" class="chip" style="--c:${cvar(x.id)}" data-layer="${x.id}" aria-pressed="${x.id === l.id}"><span class="dot"></span>L${x.n} ${esc(x.name)}</button>`).join("")}</div>
      </section>
      <section class="section" style="--c:${cvar(l.id)}">
        <span class="eyebrow">Layer ${l.n} · ${esc(l.metaphor)}</span>
        <h2 style="color:${cvar(l.id)}">${esc(l.name)}</h2>
        <p class="lede simple-only">${esc(l.simple)}</p>
        <p class="lede analyst-only">${esc(l.analyst)}</p>
      </section>
      <div class="grid2">
        <div class="panel"><span class="eyebrow">How it makes money</span><p>${esc(l.money)}</p></div>
        <div class="panel"><span class="eyebrow">Chokepoints</span><ul class="ticks">${l.chokepoints.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
        <div class="panel"><span class="eyebrow">Public players</span>${tickerChips(l.players_public)}<span class="eyebrow">Private players</span><ul class="ticks">${l.players_private.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
        <div class="panel"><span class="eyebrow">Numbers to watch</span><ul class="ticks">${l.metrics.map((m) => `<li>${esc(m)}</li>`).join("")}</ul><span class="eyebrow">US vs China</span><p>${esc(l.us_china)}</p></div>
      </div>
      <div class="grid2">
        <div class="panel case" style="--c:var(--good)"><span class="eyebrow">Bull case</span><p>${esc(l.bull)}</p></div>
        <div class="panel case" style="--c:var(--bad)"><span class="eyebrow">Bear case</span><p>${esc(l.bear)}</p></div>
      </div>
      <div class="panel analyst-only"><span class="eyebrow">My exit rules for this layer</span><ul class="ticks">${l.exit_rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul><p class="small muted">Written in advance. The weekly agent flags any that trip.</p></div>
      ${facts.length ? `<div class="panel"><span class="eyebrow">Verified facts</span>${factList(facts)}</div>` : ""}
      <section class="section">
        <span class="eyebrow">The plate under every layer</span>
        <div class="grid3">${D.plate.map((p) => `<div class="panel"><h3>${esc(p.name)}</h3><p class="simple-only">${esc(p.simple)}</p><p class="analyst-only">${esc(p.analyst)}</p></div>`).join("")}</div>
      </section>
      <p><a href="#train">Test yourself on ${esc(l.name)} →</a></p>`;
  }
  HOOKS.layers = function () {
    document.querySelectorAll("[data-layer]").forEach((b) => b.addEventListener("click", () => { state.layerSel = b.dataset.layer; history.replaceState(null, "", "#" + b.dataset.layer); route(); }));
  };

  // ---------- CAPITAL ----------
  function viewCapital() {
    const cx = D.capex;
    const max = Math.max(...cx.rows.map((r) => r.guide_high)) * 1.1;
    const total = cx.rows.reduce((s, r) => s + (r.guide_low + r.guide_high) / 2, 0);
    const C = D.capital;
    return `
      <section class="section">
        <span class="eyebrow">The plate · capital</span>
        <h2>Where the money is going</h2>
        <p class="lede">Deal flow shows where investors expect value to land. It does not prove value will land there. Compare money going in with revenue coming out.</p>
      </section>
      <section class="section">
        <h3>2026 hyperscaler capex guidance</h3>
        <div class="panel">
          <div class="capex">${cx.rows.map((r) => `<div class="row"><span class="lab"><b>${esc(r.company)}</b></span><span class="track" title="${esc(r.note)}"><span class="bar" style="width:${(r.guide_low / max) * 100}%"></span>${r.guide_high > r.guide_low ? `<span class="range" style="left:${(r.guide_low / max) * 100}%;width:${((r.guide_high - r.guide_low) / max) * 100}%"></span>` : ""}</span><span class="num small" style="text-align:right">$${r.guide_low}${r.guide_high > r.guide_low ? "–" + r.guide_high : ""}B</span></div>`).join("")}</div>
          <p class="small"><b class="num">~$${Math.round(total)}B</b> combined at midpoints, vs <span class="num">$${cx.prior_year_total}B</span> in 2025. Hatched area is the guidance range.</p>
          <div>${cx.rows.map((r) => `<div class="fact"><p class="small"><b>${esc(r.company)}:</b> ${esc(r.note)}</p><div class="meta">${tierBadge(r.source, r.tier)}</div></div>`).join("")}</div>
          <p class="small muted">Guidance, not money spent. The weekly agent checks actual capex in SEC filings (tags: ${cx.edgar_tags.map(esc).join(", ")}).</p>
        </div>
        ${actualsPanel()}
        <div class="panel"><span class="eyebrow">Context</span>${factList(cx.context)}</div>
      </section>
      <section class="section">
        <h3>Deal flow and financing</h3>
        <div class="panel">${factList(C.facts)}</div>
        <div class="tablebox"><table>
          <thead><tr><th>Deal</th><th>Value</th><th>Type</th><th>Who</th><th>Layer</th><th>Date</th><th>Source</th></tr></thead>
          <tbody>${C.deals.map((d) => `<tr><td><b>${esc(d.name)}</b></td><td class="num">$${d.value_b}B</td><td>${esc(d.type)}</td><td class="small">${esc(d.buyers)}</td><td><span class="pill" style="--c:${cvar(d.layer)}">${esc(LNAME[d.layer])}</span></td><td class="mono small">${esc(d.date)}</td><td>${tierBadge(d.source, d.tier)}</td></tr>`).join("")}</tbody>
        </table></div>
      </section>
      <section class="section">
        <h3>Contested numbers</h3>
        <p class="lede">These figures disagree across sources or rest on one source. They stay out of charts until two independent Tier 2 sources agree within about 10%.</p>
        <div class="grid2">${C.contested.map((c) => `<div class="panel contested"><span class="eyebrow">Contested</span><b>${esc(c.topic)}</b><div class="chips">${c.values.map((v) => `<span class="tk">${esc(v)}</span>`).join("")}</div><p class="small">${esc(c.why)}</p><div>${tierBadge(c.source, c.tier)}</div></div>`).join("")}</div>
      </section>
      <section class="section">
        <h3>Biggest players on the plate</h3>
        <div class="grid2">${C.groups.map((g) => `<div class="panel"><span class="eyebrow">${esc(g.name)}</span>${tickerChips(g.tickers)}${g.private.length ? `<ul class="ticks small">${g.private.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : `<p class="small muted">Watch their discount to net asset value. A widening discount is an early stress signal.</p>`}</div>`).join("")}</div>
      </section>
      <section class="section" style="--c:var(--infrastructure)">
        <span class="eyebrow">Deep dive</span>
        <h3>Data centers</h3>
        <p class="lede">${esc(D.data_centers.simple)}</p>
        <div class="grid2">
          <div class="panel"><span class="eyebrow">Watch</span><ul class="ticks">${D.data_centers.watch.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>
          <div class="panel"><span class="eyebrow">Verified facts</span>${factList(D.data_centers.facts)}</div>
        </div>
      </section>`;
  }

  function actualsPanel() {
    if (!LIVE || !LIVE.edgar || !Object.keys(LIVE.edgar).length) return `<div class="panel"><span class="eyebrow">Actual capex from filings</span><p class="muted">The weekly SEC pull has not run yet. Actual quarterly capex appears here after the first run.</p></div>`;
    const names = { AMZN: "Amazon", MSFT: "Microsoft", GOOGL: "Alphabet", META: "Meta", ORCL: "Oracle" };
    const tick = Object.keys(LIVE.edgar);
    const qkey = (e) => e.slice(0, 4) + "-Q" + Math.ceil(Number(e.slice(5, 7)) / 3);
    const byQ = {}; // company -> quarter key -> fact
    tick.forEach((t) => { byQ[t] = {}; Object.entries(LIVE.edgar[t].capex || {}).forEach(([e, v]) => { byQ[t][qkey(e)] = v; }); });
    const counts = {}; tick.forEach((t) => Object.keys(byQ[t]).forEach((k) => (counts[k] = (counts[k] || 0) + 1)));
    const ends = Object.keys(counts).filter((k) => counts[k] >= 2).sort().slice(-4);
    const qlabel = (k) => k.slice(5) + " " + k.slice(0, 4);
    const latest = (o) => { const k = Object.keys(o || {}).sort(); return k.length ? o[k[k.length - 1]].value : null; };
    const b = (v) => (v == null ? "—" : "$" + (v / 1e9).toFixed(1) + "B");
    return `<div class="panel"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline"><span class="eyebrow">Actual capex from SEC filings, by calendar quarter</span><span class="tier t1">T1 · SEC EDGAR · pulled ${esc((LIVE.generated || "").slice(0, 10))}</span></div>
      <div class="tablebox"><table><thead><tr><th>Company</th>${ends.map((e) => `<th style="text-align:right">${qlabel(e)}</th>`).join("")}<th style="text-align:right">Capex ÷ depreciation</th></tr></thead>
      <tbody>${tick.map((t) => { const x = LIVE.edgar[t]; const cap = latest(x.capex), da = latest(x.da); const ratio = cap && da ? (cap / da).toFixed(1) + "×" : "—"; return `<tr><td><b>${esc(names[t] || t)}</b>${x.stale ? ` <span class="status warn">stale</span>` : ""}</td>${ends.map((k) => { const v = byQ[t][k]; return `<td class="num">${v ? b(v.value) : "—"}</td>`; }).join("")}<td class="num">${ratio}</td></tr>`; }).join("")}</tbody></table></div>
      <p class="small muted">Rebuilt from year-to-date cash flow statements. Oracle's fiscal quarters end a month earlier and sit in the nearest calendar quarter. Columns appear once at least two companies have filed. Capex running far above depreciation means today's spending will hit earnings for years; a high ratio is the depreciation wave to come.</p></div>`;
  }

  // ---------- COMPANY ----------
  const CUR = { USD: "$", EUR: "€", JPY: "¥", CNY: "CN¥", KRW: "₩", TWD: "NT$", CAD: "C$", GBP: "£" };
  function fmtB(v, cur) {
    if (v == null || isNaN(v)) return "—";
    const sym = CUR[cur] || (cur ? cur + " " : "");
    const a = Math.abs(v), sign = v < 0 ? "−" : "";
    if (a >= 1000) return sign + sym + (a / 1000).toFixed(1) + "T";
    if (a === 0) return sym + "0";
    return sign + sym + (a >= 10 ? a.toFixed(1) : a >= 0.1 ? a.toFixed(2) : a.toFixed(3)) + "B";
  }
  const segPos = (c) => (c.segments || []).filter((x) => (x.revenue_b || 0) > 0);
  function sourcesList(list) {
    return `<ul class="clean">${(list || []).map((x) => `<li>${/^https?:/.test(x.url || "") ? `<a class="tier t${x.tier || 3}" href="${esc(x.url)}" target="_blank" rel="noopener">T${x.tier || 3} · ${esc(x.title)}</a>` : `<span class="tier t${x.tier || 3}">T${x.tier || 3} · ${esc(x.title)}</span>`}</li>`).join("")}</ul>`;
  }
  function secTable(f) {
    if (!f || !f.revenue) return `<p class="muted small">This company does not file with the SEC. Figures above come from its own annual report.</p>`;
    const cur = f.revenue.currency;
    const rows = [["Revenue", "revenue"], ["Operating income", "operating_income"], ["Net income", "net_income"], ["Operating cash flow", "operating_cash_flow"], ["Capex", "capex"], ["R&D", "rnd"]];
    const val = (k, per) => (f[k] && f[k][per] ? f[k][per].value / 1e9 : null);
    const hasTTM = !!f.revenue.ttm;
    const fyEnd = f.revenue.fy.end, ttmEnd = hasTTM ? f.revenue.ttm.end : null;
    const per = (k) => (f[k] && f[k].fy && f[k].fy.end === fyEnd ? "fy" : null);
    const cell = (k, p) => { const v = p === "fy" ? (per(k) ? val(k, "fy") : null) : (f[k] && f[k].ttm && f[k].ttm.end === ttmEnd ? val(k, "ttm") : null); return v; };
    const pctOf = (v, r) => (v != null && r ? ` <span class="muted small">${Math.round((v / r) * 100)}%</span>` : "");
    const fcf = (p) => { const o = cell("operating_cash_flow", p), c = cell("capex", p); return o != null && c != null ? o - c : null; };
    const line = (label, k, p, showPct) => { const v = cell(k, p); return `<td class="num">${fmtB(v, cur)}${showPct ? pctOf(v, cell("revenue", p)) : ""}</td>`; };
    return `<div class="tablebox"><table><thead><tr><th>SEC filings</th><th style="text-align:right">Fiscal year to ${esc(fyEnd)}</th>${hasTTM ? `<th style="text-align:right">Last 12 months to ${esc(ttmEnd)}</th>` : ""}</tr></thead><tbody>
      ${rows.map(([lab, k]) => `<tr><td>${lab}${k === "operating_income" || k === "rnd" ? ` <span class="muted small">(% of revenue)</span>` : ""}</td>${line(lab, k, "fy", k === "operating_income" || k === "rnd")}${hasTTM ? line(lab, k, "ttm", k === "operating_income" || k === "rnd") : ""}</tr>`).join("")}
      <tr><td><b>Free cash flow</b> <span class="muted small">(cash flow − capex)</span></td><td class="num"><b>${fmtB(fcf("fy"), cur)}</b></td>${hasTTM ? `<td class="num"><b>${fmtB(fcf("ttm"), cur)}</b></td>` : ""}</tr>
    </tbody></table></div>
    <div class="meta small" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><a class="tier t1" href="${esc(f.filings)}" target="_blank" rel="noopener">T1 · SEC EDGAR filings</a>${f.stale ? `<span class="status warn">stale</span>` : ""}<span class="muted">Last 12 months adds the four latest quarters. A dash means the company does not report that line in a standard way.</span></div>`;
  }
  function viewCompany() {
    const t = state.company, w = WL[t], c = CO[t], f = FUND[t];
    const mix = w.mix || { [w.layer]: 1 };
    const peers = W.items.filter((i) => i.layer === w.layer);
    const idx = peers.findIndex((i) => i.t === t), next = peers[(idx + 1) % peers.length];
    const head = `
      <section class="section">
        <a href="#watchlist" class="small">← Watchlist</a>
        <span class="eyebrow">${esc(t)} · ${esc(w.region)}${c ? " · " + esc(c.fiscal_period) : ""}</span>
        <h2>${esc(c ? c.name : w.name)}</h2>
        <div class="chips">${Object.keys(mix).sort((a, b) => mix[b] - mix[a]).map((k) => `<a class="pill" style="--c:${cvar(k)};text-decoration:none" href="#${k === "capital" ? "capital" : k}">${esc(LNAME[k])}${Object.keys(mix).length > 1 ? " " + Math.round(mix[k] * 100) + "%" : ""}</a>`).join("")}${w.speculative ? `<span class="status warn">speculative</span>` : ""}</div>
        <p class="lede">${esc(w.role)}</p>
      </section>`;
    if (!c) return head + `<div class="panel"><p>No profile yet. The weekly agent adds one from the company's next annual report.</p></div>`;
    const pos = segPos(c).slice().sort((a, b) => b.revenue_b - a.revenue_b);
    const posSum = pos.reduce((s2, x) => s2 + x.revenue_b, 0);
    const recon = (c.segments || []).filter((x) => (x.revenue_b || 0) < 0);
    const nulls = (c.segments || []).filter((x) => !x.revenue_b);
    const top = pos[0];
    return head + `
      <div class="stats">
        <div class="stat"><span class="v num">${fmtB(c.revenue_total_b, c.currency)}</span><span class="k">Revenue, ${esc(c.fiscal_period)}</span></div>
        <div class="stat"><span class="v" style="font-size:1.5rem">${esc(c.revenue_model)}</span><span class="k">Revenue model</span></div>
        ${top && posSum ? `<div class="stat"><span class="v num">${Math.round((top.revenue_b / posSum) * 100)}%</span><span class="k">from ${esc(top.name)}</span></div>` : ""}
      </div>
      <div class="panel"><span class="eyebrow">How it makes money</span><p>${esc(c.how_it_makes_money)}</p></div>
      <section class="section">
        <h3>Revenue by business</h3>
        <p class="small muted">${esc(c.segment_basis)} · billions of ${esc(c.currency)}</p>
        <div class="panel segs" style="--c:${cvar(w.layer)}">${pos.map((x) => `<div class="seg"><div class="seg-top"><b>${esc(x.name)}</b><span class="num">${fmtB(x.revenue_b, c.currency)} <span class="muted small">${Math.round((x.revenue_b / posSum) * 100)}%</span></span></div><div class="seg-track"><div style="width:${Math.max(1, (x.revenue_b / pos[0].revenue_b) * 100)}%"></div></div><p class="small muted">${esc(x.what)}</p></div>`).join("")}
          ${recon.length ? `<p class="small muted">${recon.map((x) => `${esc(x.name)}: ${fmtB(x.revenue_b, c.currency)}`).join(" · ")}. This line reconciles segment sales (which can include sales between the company's own units) to reported revenue. Percentages are shares of segment sales.</p>` : ""}
          ${nulls.length ? `<p class="small muted">No revenue reported for: ${nulls.map((x) => esc(x.name)).join(", ")}. ${nulls.map((x) => esc(x.what)).join(" ")}</p>` : ""}
        </div>
      </section>
      <section class="section">
        <h3>Financials from SEC filings</h3>
        ${secTable(f)}
      </section>
      <div class="grid2">
        <div class="panel" style="--c:${cvar(w.layer)}"><span class="eyebrow">AI exposure</span><p>${esc(c.ai_exposure)}</p></div>
        <div class="panel"><span class="eyebrow">Customers</span><p>${esc(c.customers)}</p></div>
        <div class="panel"><span class="eyebrow">Watch next earnings</span><ul class="ticks">${(c.watch || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div class="panel"><span class="eyebrow">Risks</span><ul class="ticks">${(c.risks || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      </div>
      <div class="panel" id="co-check"></div>
      <div class="grid2">
        <div class="panel"><span class="eyebrow">Sources</span>${sourcesList(c.sources)}</div>
        ${c.notes ? `<div class="panel"><span class="eyebrow">Data notes</span><p class="small">${esc(c.notes)}</p></div>` : ""}
      </div>
      <p><a href="#c-${esc(next.t)}">Next in ${esc(LNAME[w.layer])}: ${esc(next.name)} →</a></p>`;
  }
  HOOKS.company = function () { const el = $("#co-check"); if (el) renderCoCheck(el, state.company); };

  // Company knowledge check: questions generated from the company's own data
  function coQuestions(t) {
    const c = CO[t], w = WL[t]; const qs = [];
    const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((a2, b) => a2[0] - b[0]).map((x) => x[1]);
    const pos = c ? segPos(c).slice().sort((a, b) => b.revenue_b - a.revenue_b) : [];
    if (pos.length >= 2) {
      const opts = shuffle(pos.slice(0, 4).map((x) => x.name));
      qs.push({ id: `co-${t}-seg`, q: `Which business brings in the most revenue at ${c.name}?`, options: opts, a: opts.indexOf(pos[0].name), why: `${pos[0].name}: ${fmtB(pos[0].revenue_b, c.currency)} in ${c.fiscal_period}. ${pos[0].what}` });
      const sum = pos.reduce((s2, x) => s2 + x.revenue_b, 0), share = pos[0].revenue_b / sum;
      const buckets = ["Under 25%", "25% to 50%", "50% to 75%", "Over 75%"];
      qs.push({ id: `co-${t}-share`, q: `Roughly what share of ${c.name}'s segment sales comes from ${pos[0].name}?`, options: buckets, a: Math.min(3, Math.floor(share * 4)), why: `About ${Math.round(share * 100)}%. ${share > 0.75 ? "One business carries the company, so its fortunes ride on that market." : share > 0.5 ? "One business dominates, but others add some balance." : "Revenue is spread out, which cushions any single market."}` });
    }
    const others = shuffle(ALL_LAYERS.filter((l) => l !== w.layer)).slice(0, 3);
    const lopts = shuffle([w.layer, ...others]);
    qs.push({ id: `co-${t}-layer`, q: `Where does ${c ? c.name : w.name} mainly sit on the cake?`, options: lopts.map((l) => LNAME[l]), a: lopts.indexOf(w.layer), why: `${LNAME[w.layer]}. ${w.role}.${w.mix ? " It also spans " + Object.keys(w.mix).filter((k) => k !== w.layer).map((k) => LNAME[k]).join(", ") + "." : ""}` });
    return qs;
  }
  function renderCoCheck(el, t, onNext) {
    const qs = coQuestions(t); let i = 0, right = 0;
    const draw = () => {
      const name = CO[t] ? CO[t].name : WL[t].name;
      if (i >= qs.length) {
        el.innerHTML = `<span class="eyebrow">Check yourself · ${esc(name)}</span><p><b>${right} of ${qs.length} right.</b> ${right === qs.length ? "You know how this company makes money." : "Reread the revenue breakdown above, then try again."}</p><div class="chips"><button type="button" class="btn ghost" id="cc-again">Try again</button>${onNext ? `<button type="button" class="btn" id="cc-next">Another company</button>` : ""}</div>`;
        $("#cc-again", el).addEventListener("click", () => renderCoCheck(el, t, onNext));
        if (onNext) $("#cc-next", el).addEventListener("click", onNext);
        return;
      }
      const q = qs[i];
      el.innerHTML = `<span class="eyebrow">Check yourself · ${esc(name)} · ${i + 1} of ${qs.length}</span><p class="q">${esc(q.q)}</p><div class="opts">${q.options.map((o, k) => `<button type="button" class="opt" data-co="${k}">${String.fromCharCode(65 + k)}. ${esc(o)}</button>`).join("")}</div><div class="cc-why"></div>`;
      el.querySelectorAll("[data-co]").forEach((b) => b.addEventListener("click", () => {
        const k = Number(b.dataset.co), ok = k === q.a; if (ok) right++;
        store.attempts.push({ id: q.id, layer: "company", ok, conf: 0.7, at: Date.now() }); save();
        el.querySelectorAll("[data-co]").forEach((x) => { const kk = Number(x.dataset.co); x.disabled = true; if (kk === q.a) x.classList.add("right"); else if (kk === k) x.classList.add("wrong"); });
        $(".cc-why", el).innerHTML = `<div class="why"><b style="color:${ok ? "var(--good)" : "var(--bad)"}">${ok ? "Correct." : "Not quite."}</b> ${esc(q.why)}</div><div style="margin-top:10px"><button type="button" class="btn" id="cc-n">${i + 1 < qs.length ? "Next question" : "See result"}</button></div>`;
        $("#cc-n", el).addEventListener("click", () => { i++; draw(); });
      }));
    };
    draw();
  }

  // ---------- WATCHLIST ----------
  function viewWatchlist() {
    return `
      <section class="section">
        <span class="eyebrow">Master watchlist · as of ${esc(W.as_of)}</span>
        <h2>${W.items.length} public names across the cake and plate</h2>
        <p class="lede">${esc(W.note)}</p>
        <div class="chips" role="group" aria-label="Filter by layer"><button type="button" class="chip" data-f="all" aria-pressed="${state.wlFilter === "all"}">All</button>${ALL_LAYERS.map((l) => `<button type="button" class="chip" style="--c:${cvar(l)}" data-f="${l}" aria-pressed="${state.wlFilter === l}"><span class="dot"></span>${esc(LNAME[l])}</button>`).join("")}</div>
        <div class="field" style="max-width:340px"><label for="wl-q" class="eyebrow">Search ticker, name, or role</label><input id="wl-q" type="search" value="${esc(state.wlQuery)}" placeholder="e.g. HBM, nuclear, BDC"></div>
      </section>
      <div class="tablebox"><table>
        <thead><tr><th>Ticker</th><th>Name</th><th>Layer</th><th>Role</th><th>Also in</th><th>Region</th></tr></thead>
        <tbody id="wl-body"></tbody>
      </table></div>`;
  }
  function wlRows() {
    const q = state.wlQuery.trim().toLowerCase();
    const rows = W.items.filter((i) => (state.wlFilter === "all" || i.layer === state.wlFilter || (i.mix && i.mix[state.wlFilter])) && (!q || (i.t + " " + i.name + " " + i.role).toLowerCase().includes(q)));
    $("#wl-body").innerHTML = rows.map((i) => {
      const also = i.mix ? Object.keys(i.mix).filter((k) => k !== i.layer).map((k) => `<span class="pill" style="--c:${cvar(k)}">${esc(LNAME[k])}</span>`).join(" ") : "";
      return `<tr><td>${tkLink(i.t)}</td><td><a class="rowlink" href="#c-${esc(i.t)}">${esc(i.name)}</a>${i.speculative ? ` <span class="status warn">speculative</span>` : ""}</td><td><span class="pill" style="--c:${cvar(i.layer)}">${esc(LNAME[i.layer])}</span></td><td class="small">${esc(i.role)}</td><td>${also}</td><td class="mono small">${esc(i.region)}</td></tr>`;
    }).join("") || `<tr><td colspan="6" class="muted">No matches. Try another word or clear the filter.</td></tr>`;
  }
  HOOKS.watchlist = function () {
    wlRows();
    document.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { state.wlFilter = b.dataset.f; document.querySelectorAll("[data-f]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.f === state.wlFilter))); wlRows(); }));
    $("#wl-q").addEventListener("input", (e) => { state.wlQuery = e.target.value; wlRows(); });
  };

  // ---------- PORTFOLIO ----------
  function positions() { return store.holdings || H.positions.map((p) => ({ t: p.t, value: p.value })); }
  function exposure(pos) {
    const byLayer = {}; ALL_LAYERS.forEach((l) => (byLayer[l] = 0));
    let total = 0; const unmapped = []; const rows = [];
    pos.forEach((p) => {
      const v = Number(p.value) || 0; if (!p.t || v <= 0) return;
      const t = p.t.trim().toUpperCase(); total += v;
      const w = WL[t];
      if (!w) { unmapped.push({ t, v }); return; }
      const mix = w.mix || { [w.layer]: 1 };
      Object.keys(mix).forEach((k) => (byLayer[k] += v * mix[k]));
      rows.push({ t, v, w });
    });
    return { byLayer, total, unmapped, rows };
  }
  function viewPortfolio() {
    const isExample = !store.holdings;
    return `
      <section class="section">
        <span class="eyebrow">Portfolio map</span>
        <h2>Where your money sits on the cake</h2>
        <p class="lede">Enter tickers and dollar values. Names that span layers are split using the watchlist mix (Microsoft counts partly as infrastructure, models, and apps). Saved in this browser only.</p>
        ${isExample ? `<p><span class="example">EXAMPLE POSITIONS</span> <span class="small muted">Replace these with your own.</span></p>` : ""}
      </section>
      <div class="grid2">
        <div class="panel">
          <span class="eyebrow">Positions</span>
          <div id="pos-list" class="drill-grid"></div>
          <div class="chips"><button type="button" class="btn ghost" id="pos-add">Add row</button><button type="button" class="btn" id="pos-save">Save positions</button><button type="button" class="btn ghost" id="pos-reset">Restore example</button></div>
        </div>
        <div class="panel" id="pos-out"></div>
      </div>`;
  }
  function renderPositionsEditor(pos) {
    $("#pos-list").innerHTML = pos.map((p, i) => `<div class="pos-row"><input id="pt-${i}" aria-label="Ticker ${i + 1}" value="${esc(p.t)}" placeholder="Ticker" autocapitalize="characters"><input id="pv-${i}" aria-label="Dollar value ${i + 1}" inputmode="decimal" value="${esc(p.value)}" placeholder="$ value"><button type="button" class="iconbtn" data-del="${i}" aria-label="Remove row ${i + 1}">×</button></div>`).join("");
    document.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { const cur = readEditor(); cur.splice(Number(b.dataset.del), 1); renderPositionsEditor(cur); renderExposure(cur); }));
    document.querySelectorAll("#pos-list input").forEach((inp) => inp.addEventListener("input", () => renderExposure(readEditor())));
  }
  function readEditor() {
    const out = []; let i = 0;
    while ($("#pt-" + i)) { out.push({ t: $("#pt-" + i).value.trim().toUpperCase(), value: Number(String($("#pv-" + i).value).replace(/[$,]/g, "")) || 0 }); i++; }
    return out;
  }
  function renderExposure(pos) {
    const ex = exposure(pos);
    if (!ex.total) { $("#pos-out").innerHTML = `<span class="eyebrow">Exposure</span><p class="muted">Add a ticker and a dollar value to see your exposure by layer.</p>`; return; }
    const mapped = ex.total - ex.unmapped.reduce((s, u) => s + u.v, 0);
    const layers = ALL_LAYERS.map((l) => ({ l, v: ex.byLayer[l], s: mapped ? ex.byLayer[l] / mapped : 0 }));
    const flags = [];
    const top = ex.rows.slice().sort((a, b) => b.v - a.v)[0];
    if (top && top.v / ex.total > 0.25) flags.push(`${top.t} is ${pct(top.v / ex.total)} of the portfolio. One name drives your result.`);
    layers.forEach((x) => { if (x.s > 0.4) flags.push(`${LNAME[x.l]} is ${pct(x.s)} of mapped exposure. The cake can be right while one layer is wrong.`); });
    const zero = layers.filter((x) => x.s === 0 && x.l !== "capital").map((x) => LNAME[x.l]);
    if (zero.length) flags.push(`No exposure to ${zero.join(", ")}.`);
    const bn = D.cycle.bottleneck.layer;
    const bnS = layers.find((x) => x.l === bn).s;
    const exposedRules = layers.filter((x) => x.s >= 0.15 && x.l !== "capital").map((x) => layerById(x.l));
    $("#pos-out").innerHTML = `
      <span class="eyebrow">Exposure by layer · ${fmtUSD(ex.total)} total</span>
      <div class="stackbar" role="img" aria-label="Exposure by layer">${layers.filter((x) => x.s > 0).map((x) => `<div style="--c:${cvar(x.l)};flex:${x.s}" title="${esc(LNAME[x.l])} ${pct(x.s)}"></div>`).join("")}</div>
      <div class="legend">${layers.map((x) => `<div class="li" style="--c:${cvar(x.l)}"><span class="sw"></span><span>${esc(LNAME[x.l])}</span><span class="num" style="text-align:right">${pct(x.s)}</span></div>`).join("")}</div>
      <div class="flag ${bnS >= 0.1 ? "ok" : ""}">Current bottleneck is ${esc(LNAME[bn])}; you hold ${pct(bnS)} there.</div>
      ${flags.map((f) => `<div class="flag">${esc(f)}</div>`).join("")}
      <span class="eyebrow">Your companies</span><div class="chips">${ex.rows.sort((a, b) => b.v - a.v).map((r) => tkLink(r.t)).join("")}</div>
      ${ex.unmapped.length ? `<div class="flag">Not on the watchlist, so not mapped: ${ex.unmapped.map((u) => esc(u.t)).join(", ")}.</div>` : ""}
      ${exposedRules.length ? `<span class="eyebrow">Exit rules for layers you hold (15%+)</span>${exposedRules.map((l) => `<div><b style="color:${cvar(l.id)}">${esc(l.name)}</b><ul class="ticks small">${l.exit_rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>`).join("")}` : ""}`;
  }
  HOOKS.portfolio = function () {
    const pos = positions();
    renderPositionsEditor(pos); renderExposure(pos);
    $("#pos-add").addEventListener("click", () => { const cur = readEditor(); cur.push({ t: "", value: "" }); renderPositionsEditor(cur); $("#pt-" + (cur.length - 1)).focus(); });
    $("#pos-save").addEventListener("click", () => { store.holdings = readEditor().filter((p) => p.t); save(); toast("Positions saved in this browser"); route(); });
    $("#pos-reset").addEventListener("click", () => { store.holdings = null; save(); toast("Example positions restored"); route(); });
  };

  // ---------- CYCLE ----------
  function viewCycle() {
    const cy = D.cycle;
    const hy = LIVE && LIVE.fred && LIVE.fred.BAMLH0A0HYM2;
    if (hy) { const sig = cy.signals.find((x) => /high-yield/i.test(x.name)); if (sig && sig.status === "pending") { sig.value = `${hy.value.toFixed(2)}% on ${hy.date} (FRED). Under 4% means credit is still open.`; sig.status = hy.value < 4 ? "build" : hy.value < 6 ? "watch" : "warn"; } }
    const frac = (cy.current_stage + cy.position) / cy.stages.length; // 0..1 across the dial
    const cx = 210, cyy = 200, R = 160;
    const segColors = ["var(--good)", "var(--infrastructure)", "var(--warn)", "var(--bad)"];
    const arc = (a0, a1) => { const p = (a) => [cx - R * Math.cos(Math.PI * a), cyy - R * Math.sin(Math.PI * a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`; };
    const segs = cy.stages.map((s, i) => { const a0 = i / 4 + 0.006, a1 = (i + 1) / 4 - 0.006; const mid = (i + 0.5) / 4; const lx = cx - (R + 22) * Math.cos(Math.PI * mid), ly = cyy - (R + 22) * Math.sin(Math.PI * mid); return `<path d="${arc(a0, a1)}" stroke="${segColors[i]}" stroke-width="22" fill="none"/><text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle">${esc(s)}</text>`; }).join("");
    const nx = cx - (R - 30) * Math.cos(Math.PI * frac), ny = cyy - (R - 30) * Math.sin(Math.PI * frac);
    return `
      <section class="section">
        <span class="eyebrow">Cycle clock</span>
        <h2>${esc(cy.stages[cy.current_stage])}, late stage</h2>
        <p class="lede">${esc(cy.assessment)}</p>
      </section>
      <div class="grid2">
        <div class="panel dial"><svg viewBox="0 0 420 230" role="img" aria-label="Cycle dial pointing to ${esc(cy.stages[cy.current_stage])}">${segs}<line x1="${cx}" y1="${cyy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/><circle cx="${cx}" cy="${cyy}" r="8" fill="var(--ink)"/></svg>
          <p class="small muted">Dial position is a judgment from the signals listed here, reviewed weekly. It is not a forecast date.</p></div>
        <div class="panel"><span class="eyebrow">Signals</span>
          <ul class="clean">${cy.signals.map((s) => `<li class="fact"><div style="display:flex;gap:8px;justify-content:space-between;align-items:baseline;flex-wrap:wrap"><b>${esc(s.name)}</b><span class="status ${esc(s.status)}">${esc(s.status === "build" ? "build-out" : s.status)}</span></div><p class="small">${esc(s.value)}</p><div class="meta">${tierBadge(s.source, s.tier)}</div></li>`).join("")}</ul>
        </div>
      </div>
      <section class="section">
        <h3>Bottleneck history</h3>
        <div class="chips">${cy.bottleneck.history.map((h) => `<span class="chip" style="--c:${cvar(h.layer)}"><span class="dot"></span>${esc(h.period)}: ${esc(LNAME[h.layer])}</span>`).join("")}</div>
        <p class="lede">${esc(cy.bottleneck.why)}</p>
      </section>
      <section class="section">
        <h3>Historical analogs</h3>
        <div class="grid3">${cy.analogs.map((a) => `<div class="panel"><b>${esc(a.name)}</b><p class="small">${esc(a.lesson)}</p></div>`).join("")}</div>
      </section>`;
  }

  // ---------- TRAIN ----------
  const TRAIN_TABS = [["quiz", "Quiz"], ["company", "Company check"], ["drill", "Sort drill"], ["scenario", "Scenario lab"], ["predict", "Predictions"], ["progress", "Progress"]];
  function viewTrain() {
    return `
      <section class="section">
        <span class="eyebrow">Mastery</span>
        <h2>Prove you can use the framework</h2>
        <p class="lede">Questions climb from recall to prediction. Rate your confidence before you answer; calibration counts as much as accuracy. Missed questions come back after 1, 3, then 7 days.</p>
        <div class="subtabs" role="group" aria-label="Training mode">${TRAIN_TABS.map(([k, n]) => `<button type="button" class="chip" data-tt="${k}" aria-pressed="${state.train === k}">${n}</button>`).join("")}</div>
      </section>
      <div id="train-body"></div>`;
  }
  HOOKS.train = function () {
    document.querySelectorAll("[data-tt]").forEach((b) => b.addEventListener("click", () => { state.train = b.dataset.tt; document.querySelectorAll("[data-tt]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.tt === state.train))); renderTrain(); }));
    renderTrain();
  };
  function renderTrain() { ({ company: trainCompany, quiz: trainQuiz, drill: trainDrill, scenario: trainScenario, predict: trainPredict, progress: trainProgress })[state.train](); }

  // Quiz with confidence and spaced review
  const DAY = 86400000;
  const SRS_STEPS = [1, 3, 7, 21];
  let quiz = { filter: "all", cur: null, conf: 0.7, answered: false };
  function dueIds() { const now = Date.now(); return Object.keys(store.srs).filter((id) => store.srs[id].due <= now); }
  function pickQuestion() {
    let pool = D.questions;
    if (quiz.filter === "due") pool = pool.filter((q) => dueIds().includes(q.id));
    else if (quiz.filter !== "all") pool = pool.filter((q) => q.layer === quiz.filter);
    if (!pool.length) return null;
    const seen = new Set(store.attempts.map((a) => a.id));
    const unseen = pool.filter((q) => !seen.has(q.id) && (!quiz.cur || q.id !== quiz.cur.id));
    const src = unseen.length ? unseen : pool.filter((q) => !quiz.cur || q.id !== quiz.cur.id || pool.length === 1);
    return src[Math.floor(Math.random() * src.length)];
  }
  function trainQuiz() {
    const filters = [["all", "All"], ["due", `Due review (${dueIds().length})`], ...ALL_LAYERS.map((l) => [l, LNAME[l]]), ["plate", "Plate"]];
    if (!quiz.cur || quiz.answered) { quiz.cur = pickQuestion(); quiz.answered = false; }
    const q = quiz.cur;
    $("#train-body").innerHTML = `
      <div class="panel">
        <div class="chips" role="group" aria-label="Question set">${filters.map(([k, n]) => `<button type="button" class="chip" data-qf="${k}" aria-pressed="${quiz.filter === k}">${esc(n)}</button>`).join("")}</div>
        ${q ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill" style="--c:${cvar(q.layer)}">${esc(LNAME[q.layer])}</span><span class="status watch">${esc(q.level)}</span></div>
        <p class="q">${esc(q.q)}</p>
        <div class="conf"><span class="small muted">How sure are you?</span>${[0.5, 0.7, 0.9].map((c) => `<button type="button" class="chip" data-conf="${c}" aria-pressed="${quiz.conf === c}" ${quiz.answered ? "disabled" : ""}>${c * 100}%</button>`).join("")}</div>
        <div class="opts">${q.options.map((o, i) => `<button type="button" class="opt" data-opt="${i}">${String.fromCharCode(65 + i)}. ${esc(o)}</button>`).join("")}</div>
        <div id="q-why"></div>` : `<p class="muted">${quiz.filter === "due" ? "Nothing is due for review. Come back tomorrow or pick another set." : "No questions in this set yet."}</p>`}
      </div>`;
    document.querySelectorAll("[data-qf]").forEach((b) => b.addEventListener("click", () => { quiz.filter = b.dataset.qf; quiz.cur = null; trainQuiz(); }));
    document.querySelectorAll("[data-conf]").forEach((b) => b.addEventListener("click", () => { quiz.conf = Number(b.dataset.conf); document.querySelectorAll("[data-conf]").forEach((x) => x.setAttribute("aria-pressed", String(Number(x.dataset.conf) === quiz.conf))); }));
    document.querySelectorAll("[data-opt]").forEach((b) => b.addEventListener("click", () => answer(Number(b.dataset.opt))));
  }
  function answer(i) {
    if (quiz.answered) return;
    const q = quiz.cur; const ok = i === q.a; quiz.answered = true;
    store.attempts.push({ id: q.id, layer: q.layer, ok, conf: quiz.conf, at: Date.now() });
    const s = store.srs[q.id];
    if (!ok) store.srs[q.id] = { step: 0, due: Date.now() + SRS_STEPS[0] * DAY };
    else if (s) { const step = s.step + 1; if (step >= SRS_STEPS.length) delete store.srs[q.id]; else store.srs[q.id] = { step, due: Date.now() + SRS_STEPS[step] * DAY }; }
    save();
    document.querySelectorAll("[data-opt]").forEach((b) => { const k = Number(b.dataset.opt); b.disabled = true; if (k === q.a) b.classList.add("right"); else if (k === i) b.classList.add("wrong"); });
    document.querySelectorAll("[data-conf]").forEach((b) => (b.disabled = true));
    const overconf = !ok && quiz.conf === 0.9;
    $("#q-why").innerHTML = `<div class="why"><b style="color:${ok ? "var(--good)" : "var(--bad)"}">${ok ? "Correct." : "Not quite."}</b> ${esc(q.why)}${overconf ? `<p class="small" style="margin-top:6px"><b>Calibration note:</b> you were 90% sure. Overconfidence is the costlier mistake.</p>` : ""}${!ok ? `<p class="small muted" style="margin-top:6px">Back for review tomorrow.</p>` : ""}</div><div style="margin-top:10px"><button type="button" class="btn" id="q-next">Next question</button></div>`;
    $("#q-next").addEventListener("click", () => { quiz.answered = "next"; trainQuiz(); });
  }

  // Company check: random company, holdings first if any are saved
  function trainCompany() {
    const mine = (store.holdings || []).map((p) => p.t).filter((t) => WL[t] && CO[t]);
    const pool = mine.length && Math.random() < 0.5 ? mine : Object.keys(CO).filter((t) => WL[t]);
    const t = pool[Math.floor(Math.random() * pool.length)];
    $("#train-body").innerHTML = `<div class="panel"><p class="small muted">Three questions built from the company's own revenue breakdown. <a href="#c-${esc(t)}">Study ${esc(CO[t].name)} first →</a></p></div><div class="panel" id="tc"></div>`;
    renderCoCheck($("#tc"), t, trainCompany);
  }

  // Sort drill
  let drill = null;
  function newDrill() {
    const pool = W.items.slice().sort(() => Math.random() - 0.5).slice(0, 8);
    drill = { items: pool.map((i) => ({ t: i.t, name: i.name, layer: i.layer, mix: i.mix, pick: null })), checked: false };
  }
  function trainDrill() {
    if (!drill) newDrill();
    $("#train-body").innerHTML = `
      <div class="panel">
        <span class="eyebrow">Sort drill</span>
        <p>Put each company on its primary layer. Multi-layer companies count as right if you pick any layer they span.</p>
        <div class="drill-grid">${drill.items.map((it, i) => `<div class="drill-row ${drill.checked ? (isRightDrill(it) ? "right" : "wrong") : ""}"><div><span class="tk">${esc(it.t)}</span> ${esc(it.name)}${drill.checked && !isRightDrill(it) ? ` <span class="small muted">→ ${esc(LNAME[it.layer])}</span>` : ""}</div><div class="pick" role="group" aria-label="Layer for ${esc(it.t)}">${ALL_LAYERS.map((l) => `<button type="button" style="--c:${cvar(l)}" data-di="${i}" data-dl="${l}" aria-pressed="${it.pick === l}" ${drill.checked ? "disabled" : ""}>${esc(LNAME[l].replace(" (plate)", ""))}</button>`).join("")}</div></div>`).join("")}</div>
        <div class="chips">${drill.checked ? `<b>${drill.items.filter(isRightDrill).length} of ${drill.items.length} right.</b><button type="button" class="btn" id="d-new">New set</button>` : `<button type="button" class="btn" id="d-check">Check answers</button>`}</div>
      </div>`;
    document.querySelectorAll("[data-di]").forEach((b) => b.addEventListener("click", () => { drill.items[Number(b.dataset.di)].pick = b.dataset.dl; trainDrill(); }));
    const c = $("#d-check"); if (c) c.addEventListener("click", () => { drill.checked = true; store.drills.push({ at: Date.now(), right: drill.items.filter(isRightDrill).length, n: drill.items.length }); save(); trainDrill(); });
    const n = $("#d-new"); if (n) n.addEventListener("click", () => { newDrill(); trainDrill(); });
  }
  function isRightDrill(it) { return it.pick === it.layer || !!(it.mix && it.pick && it.mix[it.pick]); }

  // Scenario lab
  let scen = { id: null, picks: {}, revealed: false };
  function trainScenario() {
    if (!scen.id) scen.id = D.scenarios[0].id;
    const s = D.scenarios.find((x) => x.id === scen.id);
    const keys = Object.keys(s.impact);
    const arrow = (v) => (v > 0 ? "↑" : v < 0 ? "↓" : "–");
    const score = keys.filter((k) => scen.picks[k] === s.impact[k]).length;
    $("#train-body").innerHTML = `
      <div class="panel">
        <span class="eyebrow">Scenario lab</span>
        <div class="chips" role="group" aria-label="Scenario">${D.scenarios.map((x) => `<button type="button" class="chip" data-sc="${x.id}" aria-pressed="${x.id === scen.id}">${esc(x.name)}</button>`).join("")}</div>
        <p class="q">${esc(s.desc)}</p>
        <p class="small muted">Predict the first-year effect on each layer: up, flat, or down.</p>
        <div>${keys.map((k) => `<div class="scen-row"><span><span class="pill" style="--c:${cvar(k)}">${esc(LNAME[k])}</span></span><span class="dirs" role="group" aria-label="${esc(LNAME[k])}">${[1, 0, -1].map((v) => `<button type="button" data-sk="${k}" data-sv="${v}" aria-pressed="${scen.picks[k] === v}" ${scen.revealed ? "disabled" : ""}>${arrow(v)}</button>`).join("")}</span><span class="mono" style="min-width:52px;text-align:right">${scen.revealed ? `<span style="color:${scen.picks[k] === s.impact[k] ? "var(--good)" : "var(--bad)"}">${arrow(s.impact[k])} ${scen.picks[k] === s.impact[k] ? "✓" : "✗"}</span>` : ""}</span></div>`).join("")}</div>
        ${scen.revealed ? `<div class="why"><b>${score} of ${keys.length}.</b> ${esc(s.why)}</div><div><button type="button" class="btn" id="sc-again">Try another</button></div>` : `<div><button type="button" class="btn" id="sc-reveal" ${Object.keys(scen.picks).length < keys.length ? "disabled" : ""}>Reveal reasoning</button></div>`}
      </div>`;
    document.querySelectorAll("[data-sc]").forEach((b) => b.addEventListener("click", () => { scen = { id: b.dataset.sc, picks: {}, revealed: false }; trainScenario(); }));
    document.querySelectorAll("[data-sk]").forEach((b) => b.addEventListener("click", () => { scen.picks[b.dataset.sk] = Number(b.dataset.sv); trainScenario(); }));
    const r = $("#sc-reveal"); if (r) r.addEventListener("click", () => { scen.revealed = true; store.scenarios.push({ at: Date.now(), id: s.id, right: keys.filter((k) => scen.picks[k] === s.impact[k]).length, n: keys.length }); save(); trainScenario(); });
    const a = $("#sc-again"); if (a) a.addEventListener("click", () => { const i = D.scenarios.findIndex((x) => x.id === scen.id); scen = { id: D.scenarios[(i + 1) % D.scenarios.length].id, picks: {}, revealed: false }; trainScenario(); });
  }

  // Prediction log
  function brier(list) { const r = list.filter((p) => p.outcome != null); if (!r.length) return null; return r.reduce((s, p) => s + Math.pow(p.prob - (p.outcome ? 1 : 0), 2), 0) / r.length; }
  function trainPredict() {
    const preds = store.predictions.slice().sort((a, b) => (a.outcome == null) - (b.outcome == null) || a.by.localeCompare(b.by));
    const open = preds.filter((p) => p.outcome == null), done = preds.filter((p) => p.outcome != null);
    const b = brier(store.predictions);
    $("#train-body").innerHTML = `
      <div class="panel">
        <span class="eyebrow">Prediction log</span>
        <p>Log calls before earnings season, then score them. Over a year this becomes your track record on the AI cycle.</p>
        <form id="pf" class="form-row">
          <div class="field" style="grid-column:1/-1"><label for="p-text" class="eyebrow">Prediction</label><input id="p-text" required placeholder="e.g. Meta raises 2027 capex guidance on its Q3 call"></div>
          <div class="field"><label for="p-layer" class="eyebrow">Layer</label><select id="p-layer">${ALL_LAYERS.map((l) => `<option value="${l}">${esc(LNAME[l])}</option>`).join("")}</select></div>
          <div class="field"><label for="p-prob" class="eyebrow">Probability %</label><input id="p-prob" type="number" min="1" max="99" value="70" required></div>
          <div class="field"><label for="p-by" class="eyebrow">Resolve by</label><input id="p-by" type="date" required></div>
          <div><button class="btn" type="submit">Log prediction</button></div>
        </form>
      </div>
      <div class="stats">
        <div class="stat"><span class="v num">${open.length}</span><span class="k">Open predictions</span></div>
        <div class="stat"><span class="v num">${done.length}</span><span class="k">Resolved</span></div>
        <div class="stat"><span class="v num">${b == null ? "—" : b.toFixed(3)}</span><span class="k">Brier score (0 is perfect, 0.25 is coin-flip)</span></div>
      </div>
      <div class="tablebox"><table><thead><tr><th>Prediction</th><th>Layer</th><th>Prob</th><th>By</th><th>Outcome</th></tr></thead>
      <tbody>${preds.map((p) => `<tr><td>${esc(p.text)}</td><td><span class="pill" style="--c:${cvar(p.layer)}">${esc(LNAME[p.layer])}</span></td><td class="num">${Math.round(p.prob * 100)}%</td><td class="mono small">${esc(p.by)}</td><td>${p.outcome == null ? `<div class="chips"><button type="button" class="chip" data-res="${esc(p.id)}" data-v="1">Happened</button><button type="button" class="chip" data-res="${esc(p.id)}" data-v="0">Didn't</button></div>` : `<span class="status ${p.outcome ? "build" : "bad"}">${p.outcome ? "happened" : "didn't"}</span>`}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No predictions yet. Log your first call above, for example on next quarter's capex guidance.</td></tr>`}</tbody></table></div>`;
    const by = $("#p-by"); const d = new Date(Date.now() + 30 * DAY); by.value = d.toISOString().slice(0, 10);
    $("#pf").addEventListener("submit", (e) => { e.preventDefault(); store.predictions.push({ id: "p" + Date.now(), text: $("#p-text").value.trim(), layer: $("#p-layer").value, prob: Math.min(0.99, Math.max(0.01, Number($("#p-prob").value) / 100)), by: $("#p-by").value, made: new Date().toISOString().slice(0, 10), outcome: null }); save(); toast("Prediction logged"); trainPredict(); });
    document.querySelectorAll("[data-res]").forEach((btn) => btn.addEventListener("click", () => { const p = store.predictions.find((x) => x.id === btn.dataset.res); if (p) { p.outcome = btn.dataset.v === "1"; save(); trainPredict(); } }));
  }

  // Progress
  function trainProgress() {
    const A = store.attempts;
    const groups = [...ALL_LAYERS, "plate", "company"].map((l) => { const a = A.filter((x) => x.layer === l); const ok = a.filter((x) => x.ok).length; const total = D.questions.filter((q) => q.layer === l).length; const seen = new Set(a.map((x) => x.id)).size; return { l, n: a.length, acc: a.length ? ok / a.length : null, seen, total }; });
    const buckets = [0.5, 0.7, 0.9].map((c) => { const a = A.filter((x) => x.conf === c); return { c, n: a.length, acc: a.length ? a.filter((x) => x.ok).length / a.length : null }; });
    const weakest = groups.filter((g) => g.acc != null).sort((a, b) => a.acc - b.acc)[0];
    const mastered = groups.filter((g) => g.total && g.seen === g.total && g.acc >= 0.8).length;
    const drills = store.drills.slice(-10), scs = store.scenarios.slice(-10);
    const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x.right / x.n, 0) / arr.length : null);
    $("#train-body").innerHTML = `
      <div class="stats">
        <div class="stat"><span class="v num">${A.length}</span><span class="k">Questions answered</span></div>
        <div class="stat"><span class="v num">${dueIds().length}</span><span class="k">Due for review now</span></div>
        <div class="stat"><span class="v num">${mastered}/${groups.filter((g) => g.total).length}</span><span class="k">Areas mastered (all seen, 80%+ right)</span></div>
        <div class="stat"><span class="v">${weakest ? esc(LNAME[weakest.l]) : "—"}</span><span class="k">Weakest area so far</span></div>
      </div>
      <div class="panel"><span class="eyebrow">Accuracy by area</span>
        <div class="heat">${groups.map((g) => `<div class="cell" style="--c:${cvar(g.l)};--h:${g.acc == null ? 0 : Math.round(g.acc * 100)}%"><b>${esc(LNAME[g.l])}</b><span class="num">${g.acc == null ? "not started" : pct(g.acc) + " right"}</span><span class="small muted">${g.l === "company" ? g.n + " company questions answered" : g.seen + "/" + g.total + " questions seen"}</span></div>`).join("")}</div>
      </div>
      <div class="grid2">
        <div class="panel"><span class="eyebrow">Calibration</span>
          <table><thead><tr><th>When you said</th><th>Answers</th><th>You were right</th></tr></thead><tbody>${buckets.map((b) => `<tr><td class="num">${b.c * 100}% sure</td><td class="num">${b.n}</td><td class="num" style="color:${b.acc == null ? "inherit" : Math.abs(b.acc - b.c) <= 0.1 ? "var(--good)" : "var(--warn)"}">${b.acc == null ? "—" : pct(b.acc)}</td></tr>`).join("")}</tbody></table>
          <p class="small muted">Well calibrated means each row's "right" is close to what you said. Green is within 10 points.</p></div>
        <div class="panel"><span class="eyebrow">Drills and scenarios (last 10)</span>
          <p>Sort drill average: <b class="num">${avg(drills) == null ? "—" : pct(avg(drills))}</b></p>
          <p>Scenario lab average: <b class="num">${avg(scs) == null ? "—" : pct(avg(scs))}</b></p>
          <p>Prediction Brier score: <b class="num">${brier(store.predictions) == null ? "—" : brier(store.predictions).toFixed(3)}</b></p>
        </div>
      </div>
      <div class="panel"><span class="eyebrow">Move progress between devices</span>
        <p class="small">Progress lives in this browser. Copy it here, then paste it on your other device and import.</p>
        <textarea id="io" aria-label="Progress data"></textarea>
        <div class="chips"><button type="button" class="btn ghost" id="io-export">Show my progress data</button><button type="button" class="btn ghost" id="io-copy">Copy</button><button type="button" class="btn" id="io-import">Import pasted data</button><button type="button" class="btn ghost" id="io-reset">Reset progress</button></div>
        <p class="small" id="io-confirm" hidden>Reset deletes all answers, predictions, and saved positions in this browser. <button type="button" class="btn" id="io-reset-yes">Yes, reset</button> <button type="button" class="btn ghost" id="io-reset-no">Cancel</button></p>
      </div>`;
    $("#io-export").addEventListener("click", () => { $("#io").value = JSON.stringify(store); });
    $("#io-copy").addEventListener("click", () => { const v = $("#io").value || JSON.stringify(store); $("#io").value = v; navigator.clipboard && navigator.clipboard.writeText(v).then(() => toast("Copied"), () => { $("#io").select(); toast("Select all and copy"); }); });
    $("#io-import").addEventListener("click", () => { try { const d = JSON.parse($("#io").value); if (!d || !Array.isArray(d.attempts)) throw 0; store = Object.assign(loadStore(), d); save(); toast("Progress imported"); trainProgress(); } catch (e) { toast("That isn't progress data. Paste the full text you copied."); } });
    $("#io-reset").addEventListener("click", () => { $("#io-confirm").hidden = false; });
    $("#io-reset-no").addEventListener("click", () => { $("#io-confirm").hidden = true; });
    $("#io-reset-yes").addEventListener("click", () => { store = { attempts: [], srs: {}, predictions: [], drills: [], scenarios: [], holdings: null }; save(); toast("Progress reset"); trainProgress(); });
  }

  boot();
})();
