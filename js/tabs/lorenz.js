import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { normal, mean, median, slider, button, seg, swarm, fmt } from "../lib/util.js";
import { QUESTIONS, GROUPS } from "../../data/lorenz2011.js";

// After Lorenz, Rauhut, Schweitzer & Helbing (2011). Groups of 12 make five estimates of
// the same quantity; between rounds they see nothing, the average of everyone's last
// estimate, or every estimate. Everything is on a log scale, as in the paper: an estimate
// is placed by how many times too high or too low it is, and the crowd's answer is the
// geometric mean.
const W = 900, H = 450, M = { l: 112, r: 24, t: 44, b: 40 };
const CW = 900, CH = 230, CM = { l: 56, r: 16, t: 34, b: 40 };
const ROUNDS = 5, DOM = [-2, 2];                 // log10(estimate / truth)
const COND = [
  { value: "none", label: "See nothing", color: "var(--ink-soft)" },
  { value: "mean", label: "See the average", color: "var(--person)" },
  { value: "all", label: "See every guess", color: "var(--accent)" },
];
const SIMS = 300;

let S, root;

export function mount(el) {
  root = el;
  S = { mode: "data", q: 4, cond: "mean", g: 0, shown: 1,
        n: 12, bias: -0.3, spread: 0.5, pull: 0.4, simCond: "mean", sim: null };
  el.innerHTML = `
    <header class="tab-head">
      <h1>Lorenz's influence</h1>
      <p class="question">Twelve people guess a number, five times. Between guesses they may see what the others said. Does the group get wiser, or just more sure of itself?</p>
    </header>
    <div class="mode"></div>
    <div class="layout" style="margin-top:1rem">
      <div>
        <div class="card stage-card"><svg class="rounds" viewBox="0 0 ${W} ${H}" role="img"></svg></div>
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
    [{ label: "Zurich, 2008", value: "data" }, { label: "What if…", value: "whatif" }],
    S.mode, m => { S.mode = m; S.shown = 1; if (m === "whatif") newCrowd(); buildControls(); draw(); }));
  buildControls();
  draw();
}

export function onKey(k) {
  if (k === "r") { S.mode === "whatif" ? newCrowd() : (S.shown = 1); draw(); }
  if (k === "n" || k === "arrowright") next();
}
export function unmount() { root = null; }

// ---------- data ----------
const question = () => QUESTIONS[S.q - 1];
const groupsFor = (q, cond) => GROUPS.filter(g => g.question === q && g.condition === cond);
const lg = (v, truth) => (v == null ? null : Math.log10(v / truth));

// the crowd on screen: rows of log10 ratios per round, plus what was shown before each round
function current() {
  if (S.mode === "data") {
    const g = groupsFor(S.q, S.cond)[S.g], T = question().truth;
    const logs = d3.range(ROUNDS).map(r => g.est.map(e => lg(e[r], T)));
    const shownMean = S.cond === "mean"
      ? d3.range(ROUNDS).map(r => (r === 0 ? null : Math.log10(mean(g.est.map(e => e[r - 1]).filter(v => v != null)) / T)))
      : null;
    return { logs, shownMean, conf: g.conf, truth: T, unit: question().unit };
  }
  return { logs: S.sim.logs, shownMean: S.sim.shownMean, conf: null, truth: null };
}

// ---------- what-if model ----------
// First guesses are log-normal around the truth: log10(guess / truth) ~ N(bias, spread).
// After each round a person moves a fixed fraction of the way (their own, between 0 and
// 2 × pull) towards what they were shown. As in the experiment, "the average" is the
// ordinary mean of everyone's last guesses, which a few large guesses drag upwards.
function simulate(n, bias, spread, pull, cond) {
  const w = d3.range(n).map(() => Math.min(1, Math.random() * 2 * pull));
  let x = d3.range(n).map(() => bias + spread * normal());
  const logs = [x.slice()], shownMean = [null];
  for (let r = 1; r < ROUNDS; r++) {
    const target = cond === "mean" ? Math.log10(mean(x.map(v => 10 ** v))) : null;
    if (target != null) x = x.map((v, i) => v + w[i] * (target - v));
    logs.push(x.slice());
    shownMean.push(target);
  }
  return { logs, shownMean };
}
function newCrowd() { S.sim = simulate(S.n, S.bias, S.spread, S.pull, S.simCond); }

// ---------- measures (on log10 ratios) ----------
const valid = row => row.filter(v => v != null && Number.isFinite(v));
const crowdLog = row => mean(valid(row));                                   // log of the geometric mean
const spreadLog = row => { const v = valid(row), m = mean(v); return Math.sqrt(mean(v.map(x => (x - m) ** 2))); };
// Lorenz's wisdom-of-crowd indicator: how many of the nested pairs (lowest & highest,
// 2nd lowest & 2nd highest, ...) still bracket the truth. 0 = outside every guess.
function centrality(row) {
  const s = valid(row).sort((a, b) => a - b); let w = 0;
  for (let i = 0; i < s.length >> 1; i++) if (s[i] <= 0 && 0 <= s[s.length - 1 - i]) w++;
  return w;
}
const times = v => (v >= 0 ? `×${fmt(10 ** v, 10 ** v < 10 ? 1 : 0)}` : `×1/${fmt(10 ** -v, 10 ** -v < 10 ? 1 : 0)}`);
const offBy = v => (Math.abs(v) < 0.02 ? "spot on" : `${times(Math.abs(v)).replace("×", "")}× too ${v > 0 ? "high" : "low"}`);

// ---------- controls ----------
function buildControls() {
  const c = root.querySelector(".controls");
  c.innerHTML = "";
  if (S.mode === "data") {
    c.innerHTML = `<h2>The experiment</h2>`;
    const qc = document.createElement("div"); qc.className = "control"; qc.dataset.tour = "question";
    qc.innerHTML = `<label><span>Question</span></label><select>${QUESTIONS.map(q =>
      `<option value="${q.id}"${q.id === S.q ? " selected" : ""}>${q.text}</option>`).join("")}</select>`;
    qc.querySelector("select").addEventListener("change", e => { S.q = +e.target.value; S.g = 0; S.shown = 1; buildControls(); draw(); });
    c.appendChild(qc);
    const cc = document.createElement("div"); cc.className = "control"; cc.dataset.tour = "cond";
    cc.innerHTML = `<label><span>Between guesses, people…</span></label>`;
    cc.appendChild(seg(COND.map(({ value, label }) => ({ value, label })), S.cond, v => { S.cond = v; S.g = 0; S.shown = 1; buildControls(); draw(); }));
    c.appendChild(cc);
    const gc = document.createElement("div"); gc.className = "control"; gc.dataset.tour = "group";
    gc.innerHTML = `<label><span>Group</span></label>`;
    gc.appendChild(seg([0, 1, 2, 3].map(i => ({ value: i, label: String(i + 1) })), S.g, v => { S.g = v; S.shown = 1; draw(); }));
    gc.insertAdjacentHTML("beforeend", `<p class="hint">Four groups of 12 answered each question this way.</p>`);
    c.appendChild(gc);
  } else {
    c.innerHTML = `<h2>An imaginary group</h2>`;
    const re = () => { newCrowd(); S.shown = ROUNDS; draw(); };
    c.appendChild(slider({ label: "People", min: 5, max: 100, value: S.n, tour: "n", onInput: v => { S.n = v; re(); } }));
    c.appendChild(slider({ label: "First guesses are typically", min: -1, max: 1, step: 0.05, value: S.bias, tour: "bias",
      format: v => offBy(v), hint: "People often underestimate large numbers.", onInput: v => { S.bias = v; re(); } }));
    c.appendChild(slider({ label: "How much first guesses differ", min: 0.1, max: 1, step: 0.05, value: S.spread, tour: "spread",
      format: v => times(v), hint: "A typical guess is this many times off the typical guess.", onInput: v => { S.spread = v; re(); } }));
    c.appendChild(slider({ label: "How far people move towards the average", min: 0, max: 0.9, step: 0.05, value: S.pull, tour: "pull",
      format: v => `${Math.round(v * 100)}%`, hint: "On average; some move more, some less.", onInput: v => { S.pull = v; re(); } }));
    const cc = document.createElement("div"); cc.className = "control"; cc.dataset.tour = "simcond";
    cc.innerHTML = `<label><span>Between guesses, people…</span></label>`;
    cc.appendChild(seg(COND.slice(0, 2).map(({ value, label }) => ({ value, label })), S.simCond, v => { S.simCond = v; re(); }));
    c.appendChild(cc);
    S.shown = ROUNDS;
  }
  const row = document.createElement("div"); row.className = "btn-row";
  if (S.mode === "data") {
    row.appendChild(button("Next round", next, "primary"));
    row.lastChild.dataset.tour = "next";
    row.appendChild(button("All rounds", () => { S.shown = ROUNDS; draw(); }));
    row.lastChild.dataset.tour = "all";
    row.appendChild(button("Start again", () => { S.shown = 1; draw(); }));
    row.lastChild.dataset.tour = "again";
  } else {
    row.appendChild(button("Ask a new group", () => { newCrowd(); draw(); }, "primary"));
  }
  c.appendChild(row);
  const note = document.createElement("p"); note.className = "note";
  note.innerHTML = S.mode === "data"
    ? `Real guesses from Lorenz et al.'s experiment at ETH Zurich (144 students, paid for accuracy). The axis is logarithmic: each step is ten times bigger. The crowd's answer is the geometric mean.`
    : `"The average" is the ordinary average of everyone's last guesses, as in the experiment. A few huge guesses drag it up, so a crowd that underestimates gets pulled towards the truth.`;
  c.appendChild(note);
}

function next() { if (S.mode === "data") { S.shown = Math.min(ROUNDS, S.shown + 1); draw(); } }

// ---------- drawing ----------
function draw() {
  if (!root) return;
  drawRounds();
  drawReadouts();
  drawChart();
}

function drawRounds() {
  const svg = d3.select(root.querySelector("svg.rounds"));
  svg.selectAll("*").remove();
  const { logs, shownMean, truth, unit } = current();
  const x = d3.scaleLinear(DOM, [M.l, W - M.r]);
  const rowH = (H - M.t - M.b) / ROUNDS;
  const yMid = r => M.t + (r + 0.5) * rowH;
  const n = logs[0].length, rad = n > 40 ? 3.2 : n > 20 ? 4.5 : 7;
  const clampX = v => x(Math.max(DOM[0], Math.min(DOM[1], v)));

  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`)
    .call(d3.axisBottom(x).tickValues([-2, -1, 0, 1, 2]).tickFormat(v => (v === 0 ? "the truth" : times(v))));
  [-1, 1].forEach(v => svg.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", M.t).attr("y2", H - M.b)
    .attr("stroke", "var(--line)").attr("stroke-dasharray", "2 4"));
  svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", M.t - 6).attr("y2", H - M.b)
    .attr("stroke", "var(--truth)").attr("stroke-width", 3);
  svg.append("text").attr("class", "hand").attr("x", x(0)).attr("y", M.t - 14).attr("text-anchor", "middle").attr("font-size", 22)
    .style("fill", "var(--truth)").text(truth != null ? `the truth: ${fmt(truth)} ${unit}` : "the truth");

  for (let r = 0; r < ROUNDS; r++) {
    svg.append("text").attr("x", 8).attr("y", yMid(r) + 5).attr("font-size", 16).attr("font-weight", 700)
      .style("fill", r < S.shown ? "var(--ink)" : "var(--line)").text(r === 0 ? "Guess 1 (alone)" : `Guess ${r + 1}`);
    if (r > 0) svg.append("line").attr("x1", M.l).attr("x2", W - M.r).attr("y1", M.t + r * rowH).attr("y2", M.t + r * rowH)
      .attr("stroke", "var(--line)").attr("stroke-dasharray", "1 5");
  }

  const pos = d3.range(S.shown).map(r => swarm(logs[r].map(v => (v == null ? null : clampX(v))), rad).map(dy => dy + yMid(r)));
  // each person's path from guess to guess
  const paths = svg.append("g").attr("opacity", 0.35);
  for (let r = 1; r < S.shown; r++) logs[r].forEach((v, i) => {
    const u = logs[r - 1][i];
    if (u == null || v == null) return;
    paths.append("line").attr("x1", clampX(u)).attr("y1", pos[r - 1][i]).attr("x2", clampX(v)).attr("y2", pos[r][i])
      .attr("stroke", "var(--ink-soft)").attr("stroke-width", 1);
  });

  for (let r = 0; r < S.shown; r++) {
    const row = valid(logs[r]), lo = d3.min(row), hi = d3.max(row), inside = lo <= 0 && 0 <= hi;
    svg.append("line").attr("x1", clampX(lo)).attr("x2", clampX(hi)).attr("y1", yMid(r) + rowH * 0.36).attr("y2", yMid(r) + rowH * 0.36)
      .attr("stroke", inside ? "var(--ink-soft)" : "var(--wrong)").attr("stroke-width", 2.5).attr("stroke-linecap", "round");
    if (!inside) svg.append("text").attr("x", clampX(hi < 0 ? hi : lo) + (hi < 0 ? 8 : -8)).attr("y", yMid(r) + rowH * 0.36 + 5)
      .attr("text-anchor", hi < 0 ? "start" : "end").attr("font-size", 13).style("fill", "var(--wrong)").text("truth outside every guess");
    if (shownMean && shownMean[r] != null) {
      const sx = clampX(shownMean[r]);
      svg.append("path").attr("d", d3.symbol(d3.symbolTriangle, 70)()).attr("transform", `translate(${sx},${M.t + r * rowH + 7}) rotate(180)`)
        .attr("fill", "var(--person)").attr("stroke", "var(--ink)").attr("stroke-width", 1);
      if (r === 1) svg.append("text").attr("x", sx + 9).attr("y", M.t + r * rowH + 12).attr("font-size", 13)
        .style("fill", "var(--ink-soft)").text("average they were shown");
    }
    const g = svg.append("g");
    logs[r].forEach((v, i) => {
      if (v == null) return;
      const out = v < DOM[0] || v > DOM[1];
      g.append("circle").attr("cx", clampX(v)).attr("cy", pos[r][i]).attr("r", rad)
        .attr("fill", out ? "var(--card)" : "var(--person)").attr("stroke", out ? "var(--person)" : "var(--card)").attr("stroke-width", out ? 2 : 1);
    });
    const c = crowdLog(logs[r]);
    svg.append("line").attr("x1", clampX(c)).attr("x2", clampX(c)).attr("y1", yMid(r) - rowH * 0.42).attr("y2", yMid(r) + rowH * 0.42)
      .attr("stroke", "var(--crowd)").attr("stroke-width", 4).attr("stroke-linecap", "round");
    if (r === S.shown - 1) svg.append("text").attr("class", "hand").attr("x", clampX(c) + (c < 1.4 ? 8 : -8)).attr("y", M.t + r * rowH + 13)
      .attr("text-anchor", c < 1.4 ? "start" : "end").attr("font-size", 19).style("fill", "var(--crowd)").text("crowd");
  }
  if (S.shown < ROUNDS && S.mode === "data") svg.append("text").attr("class", "hand").attr("x", (M.l + W - M.r) / 2).attr("y", yMid(S.shown) + 6)
    .attr("text-anchor", "middle").attr("font-size", 21).style("fill", "var(--ink-soft)").text("Press “Next round” (or N)");
}

function drawReadouts() {
  const { logs, conf } = current();
  const r = S.shown - 1, first = logs[0], last = logs[r];
  const rows = [
    ["crowd", "The crowd's answer is", offBy(crowdLog(last)), r > 0 ? `guess 1: ${offBy(crowdLog(first))}` : ""],
    ["", "Guesses typically differ by", times(spreadLog(last)), r > 0 ? `guess 1: ${times(spreadLog(first))}` : ""],
    [centrality(last) === 0 ? "wrong" : "truth", "How central the truth is (0–6)", `${centrality(last)}`,
      r > 0 ? `guess 1: ${centrality(first)}` : "6 = in the middle of the guesses"],
  ];
  if (conf && S.shown === ROUNDS) rows.push(["", "Confidence (1–6), first → last", `${fmt(mean(conf.map(c => c[0])), 1)} → ${fmt(mean(conf.map(c => c[1])), 1)}`, ""]);
  root.querySelector(".readouts").innerHTML = rows.map(([c, k, v, sub]) =>
    `<div class="readout ${c}"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="k">${sub}</div>` : ""}</div>`).join("");
}

// ---------- chart: all groups (data) or many simulated groups (what if) ----------
function summaries() {
  const by = {};
  if (S.mode === "data") {
    for (const { value } of COND) by[value] = GROUPS.filter(g => g.condition === value)
      .map(g => d3.range(ROUNDS).map(r => g.est.map(e => lg(e[r], QUESTIONS[g.question - 1].truth))));
  } else {
    for (const { value } of COND.slice(0, 2)) by[value] = d3.range(SIMS).map(() => simulate(S.n, S.bias, S.spread, S.pull, value).logs);
  }
  const out = {};
  for (const [cond, groups] of Object.entries(by)) out[cond] = {
    spread: d3.range(ROUNDS).map(r => median(groups.map(g => spreadLog(g[r])))),
    error: d3.range(ROUNDS).map(r => median(groups.map(g => Math.abs(crowdLog(g[r]))))),
    centre: d3.range(ROUNDS).map(r => mean(groups.map(g => centrality(g[r])))),
  };
  return out;
}

function drawChart() {
  const data = S.mode === "data";
  root.querySelector(".chart-title").textContent = data
    ? "All 72 groups: what seeing others did, guess by guess"
    : `${SIMS} imaginary groups like this one`;
  root.querySelector(".chart-note").innerHTML = data
    ? `Seeing others always shrank the spread and pushed the truth towards the edge of the guesses, while people grew more confident. Did the crowd's answer improve? Only when people saw the average (20 of 24 groups), a point <a href="#/becker">Becker et al.</a> later took further. Crowd error = average error − spread: <a href="#/page">Page's difference</a>, on a log scale.`
    : `With no one to copy, nothing changes. Seeing the average narrows the spread; whether the crowd also improves depends on where the average sits. Lines are medians over ${SIMS} groups.`;
  const svg = d3.select(root.querySelector("svg.chart"));
  svg.selectAll("*").remove();
  const sum = summaries();
  const conds = COND.filter(c => sum[c.value]);
  const panels = [
    { key: "spread", title: "How much guesses differ", fmtY: v => times(v), min0: true },
    { key: "error", title: "How far off the crowd is", fmtY: v => times(v), min0: true },
    { key: "centre", title: "How central the truth is", fmtY: v => fmt(v, 0), min0: true, max: 6 },
  ];
  const pw = (CW - 20) / 3;
  panels.forEach((p, k) => {
    const g = svg.append("g").attr("transform", `translate(${k * pw},0)`);
    const x = d3.scaleLinear([1, ROUNDS], [CM.l, pw - CM.r]);
    const hi = p.max ?? d3.max(conds.flatMap(c => sum[c.value][p.key])) * 1.1;
    const y = d3.scaleLinear([0, hi], [CH - CM.b, CM.t]).nice();
    g.append("g").attr("class", "grid").attr("transform", `translate(${CM.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-(pw - CM.l - CM.r)).tickFormat("")).select(".domain").remove();
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${CH - CM.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")));
    const ticks = p.max ? y.ticks(4) : [1, 1.5, 2, 3, 5, 10, 20, 50].map(Math.log10).filter(v => v <= y.domain()[1]);
    g.append("g").attr("class", "axis").attr("transform", `translate(${CM.l},0)`).call(d3.axisLeft(y).tickValues(ticks).tickFormat(p.fmtY));
    g.append("text").attr("x", CM.l).attr("y", 18).attr("font-size", 16).attr("font-weight", 700).text(p.title);
    g.append("text").attr("x", pw - CM.r).attr("y", CH - 4).attr("text-anchor", "end").attr("font-size", 14).style("fill", "var(--ink-soft)").text("guess");
    for (const c of conds) {
      const pts = sum[c.value][p.key].map((v, r) => [x(r + 1), y(v)]);
      g.append("path").datum(pts).attr("fill", "none").attr("stroke", c.color).attr("stroke-width", 3.5).attr("d", d3.line());
      g.selectAll(null).data(pts).join("circle").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("r", 4).attr("fill", c.color);
    }
  });
  root.querySelector(".chart-legend").innerHTML = conds.map(c =>
    `<span class="key"><span class="swatch" style="background:${c.color}"></span>${c.label}</span>`).join("");
}

// ---------- guided story ----------
// Show one real group (question q, condition, group g) with the first `shown` guesses.
function setData(q, cond, g, shown) {
  Object.assign(S, { mode: "data", q, cond, g, shown });
  root.querySelectorAll(".mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === "data")));
  buildControls();
  S.shown = shown;
  draw();
}
// an imaginary group with the given first-guess bias, seeing the ordinary average
function setWhatIf(bias) {
  Object.assign(S, { mode: "whatif", n: 12, bias, spread: 0.5, pull: 0.4, simCond: "mean" });
  root.querySelectorAll(".mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === "whatif")));
  newCrowd();
  buildControls();
  draw();
}
// the two real groups the story follows, both on question 3 (new residents of Zurich)
const SAW_AVERAGE = [3, "mean", 3], SAW_NOTHING = [3, "none", 2];
const rows = () => current().logs;
const span = r => { const v = valid(rows()[r]); return `${times(Math.min(...v))} to ${times(Math.max(...v))}`; };
const conf = k => fmt(mean(current().conf.map(c => c[k])), 1);

export const story = [
  { setup: () => setData(...SAW_AVERAGE, 1),
    text: `<p><b>Zurich, 2008.</b> Jan Lorenz and colleagues sat 144 students in groups of 12 and asked them questions with a numerical answer, such as how many new residents Zurich gained in 2006. Guesses were paid by how close they were.</p>
           <p>Each person guessed five times. Between guesses, some groups saw nothing, some saw the average of everyone's last guesses, some saw every guess. Did seeing others make the crowd wiser?</p>` },
  { target: ".stage-card", reveal: [".stage-card"], setup: () => setData(...SAW_AVERAGE, 1),
    text: () => `<p>Here are the first guesses of one group, made alone. The truth was ${fmt(question().truth)} (green line).</p>
                 <p>The axis is logarithmic: each step is ten times bigger. These guesses range from ${span(0)} the truth. The <span style="color:var(--crowd)">yellow line</span> is the crowd's answer, the geometric mean.</p>` },
  { target: ".readouts", reveal: [".readouts"],
    text: () => `<p>The crowd's answer is ${offBy(crowdLog(rows()[0]))}. Guesses typically differ by ${times(spreadLog(rows()[0]))}.</p>
                 <p>"How central the truth is" counts how many pairs of guesses, lowest with highest, second lowest with second highest and so on, still have the truth between them. Here ${centrality(rows()[0])} of 6.</p>` },
  { target: '[data-tour="next"]', reveal: [".controls", '[data-tour="next"]'], place: "below", setup: () => setData(...SAW_AVERAGE, 1),
    text: `<p>Before each new guess, this group saw the average of everyone's last guesses (▲). <b>Press Next round</b> to reveal guesses 2 to 5.</p>`,
    waitFor: { event: "click", target: '[data-tour="next"]', until: () => S.shown === ROUNDS, prompt: "Press Next round until all five guesses show." } },
  { target: ".stage-card", setup: () => setData(...SAW_AVERAGE, ROUNDS),
    text: () => `<p>Follow the grey paths: people move towards the average, and towards each other. Guesses that differed by ${times(spreadLog(rows()[0]))} now differ by only ${times(spreadLog(rows()[4]))}.</p>` },
  { target: ".readouts",
    text: () => `<p>At first, ${centrality(rows()[0])} pairs of guesses had the truth between them. By the fifth guess, ${centrality(rows()[4]) === 0 ? "none did: the truth now lies outside every guess" : `only ${centrality(rows()[4])}`}.</p>
                 <p>Yet people grew more confident, from ${conf(0)} to ${conf(1)} on a scale of 1 to 6. Less diverse, more sure.</p>` },
  { target: '[data-tour="cond"]', reveal: ['[data-tour="cond"]'], place: "below",
    text: `<p>Compare a group that saw <b>nothing</b> between guesses.</p>`,
    waitFor: { event: "click", target: '[data-tour="cond"] button[data-value="none"]', prompt: "Click “See nothing”." } },
  { target: ".stage-card", setup: () => setData(...SAW_NOTHING, ROUNDS),
    text: () => `<p>A group on the same question that saw nothing. People still change their minds a little, but they do not close in on each other: guesses differ by ${times(spreadLog(rows()[0]))} at first and ${times(spreadLog(rows()[4]))} at the end.</p>
                 <p>The truth stays central (${centrality(rows()[0])} of 6, then ${centrality(rows()[4])}), and confidence does not rise (${conf(0)} to ${conf(1)}).</p>` },
  { target: ".chart-card", reveal: [".chart-card", '[data-tour="question"]', '[data-tour="group"]', '[data-tour="all"]', '[data-tour="again"]'],
    text: `<p>Now all 72 groups. Seeing others, the average (blue) or every guess (purple), shrinks the spread and pushes the truth towards the edge of the guesses. Seeing nothing (grey) changes little.</p>
           <p>Lorenz et al. called this the <b>social influence effect</b>.</p>` },
  { target: ".chart-card",
    text: `<p>Now the middle panel. Seeing the average also made the crowd's answer better: in 20 of 24 groups. Seeing every guess did not help.</p>
           <p>So is influence good or bad? Here is one explanation worth testing.</p>` },
  { target: ".mode", reveal: [".mode"], place: "below",
    text: `<p>Test it with imaginary groups.</p>`,
    waitFor: { event: "click", target: '.mode button[data-value="whatif"]', prompt: "Click “What if…”." } },
  { target: [".stage-card", ".chart-card"], setup: () => setWhatIf(-0.3),
    text: `<p>Most people in the experiment guessed too low. And "the average" they were shown was the ordinary average, which a few huge guesses drag upwards, towards the truth.</p>
           <p>These imaginary groups guess about 2× too low and see that average. In the chart, the crowd's error shrinks (blue).</p>` },
  { target: '[data-tour="bias"]', place: "below",
    text: `<p>Now make first guesses lean <b>too high</b> instead.</p>`,
    waitFor: { event: "input", target: '[data-tour="bias"] input', until: () => S.bias >= 0.2, prompt: "Drag “First guesses are typically” to too high." } },
  { target: ".chart-card",
    text: `<p>Now seeing the average makes the crowd <i>worse</i>: the same upward pull drags it further from the truth.</p>
           <p>Influence always shrinks diversity. Whether it also improves accuracy depends on where the shared signal sits, not on influence itself.</p>` },
  { text: `<p>That's Lorenz's influence. Seeing others makes a crowd less diverse and more confident, and can push the truth outside every guess. Whether its answer gets better depends on what people see.</p>
           <p>Next: does it matter <i>whom</i> people listen to? Try <a href="#/becker">Becker's networks</a>.</p>` },
];

