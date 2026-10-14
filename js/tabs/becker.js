import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { normal, mean, median, slider, button, seg, swarm, fmt } from "../lib/util.js";
import { GROUPS } from "../../data/becker2017.js";

// After Becker, Brackbill & Centola (2017). About 40 people estimate a number three times.
// Between estimates each sees the average of the people they are connected to:
// four random others (decentralised), only one hub who sees everyone (centralised), or
// nobody (control). Revision: x <- a·x + (1 - a)·(mean of my neighbours), where a is how
// much a person keeps their own estimate. If accurate people keep more, the group's
// average moves towards the truth, unless one hub decides for everybody.
const W = 900, H = 400, NET = 360, M = { l: 470, r: 24, t: 40, b: 40 };
const CW = 900, CH = 240, CM = { l: 56, r: 16, t: 34, b: 40 };
const ROUNDS = 3, SIMS = 300, DOM = [-3, 3];     // in units of the spread of first guesses
const NETWORKS = [
  { value: "decentralized", short: "4 others", label: "Four random others", color: "var(--person)" },
  { value: "centralized", short: "A hub", label: "One hub", color: "var(--accent)" },
  { value: "none", short: "Nobody", label: "Nobody", color: "var(--ink-soft)" },
  { value: "everyone", short: "Everyone", label: "Everyone (like Lorenz)", color: "var(--crowd)", simOnly: true },
];
// below the truth / about right / above the truth (a diverging pair with a neutral middle)
const tint = d3.scaleLinear([-1.5, 0, 1.5], ["#2a78d6", "#b9b6ab", "#eb6834"]).clamp(true);

let S, root;
const layouts = new Map();

export function mount(el) {
  root = el;
  S = { mode: "data", net: "decentralized", gi: 0, ti: 0, shown: 1,
        n: 40, simNet: "decentralized", keep: 0.5, stick: 0.3, bias: 0.6, sim: null };
  el.innerHTML = `
    <header class="tab-head">
      <h1>Becker's networks</h1>
      <p class="question">Forty people estimate a number, then revise twice after seeing what the people they are connected to said. Does it matter who is connected to whom?</p>
    </header>
    <div class="mode"></div>
    <div class="layout" style="margin-top:1rem">
      <div>
        <div class="card stage-card"><svg class="stage" viewBox="0 0 ${W} ${H}" role="img"></svg></div>
        <div class="readouts"></div>
        <div class="card chart-card">
          <h2 class="chart-title"></h2>
          <div class="chart-legend"></div>
          <svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img"></svg>
          <p class="note chart-note"></p>
        </div>
      </div>
      <div class="card controls"></div>
    </div>`;
  el.querySelector(".mode").appendChild(seg(
    [{ label: "The experiment", value: "data" }, { label: "What if…", value: "whatif" }],
    S.mode, m => { S.mode = m; if (m === "whatif") newGroup(); buildControls(); draw(); }));
  buildControls();
  draw();
}

export function onKey(k) {
  if (k === "r") { S.mode === "whatif" ? newGroup() : (S.shown = 1); draw(); }
  if (k === "n" || k === "arrowright") next();
}
export function unmount() { root = null; }

// ---------- what is on screen ----------
const dataGroups = net => GROUPS.filter(g => g.network === net);
const neighboursOf = (n, edges) => {
  const nb = d3.range(n).map(() => []);
  for (const [a, b] of edges) { nb[a].push(b); nb[b].push(a); }
  return nb;
};

// rounds of estimates in units of the spread of first guesses, 0 = the truth
function current() {
  if (S.mode === "data") {
    const g = dataGroups(S.net)[S.gi], t = g.tasks[S.ti];
    return { key: `d${g.network}${g.id}`, network: g.network, n: g.n, hub: g.hub, edges: g.edges,
             z: d3.range(ROUNDS).map(r => t.est.map(e => (e[r] == null ? null : (e[r] - t.truth) / t.sd))),
             truth: t.truth, sd: t.sd, kind: t.kind };
  }
  return S.sim;
}

// ---------- what-if model ----------
// A random network where everyone has k ties: start from a ring (each person tied to the
// k/2 nearest on each side) and rewire pairs of ties many times, which keeps every degree.
function randomRegular(n, k) {
  const key = (a, b) => (a < b ? a * n + b : b * n + a);
  const edges = d3.range(n).flatMap(i => d3.range(1, k / 2 + 1).map(d => [i, (i + d) % n]));
  const set = new Set(edges.map(([a, b]) => key(a, b)));
  for (let s = 0; s < edges.length * 20; s++) {
    const i = Math.floor(Math.random() * edges.length), j = Math.floor(Math.random() * edges.length);
    const [a, b] = edges[i], [c, d] = edges[j];
    if (a === d || c === b || set.has(key(a, d)) || set.has(key(c, b))) continue;
    set.delete(key(a, b)); set.delete(key(c, d)); set.add(key(a, d)); set.add(key(c, b));
    edges[i] = [a, d]; edges[j] = [c, b];
  }
  return edges;
}

function simulate(n, network, keep, stick, bias) {
  let x = d3.range(n).map(() => bias + normal());
  const hub = network === "centralized" ? 0 : null;
  const edges = network === "decentralized" ? randomRegular(n, 4)
    : network === "centralized" ? d3.range(1, n).map(i => [0, i]) : [];
  const nb = neighboursOf(n, edges);
  // How much each person keeps of their own estimate: partly a quirk of theirs (random),
  // partly how accurate they are (rank 0 = most accurate keeps most); stick sets the mix.
  const rank = new Array(n);
  d3.range(n).sort((a, b) => Math.abs(x[a]) - Math.abs(x[b])).forEach((i, r) => { rank[i] = r / Math.max(1, n - 1); });
  const a = rank.map(q => Math.min(0.98, Math.max(0.02,
    keep + 0.45 * (stick * (1 - 2 * q) + (1 - stick) * (2 * Math.random() - 1)))));
  const z = [x.slice()];
  for (let r = 1; r < ROUNDS; r++) {
    const avg = mean(x);
    const seen = d3.range(n).map(i => network === "everyone" ? avg : nb[i].length ? mean(nb[i].map(j => x[j])) : null);
    x = x.map((v, i) => (seen[i] == null ? v : a[i] * v + (1 - a[i]) * seen[i]));
    z.push(x.slice());
  }
  return { key: "sim", network, n, hub, edges, z };
}
function newGroup() { layouts.delete("sim"); S.sim = simulate(S.n, S.simNet, S.keep, S.stick, S.bias); }

// ---------- measures ----------
const valid = row => row.filter(v => v != null);
const groupErr = row => Math.abs(mean(valid(row)));
const sdOf = row => { const v = valid(row), m = mean(v); return Math.sqrt(mean(v.map(x => (x - m) ** 2))); };

// ---------- controls ----------
function buildControls() {
  const c = root.querySelector(".controls");
  c.innerHTML = "";
  if (S.mode === "data") {
    c.innerHTML = `<h2>The experiment</h2>`;
    const nc = document.createElement("div"); nc.className = "control"; nc.dataset.tour = "net";
    nc.innerHTML = `<label><span>Each person sees the average of…</span></label>`;
    nc.appendChild(seg(NETWORKS.filter(x => !x.simOnly).map(({ value, short }) => ({ value, label: short })), S.net,
      v => { S.net = v; S.gi = 0; S.ti = 0; S.shown = 1; buildControls(); draw(); }));
    c.appendChild(nc);
    const groups = dataGroups(S.net);
    c.appendChild(select("Group", groups.map((g, i) => `Group ${i + 1} of ${groups.length}`), S.gi,
      v => { S.gi = v; S.ti = 0; S.shown = 1; buildControls(); draw(); }));
    c.lastChild.dataset.tour = "group";
    c.appendChild(select("Question", groups[S.gi].tasks.map(t =>
      t.kind === "count" ? `A count (true answer ${fmt(t.truth)})` : `A percentage (true answer ${t.truth}%)`), S.ti,
      v => { S.ti = v; S.shown = 1; draw(); }));
    c.lastChild.dataset.tour = "question";
    const row = document.createElement("div"); row.className = "btn-row";
    row.appendChild(button("Next round", next, "primary"));
    row.lastChild.dataset.tour = "next";
    row.appendChild(button("Start again", () => { S.shown = 1; draw(); }));
    row.lastChild.dataset.tour = "again";
    c.appendChild(row);
  } else {
    c.innerHTML = `<h2>An imaginary group</h2>`;
    const re = () => { newGroup(); draw(); };
    c.appendChild(select("Each person sees the average of…", NETWORKS.map(x => x.label),
      NETWORKS.findIndex(x => x.value === S.simNet), v => { S.simNet = NETWORKS[v].value; re(); }));
    c.lastChild.dataset.tour = "simnet";
    c.appendChild(slider({ label: "People", min: 10, max: 100, value: S.n, tour: "n", onInput: v => { S.n = v; re(); } }));
    c.appendChild(slider({ label: "How much people keep their own guess", min: 0.1, max: 0.9, step: 0.05, value: S.keep, tour: "keep",
      format: v => `${Math.round(v * 100)}%`, hint: "On average. The rest moves towards what they see.", onInput: v => { S.keep = v; re(); } }));
    c.appendChild(slider({ label: "Accurate people stick to their guess", min: 0, max: 1, step: 0.05, value: S.stick, tour: "stick",
      format: v => (v === 0 ? "no" : v < 0.35 ? "a little" : v < 0.7 ? "yes" : "strongly"),
      hint: "People differ in how much they revise. At \"no\" that is pure chance; Becker et al. found that people nearer the truth revised a little less.", onInput: v => { S.stick = v; re(); } }));
    c.appendChild(slider({ label: "First guesses lean", min: -1, max: 1, step: 0.05, value: S.bias, tour: "bias",
      format: v => (Math.abs(v) < 0.03 ? "neither way" : `${fmt(Math.abs(v), 2)} spreads too ${v > 0 ? "high" : "low"}`),
      onInput: v => { S.bias = v; re(); } }));
    const row = document.createElement("div"); row.className = "btn-row";
    row.appendChild(button("Ask a new group", re, "primary"));
    row.lastChild.dataset.tour = "new";
    c.appendChild(row);
  }
  const note = document.createElement("p"); note.className = "note";
  note.innerHTML = S.mode === "data"
    ? `Real estimates from Becker et al.'s online experiment (1,360 people, paid for accuracy). Who was connected to whom is not in their dataset; it is worked out here from the averages each person was shown.`
    : `Everyone revises the same way: keep part of your own guess, move the rest towards the average you see. Only who sees whom changes.`;
  c.appendChild(note);
  S.shown = S.mode === "whatif" ? ROUNDS : S.shown;
}

function select(label, options, value, onChange) {
  const el = document.createElement("div"); el.className = "control";
  el.innerHTML = `<label><span>${label}</span></label><select>${options.map((o, i) =>
    `<option value="${i}"${i === value ? " selected" : ""}>${o}</option>`).join("")}</select>`;
  el.querySelector("select").addEventListener("change", e => onChange(+e.target.value));
  return el;
}

function next() { if (S.mode === "data") { S.shown = Math.min(ROUNDS, S.shown + 1); draw(); } }

// ---------- drawing ----------
function draw() {
  if (!root) return;
  drawStage();
  drawReadouts();
  drawChart();
}

function layout(g) {
  if (layouts.has(g.key)) return layouts.get(g.key);
  const cx = NET / 2, cy = H / 2 - 10, R = NET / 2 - 34, n = g.n;
  const ring = i => [cx + R * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), cy + R * Math.sin((2 * Math.PI * i) / n - Math.PI / 2)];
  let pos;
  if (g.network === "decentralized") {
    const nodes = d3.range(n).map(i => ({ x: ring(i)[0], y: ring(i)[1] }));
    d3.forceSimulation(nodes)
      .force("link", d3.forceLink(g.edges.map(([s, t]) => ({ source: s, target: t }))).distance(40))
      .force("charge", d3.forceManyBody().strength(-60))
      .force("center", d3.forceCenter(cx, cy)).stop().tick(300);
    const ex = d3.extent(nodes, d => d.x), ey = d3.extent(nodes, d => d.y);
    const k = Math.min((2 * R) / (ex[1] - ex[0] || 1), (2 * R) / (ey[1] - ey[0] || 1));
    pos = nodes.map(d => [cx + (d.x - (ex[0] + ex[1]) / 2) * k, cy + (d.y - (ey[0] + ey[1]) / 2) * k]);
  } else {
    let k = 0;
    pos = d3.range(n).map(i => (i === g.hub ? [cx, cy] : ring(k++)));
  }
  layouts.set(g.key, pos);
  return pos;
}

function drawStage() {
  const svg = d3.select(root.querySelector("svg.stage"));
  svg.selectAll("*").remove();
  const g = current(), pos = layout(g), r = S.shown - 1;
  const row = g.z[r];

  // the network, coloured by each person's latest estimate
  const net = svg.append("g");
  if (g.network === "everyone") {
    net.selectAll("line").data(pos).join("line").attr("x1", NET / 2).attr("y1", H / 2 - 10).attr("x2", d => d[0]).attr("y2", d => d[1])
      .attr("stroke", "var(--line)").attr("stroke-width", 1);
    net.append("text").attr("x", NET / 2).attr("y", H / 2 - 5).attr("text-anchor", "middle").attr("font-size", 14)
      .style("fill", "var(--ink-soft)").text("group average");
  }
  net.selectAll("line.tie").data(g.edges).join("line").attr("class", "tie")
    .attr("x1", d => pos[d[0]][0]).attr("y1", d => pos[d[0]][1]).attr("x2", d => pos[d[1]][0]).attr("y2", d => pos[d[1]][1])
    .attr("stroke", "var(--ink-soft)").attr("stroke-opacity", g.network === "centralized" ? 0.35 : 0.55).attr("stroke-width", 1.2);
  const rad = g.n > 60 ? 5 : 7.5;
  pos.forEach((p, i) => {
    const v = row[i], isHub = i === g.hub;
    net.append("circle").attr("cx", p[0]).attr("cy", p[1]).attr("r", isHub ? rad * 1.9 : rad)
      .attr("fill", v == null ? "var(--card)" : tint(v)).attr("stroke", "var(--ink)").attr("stroke-width", isHub ? 2.5 : 1);
    if (isHub) net.append("text").attr("x", p[0]).attr("y", p[1] + 5).attr("text-anchor", "middle").attr("font-size", 14)
      .style("fill", "#fff").attr("font-weight", 800).text("★");
  });
  svg.append("text").attr("x", 12).attr("y", H - 30).attr("font-size", 14).style("fill", "var(--ink-soft)")
    .text(`Colour shows guess ${S.shown}${g.hub != null ? " · ★ the hub" : ""}`);
  [["too low", -1.5], ["about right", 0], ["too high", 1.5]].forEach(([t, v], k) => {
    svg.append("circle").attr("cx", 18 + k * 110).attr("cy", H - 12).attr("r", 6).attr("fill", tint(v)).attr("stroke", "var(--ink)");
    svg.append("text").attr("x", 29 + k * 110).attr("y", H - 7).attr("font-size", 14).style("fill", "var(--ink-soft)").text(t);
  });

  // the estimates, round by round
  const x = d3.scaleLinear(DOM, [M.l, W - M.r]);
  const clampX = v => x(Math.max(DOM[0], Math.min(DOM[1], v)));
  const rowH = (H - M.t - M.b) / ROUNDS, yMid = k => M.t + (k + 0.5) * rowH;
  const tick = v => (g.truth == null ? (v === 0 ? "truth" : `${v > 0 ? "+" : "−"}${Math.abs(v)}`)
    : fmt(g.truth + v * g.sd) + (g.kind === "percent" ? "%" : ""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`).call(d3.axisBottom(x).tickValues([-2, -1, 0, 1, 2]).tickFormat(tick));
  svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", M.t - 6).attr("y2", H - M.b).attr("stroke", "var(--truth)").attr("stroke-width", 3);
  svg.append("text").attr("class", "hand").attr("x", x(0)).attr("y", M.t - 12).attr("text-anchor", "middle").attr("font-size", 21)
    .style("fill", "var(--truth)").text(g.truth == null ? "the truth" : `the truth: ${fmt(g.truth)}${g.kind === "percent" ? "%" : ""}`);
  const dr = g.n > 60 ? 3 : 4.5;
  const ys = d3.range(S.shown).map(k => swarm(g.z[k].map(v => (v == null ? null : clampX(v))), dr).map(dy => dy + yMid(k)));
  for (let k = 0; k < ROUNDS; k++) svg.append("text").attr("x", M.l - 10).attr("y", yMid(k) + 5).attr("text-anchor", "end").attr("font-size", 15)
    .attr("font-weight", 700).style("fill", k < S.shown ? "var(--ink)" : "var(--line)").text(`Guess ${k + 1}`);
  const paths = svg.append("g").attr("opacity", 0.3);
  for (let k = 1; k < S.shown; k++) g.z[k].forEach((v, i) => {
    const u = g.z[k - 1][i];
    if (u == null || v == null) return;
    paths.append("line").attr("x1", clampX(u)).attr("y1", ys[k - 1][i]).attr("x2", clampX(v)).attr("y2", ys[k][i]).attr("stroke", "var(--ink-soft)");
  });
  for (let k = 0; k < S.shown; k++) {
    g.z[k].forEach((v, i) => {
      if (v == null) return;
      svg.append("circle").attr("cx", clampX(v)).attr("cy", ys[k][i]).attr("r", i === g.hub ? dr * 1.8 : dr)
        .attr("fill", tint(v)).attr("stroke", "var(--ink)").attr("stroke-width", i === g.hub ? 2 : 0.6);
    });
    const m = mean(valid(g.z[k]));
    svg.append("line").attr("x1", clampX(m)).attr("x2", clampX(m)).attr("y1", yMid(k) - rowH * 0.42).attr("y2", yMid(k) + rowH * 0.42)
      .attr("stroke", "var(--crowd)").attr("stroke-width", 4).attr("stroke-linecap", "round");
    if (k === S.shown - 1) svg.append("text").attr("class", "hand").attr("x", clampX(m) + (m < 2 ? 8 : -8)).attr("y", M.t + k * rowH + 14)
      .attr("text-anchor", m < 2 ? "start" : "end").attr("font-size", 18).style("fill", "var(--crowd)").text("average");
  }
  if (S.shown < ROUNDS) svg.append("text").attr("class", "hand").attr("x", (M.l + W - M.r) / 2).attr("y", yMid(S.shown) + 6)
    .attr("text-anchor", "middle").attr("font-size", 20).style("fill", "var(--ink-soft)").text("Press “Next round” (or N)");
}

function drawReadouts() {
  const g = current(), r = S.shown - 1, first = g.z[0], last = g.z[r];
  const units = v => (g.truth == null ? `${fmt(v, 2)} spreads` : `${fmt(v * g.sd)}${g.kind === "percent" ? " pts" : ""}`);
  const rows = [
    ["crowd", "The group's average is off by", units(groupErr(last)), r > 0 ? `guess 1: ${units(groupErr(first))}` : ""],
    ["", "A typical person is off by", units(mean(valid(last).map(Math.abs))), r > 0 ? `guess 1: ${units(mean(valid(first).map(Math.abs)))}` : ""],
    ["", "Spread of the guesses", units(sdOf(last)), r > 0 ? `guess 1: ${units(sdOf(first))}` : ""],
  ];
  if (g.hub != null && first[g.hub] != null) {
    const closer = Math.abs(first[g.hub]) < groupErr(first);
    rows.push([closer ? "truth" : "wrong", "The hub's first guess was", closer ? "nearer the truth" : "further from the truth", "than the group's average"]);
  }
  if (r > 0) rows[0][0] = groupErr(last) < groupErr(first) ? "truth" : "wrong";
  root.querySelector(".readouts").innerHTML = rows.map(([c, k, v, sub]) =>
    `<div class="readout ${c}"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="k">${sub}</div>` : ""}</div>`).join("");
}

// ---------- chart ----------
function trialsFor(net) {
  return dataGroups(net).flatMap(g => g.tasks.map(t => ({
    hub: g.hub, z: d3.range(ROUNDS).map(r => t.est.map(e => (e[r] == null ? null : (e[r] - t.truth) / t.sd))),
  })));
}

function drawChart() {
  const data = S.mode === "data";
  const nets = NETWORKS.filter(n => (data ? !n.simOnly : true));
  const trials = {};
  for (const n of nets) trials[n.value] = data ? trialsFor(n.value)
    : d3.range(SIMS).map(() => simulate(S.n, n.value, S.keep, S.stick, S.bias));
  root.querySelector(".chart-title").textContent = data
    ? "Every group and question in the experiment"
    : `${SIMS} imaginary groups of ${S.n}, for each kind of network`;
  root.querySelector(".chart-legend").innerHTML = nets.map(c =>
    `<span class="key"><span class="swatch" style="background:${c.color}"></span>${c.label}</span>`).join("");
  const svg = d3.select(root.querySelector("svg.chart"));
  svg.selectAll("*").remove();
  const half = CW / 2;

  // left: how far the group's average is from the truth, guess by guess
  {
    const g = svg.append("g");
    const x = d3.scaleLinear([1, ROUNDS], [CM.l, half - CM.r - 20]);
    const lines = nets.map(n => ({ ...n, v: d3.range(ROUNDS).map(r => mean(trials[n.value].map(t => groupErr(t.z[r])))) }));
    const [lo, hi] = d3.extent(lines.flatMap(l => l.v));
    const y = d3.scaleLinear([Math.max(0, lo - (hi - lo) * 0.4), hi + (hi - lo) * 0.3], [CH - CM.b, CM.t]).nice();
    axes(g, x, y, half - 20, "guess", d3.format(".1f"));
    g.append("text").attr("x", CM.l).attr("y", 18).attr("font-size", 16).attr("font-weight", 700).text("How far off the group's average is");
    for (const l of lines) {
      const pts = l.v.map((v, r) => [x(r + 1), y(v)]);
      g.append("path").datum(pts).attr("fill", "none").attr("stroke", l.color).attr("stroke-width", 3.5).attr("d", d3.line());
      g.selectAll(null).data(pts).join("circle").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("r", 4).attr("fill", l.color);
    }
    g.append("text").attr("x", CM.l + 4).attr("y", CH - CM.b - 6).attr("font-size", 13).style("fill", "var(--ink-soft)")
      .text("in spreads of first guesses");
  }

  const g = svg.append("g").attr("transform", `translate(${half},0)`);
  if (data) {
    // right: one hub decides. Each dot is a question answered by a centralised group.
    const pts = trials.centralized.filter(t => t.z[0][t.hub] != null).map(t => ({
      x: Math.abs(t.z[0][t.hub]) - groupErr(t.z[0]), y: groupErr(t.z[ROUNDS - 1]) - groupErr(t.z[0]) }));
    const ext = Math.max(1, d3.max(pts, d => Math.max(Math.abs(d.x), Math.abs(d.y))) * 1.05);
    const x = d3.scaleLinear([-ext, ext], [CM.l, half - CM.r]), y = d3.scaleLinear([-ext, ext], [CH - CM.b, CM.t]);
    axes(g, x, y, half, "hub's first guess vs the average: nearer the truth ← → further", d3.format("+.1f"));
    g.append("text").attr("x", CM.l).attr("y", 18).attr("font-size", 16).attr("font-weight", 700).text("One hub: the group follows its hub");
    g.append("line").attr("x1", x(-ext)).attr("x2", x(ext)).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--ink-soft)").attr("stroke-dasharray", "4 4");
    g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", y(-ext)).attr("y2", y(ext)).attr("stroke", "var(--ink-soft)").attr("stroke-dasharray", "4 4");
    g.selectAll(null).data(pts).join("circle").attr("cx", d => x(d.x)).attr("cy", d => y(d.y)).attr("r", 5)
      .attr("fill", d => (d.y < 0 ? "var(--truth)" : "var(--wrong)")).attr("stroke", "var(--card)");
    g.append("text").attr("x", x(-ext) + 6).attr("y", y(-ext) - 8).attr("font-size", 13).style("fill", "var(--truth)").text("average got better");
    g.append("text").attr("x", x(-ext) + 6).attr("y", y(ext) + 16).attr("font-size", 13).style("fill", "var(--wrong)").text("average got worse");
  } else {
    // right: share of groups whose average got better
    const bars = nets.map(n => ({ ...n, p: mean(trials[n.value].map(t => (groupErr(t.z[ROUNDS - 1]) < groupErr(t.z[0]) - 1e-9 ? 1 : 0))) }));
    const x = d3.scaleBand(bars.map(b => b.short), [CM.l, half - CM.r]).padding(0.35), y = d3.scaleLinear([0, 1], [CH - CM.b, CM.t]);
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${CH - CM.b})`).call(d3.axisBottom(x).tickSize(0)).select(".domain").remove();
    g.append("g").attr("class", "grid").attr("transform", `translate(${CM.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-(half - CM.l - CM.r)).tickFormat("")).select(".domain").remove();
    g.append("g").attr("class", "axis").attr("transform", `translate(${CM.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".0%")));
    g.append("text").attr("x", CM.l).attr("y", 18).attr("font-size", 16).attr("font-weight", 700).text("Groups whose average got better");
    g.selectAll(null).data(bars).join("rect").attr("x", d => x(d.short)).attr("width", x.bandwidth())
      .attr("y", d => y(d.p)).attr("height", d => y(0) - y(d.p)).attr("rx", 4).attr("fill", d => d.color);
    g.selectAll(null).data(bars).join("text").attr("x", d => x(d.short) + x.bandwidth() / 2).attr("y", d => y(d.p) - 6)
      .attr("text-anchor", "middle").attr("font-size", 15).attr("font-weight", 700).text(d => `${Math.round(d.p * 100)}%`);
  }
  root.querySelector(".chart-note").innerHTML = data
    ? `With four random neighbours, the group's average got closer to the truth; with nobody to listen to, it did not move. With one hub, it moved towards the hub, for better or worse. Same revision rule as <a href="#/lorenz">Lorenz's groups</a>, different wiring.`
    : `At "no", people still differ in how much they revise, but by chance, so the group's average wanders and improves only half the time. Raise it and groups with neighbours, or with everyone's average, improve: the people who stay put are the right ones. With one hub, the group goes wherever the hub was. With "a little", compare 12 people with 100: small groups improve less reliably, which is why Becker et al. argue that small studies like <a href="#/lorenz">Lorenz's</a> could miss the effect.`;
}

function axes(g, x, y, width, xLabel, yFormat) {
  g.append("g").attr("class", "grid").attr("transform", `translate(${CM.l},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSize(-(width - CM.l - CM.r)).tickFormat("")).select(".domain").remove();
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${CH - CM.b})`)
    .call(d3.axisBottom(x).ticks(Math.min(5, x.domain()[1] - x.domain()[0] < 5 ? 3 : 5)).tickFormat(d3.format(x.domain()[0] < 0 ? "+.1f" : "d")));
  g.append("g").attr("class", "axis").attr("transform", `translate(${CM.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(yFormat));
  g.append("text").attr("x", width - CM.r).attr("y", CH - 4).attr("text-anchor", "end").attr("font-size", 13).style("fill", "var(--ink-soft)").text(xLabel);
}

// ---------- guided story ----------
// Show one real trial (network, group index, question index) with the first `shown` estimates.
function setData(net, gi, ti, shown) {
  Object.assign(S, { mode: "data", net, gi, ti });
  root.querySelectorAll(".mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === "data")));
  buildControls();
  S.shown = shown;
  draw();
}
function setWhatIf(patch) {
  Object.assign(S, { mode: "whatif", n: 40, simNet: "decentralized", keep: 0.5, stick: 0.3, bias: 0.6 }, patch);
  root.querySelectorAll(".mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === "whatif")));
  newGroup();
  buildControls();
  draw();
}
// the real trials the story follows (indices into each network's groups and their questions)
const FOUR = ["decentralized", 10, 0];   // question 5a, a percentage: the average's error halves
const GOOD_HUB = ["centralized", 7, 2];  // question 7a: the hub was nearer the truth
const BAD_HUB = ["centralized", 8, 3];   // question 8a: the hub guessed far too high
const off = k => { const g = current(); return `${fmt(groupErr(g.z[k]) * g.sd, 1)} points`; };
const sides = () => { const v = valid(current().z[0]); return `${v.filter(x => x > 0).length} of ${v.length}`; };
const typical = k => { const g = current(); return `${fmt(mean(valid(g.z[k]).map(Math.abs)) * g.sd, 1)} points`; };
const spreadPts = k => { const g = current(); return `${fmt(sdOf(g.z[k]) * g.sd, 1)} points`; };

export const story = [
  { setup: () => setData(...FOUR, 1),
    text: `<p>In an online experiment published in 2017, Joshua Becker, Devon Brackbill and Damon Centola asked groups of about 40 people to estimate things from pictures: the calories in a plate of food, the number of sweets in a jar, a percentage of the people in a photo. Close answers were paid.</p>
           <p>Each person guessed, then revised twice after seeing the average guess of the people they were connected to. What changed between groups was <b>who was connected to whom</b>.</p>` },
  { target: ".stage-card", reveal: [".stage-card"], setup: () => setData(...FOUR, 1),
    text: () => `<p>On the left is one group's network: each circle is a person, tied to four random others. On the right are their first guesses at a percentage whose true value was ${current().truth}% (green line). The <span style="color:var(--crowd)">yellow line</span> is the group's average.</p>
                 <p>Colours: blue guessed too low, orange too high, grey about right.</p>` },
  { target: ".readouts", reveal: [".readouts"],
    text: () => `<p>The group's average is off by ${off(0)}; a typical person by ${typical(0)}. Errors cancel out in an average only when they point both ways, and here ${sides()} guessed too high.</p>` },
  { target: '[data-tour="next"]', reveal: [".controls", '[data-tour="next"]'], place: "below", setup: () => setData(...FOUR, 1),
    text: `<p>After each guess, everyone saw the average of their four neighbours, then guessed again. <b>Press Next round</b> to see both revisions.</p>`,
    waitFor: { event: "click", target: '[data-tour="next"]', until: () => S.shown === ROUNDS, prompt: "Press Next round twice." } },
  { target: ".stage-card", setup: () => setData(...FOUR, ROUNDS),
    text: () => `<p>As in <a href="#/lorenz">Lorenz's groups</a>, guesses close in on each other: the spread falls from ${spreadPts(0)} to ${spreadPts(2)}.</p>
                 <p>But this time the average moved too, <b>towards</b> the truth: from ${off(0)} off to ${off(2)}.</p>` },
  { target: '[data-tour="net"]', reveal: ['[data-tour="net"]'], place: "below",
    text: `<p>Now a different wiring. In some groups, everyone saw only one person, the <b>hub</b>, and the hub saw everyone.</p>`,
    waitFor: { event: "click", target: '[data-tour="net"] button[data-value="centralized"]', prompt: "Click “A hub”." } },
  { target: ".stage-card", setup: () => setData(...GOOD_HUB, ROUNDS),
    text: () => `<p>Here the hub (★) guessed nearer the truth than the group's average did. Everyone moved towards the hub, and the group's average went from ${off(0)} off to ${off(2)}.</p>` },
  { target: ".stage-card", setup: () => setData(...BAD_HUB, ROUNDS),
    text: () => `<p>In another group the hub guessed far too high. Everyone followed, and the group's average got worse: from ${off(0)} off to ${off(2)}.</p>
                 <p>With one hub, the group becomes the hub, for better or worse.</p>` },
  { target: ".chart-card", reveal: [".chart-card", '[data-tour="group"]', '[data-tour="question"]', '[data-tour="again"]'],
    text: `<p>Every group and question in the experiment. With four random neighbours, the group's average got closer to the truth (left, blue line); it improved in 41 of 59 cases. With nobody to listen to, it barely moved.</p>
           <p>With a hub (right), it depended on the hub: each dot is one question, and the groups whose hub was nearer the truth (left half) mostly got better.</p>` },
  { target: ".mode", reveal: [".mode"], place: "below",
    text: `<p>Why would listening to neighbours make a group's average better? Test it with imaginary groups.</p>`,
    waitFor: { event: "click", target: '.mode button[data-value="whatif"]', prompt: "Click “What if…”." } },
  { target: ".chart-card", setup: () => setWhatIf({ stick: 0 }),
    text: `<p>In these imaginary groups everyone revises the same way: keep part of your guess, move the rest towards the average you see. How much each person keeps is pure chance.</p>
           <p>The bars show how often the group's average got better: about half the time with neighbours, a coin toss. With nobody to listen to, nothing changes.</p>` },
  { target: '[data-tour="stick"]', reveal: ['[data-tour="stick"]'], place: "below",
    text: `<p>Becker et al. found that people nearer the truth revised a little less. Let <b>accurate people stick to their guess</b>.</p>`,
    waitFor: { event: "input", target: '[data-tour="stick"] input', until: () => S.stick >= 0.35, prompt: "Drag it to “yes” or more." } },
  { target: ".chart-card",
    text: `<p>Now groups with neighbours, or with everyone's average, improve almost every time. The people who move least are the ones nearer the truth, so the average drifts their way.</p>
           <p>With one hub, it is still a coin toss: the hub decides.</p>` },
  { target: '[data-tour="n"]', reveal: ['[data-tour="n"]'], place: "below", setup: () => setWhatIf({ stick: 0.3 }),
    text: `<p>I've set it back to "a little", closer to what Becker et al. measured. Lorenz's groups had 12 people. <b>Make the group that small.</b></p>`,
    waitFor: { event: "input", target: '[data-tour="n"] input', until: () => S.n <= 15, prompt: "Drag People down to 15 or fewer." } },
  { target: ".chart-card",
    text: `<p>Small groups improve less reliably. The effect is real, but in a group of 12 it is easy to miss, which is how Becker et al. explain why Lorenz's groups did not always show it.</p>` },
  { reveal: ['[data-tour="simnet"]', '[data-tour="keep"]', '[data-tour="bias"]', '[data-tour="new"]'],
    text: `<p>That's Becker's networks. Influence shrinks diversity in every network, as Lorenz found. But when people listen to a few others, and the ones nearer the truth hold firmer, the group's average improves. Put one voice at the centre, and the group becomes that voice.</p>
           <p>Who listens to whom matters. That's the last story: go back to the beginning with <a href="#/galton">Galton's ox</a>.</p>` },
];

