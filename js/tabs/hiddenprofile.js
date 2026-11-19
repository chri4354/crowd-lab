import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { slider, button, seg, fmt } from "../lib/util.js";

// A toy hidden profile, built on Stasser & Titus's (1987) collective information sampling
// rule; our own model, not data from their papers. Four members choose between two
// candidates. Best has 8 good points, Okay has 4. In the hidden profile, everyone holds
// Okay's 4 and each member holds 2 of Best's, so each member alone sees Okay 4, Best 2.
// In a meeting, each holder of a point mentions it, independently, with probability p:
// a point held by k members comes up with probability 1 − (1 − p)^k. The group picks the
// candidate with more good points mentioned; a tie is split evenly (a coin flip in one
// meeting). With everyone knowing everything, all 12 points are held by all four.
const W = 900, H = 446;
const M = 4, CARD_W = 205, CARD_GAP = 14, CARD_X0 = (W - (M * CARD_W + (M - 1) * CARD_GAP)) / 2, CARD_Y = 8, CARD_H = 222;
const CHIP_W = 38, CHIP_H = 26, CHIP_GAP = 6;
const BOARD_Y = 248, SLOT_W = 46, SLOT_H = 30, SLOT_GAP = 8;
const CW = 900, CH = 270, CM = { l: 56, r: 24, t: 20, b: 46 };
const STEP_MS = 320;
const BEST = "var(--series-1, #3B4BE4)", OKAY = "var(--series-2, #e2612c)";
const HIDDEN_C = "var(--series-3, #12966a)", SHARED_C = "var(--series-0, #7d7a85)";
const colour = cand => (cand === "best" ? BEST : OKAY);
const name = cand => (cand === "best" ? "Best" : "Okay");

let S, root, ctl, timer = null;

export function mount(el) {
  root = el;
  S = { p: 0.25, cond: "hidden", meet: null, tally: null, seen: freshSeen() };
  el.innerHTML = `
    <header class="tab-head">
      <h1>Hidden profiles</h1>
      <p class="question">Four colleagues choose between two candidates. Between them they know Best is the stronger one, but each of them alone prefers Okay. Does the meeting bring out what they know?</p>
    </header>
    <div class="mode"></div>
    <div class="layout" style="margin-top:1rem">
      <div>
        <div class="card stage-card"><svg class="room" viewBox="0 0 ${W} ${H}" role="img" aria-label="What each member knows, and what was discussed"></svg></div>
        <div class="readouts"></div>
        <p class="note why"></p>
        <div class="card chart-card">
          <h2>How often does the group pick Best?</h2>
          <div class="chart-legend"></div>
          <svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img"></svg>
        </div>
      </div>
      <div class="card controls"></div>
    </div>`;
  el.querySelector(".mode").appendChild(seg(
    [{ label: "Hidden profile", value: "hidden" }, { label: "Everyone knows everything", value: "shared" }],
    S.cond, c => setCond(c)));

  const c = el.querySelector(".controls");
  c.innerHTML = `<h2>The meeting</h2>`;
  ctl = slider({ label: "Chance one holder mentions an item", min: 0.05, max: 1, step: 0.01, value: S.p, tour: "p",
    format: v => v.toFixed(2), hint: "How much of what they know each person says. Short meetings: low p.",
    onInput: v => setP(v) });
  c.appendChild(ctl);
  const presets = document.createElement("div"); presets.className = "btn-row";
  presets.appendChild(button("Short meeting (p = 0.25)", () => setP(0.25)));
  presets.appendChild(button("Long meeting (p = 0.75)", () => setP(0.75)));
  presets.appendChild(button("Everyone knows everything", () => setCond("shared")));
  c.appendChild(presets);
  const row = document.createElement("div"); row.className = "btn-row";
  row.appendChild(button("Run a meeting", runMeeting, "primary")); row.lastChild.dataset.tour = "meet";
  row.appendChild(button("Run 1,000 meetings", thousand)); row.lastChild.dataset.tour = "thousand";
  c.appendChild(row);
  const note = document.createElement("p"); note.className = "note";
  note.innerHTML = `Each member mentions each point they hold with chance p, independently of the others. A point held by k members comes up with chance 1 − (1 − p)<sup>k</sup>. The group picks the candidate with more good points mentioned; a tie is a coin flip.
    <br><br>This is a toy model built on Stasser and Titus's (1987) sampling rule, not data from their studies.`;
  c.appendChild(note);
  draw();
}

export function onKey(k) { if (k === "r") runMeeting(); }
export function unmount() { clearTimeout(timer); root = null; }

// ---------- the model ----------
// the 12 good points and who holds them
function items(cond) {
  const all = d3.range(M);
  const best = d3.range(8).map(i => ({ id: `B${i + 1}`, cand: "best", holders: cond === "shared" ? all : [Math.floor(i / 2)] }));
  const okay = d3.range(4).map(i => ({ id: `O${i + 1}`, cand: "okay", holders: all }));
  return [...best, ...okay];
}
const discussed = (p, k) => 1 - Math.pow(1 - p, k);

function binomPmf(n, q) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    let c = 1;
    for (let j = 0; j < k; j++) c = (c * (n - j)) / (j + 1);
    out.push(c * Math.pow(q, k) * Math.pow(1 - q, n - k));
  }
  return out;
}
// exact P(group picks Best): Best's 8 points each come up with chance qb, Okay's 4 with qo
function pBest(nb, qb, no, qo) {
  const pb = binomPmf(nb, qb), po = binomPmf(no, qo);
  let s = 0;
  pb.forEach((a, kb) => po.forEach((b, ko) => { s += a * b * (kb > ko ? 1 : kb === ko ? 0.5 : 0); }));
  return s;
}
const pBestHidden = p => pBest(8, p, 4, discussed(p, 4));
const pBestShared = p => pBest(8, discussed(p, 4), 4, discussed(p, 4));
const pBestNow = (p = S.p) => (S.cond === "shared" ? pBestShared(p) : pBestHidden(p));

// one meeting: every holder of every point gets one chance to mention it
function meeting(p, cond) {
  const its = items(cond);
  const res = its.map(it => {
    const said = it.holders.map(() => Math.random() < p);
    return { ...it, said, up: said.some(Boolean) };
  });
  const best = res.filter(r => r.up && r.cand === "best").length, okay = res.filter(r => r.up && r.cand === "okay").length;
  const coin = Math.random() < 0.5 ? "best" : "okay";
  const pick = best > okay ? "best" : okay > best ? "okay" : coin;
  return { res, best, okay, tie: best === okay, pick };
}

// ---------- running meetings ----------
function freshSeen() { return { shared: [0, 0], unique: [0, 0] }; }
function stop() { clearTimeout(timer); timer = null; }

function runMeeting() {
  stop();
  const m = meeting(S.p, S.cond);
  m.order = d3.shuffle(d3.range(m.res.length));
  m.shown = 0;
  S.meet = m;
  draw();
  const step = () => {
    if (!root || S.meet !== m) return;
    m.shown++;
    if (m.shown >= m.order.length) {
      for (const r of m.res) { const s = S.seen[r.holders.length > 1 ? "shared" : "unique"]; s[0] += r.up; s[1]++; }
    }
    draw();
    if (m.shown < m.order.length) timer = setTimeout(step, STEP_MS);
  };
  timer = setTimeout(step, STEP_MS);
}

function thousand() {
  let best = 0;
  for (let r = 0; r < 1000; r++) if (meeting(S.p, S.cond).pick === "best") best++;
  S.tally = { best, p: S.p, cond: S.cond };
  draw();
}

function reset() { stop(); S.meet = null; S.tally = null; S.seen = freshSeen(); draw(); }
function setP(v) { S.p = Math.round(v * 100) / 100; ctl.set(S.p); reset(); }
function setCond(c) {
  S.cond = c;
  root.querySelectorAll(".mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === c)));
  reset();
}

// ---------- drawing ----------
function draw() {
  if (!root) return;
  drawRoom();
  drawReadouts();
  drawChart();
}

function chip(g, x, y, w, h, it, { state = "", current = false, shared = false } = {}) {
  const c = g.append("g").attr("transform", `translate(${x},${y})`);
  if (current) c.append("rect").attr("x", -4).attr("y", -4).attr("width", w + 8).attr("height", h + 8).attr("rx", 9)
    .attr("fill", "none").attr("stroke", "var(--crowd)").attr("stroke-width", 4);
  c.append("rect").attr("width", w).attr("height", h).attr("rx", 6)
    .attr("fill", colour(it.cand)).attr("opacity", state === "quiet" ? 0.22 : 1)
    .attr("stroke", "var(--ink)").attr("stroke-width", shared ? 2 : 0).attr("stroke-dasharray", shared ? "4 3" : null);
  c.append("text").attr("x", w / 2).attr("y", h / 2 + 5).attr("text-anchor", "middle").attr("font-size", 14).attr("font-weight", 800)
    .style("fill", "#fff").attr("opacity", state === "quiet" ? 0.6 : 1).text(state === "said" ? `${it.id}✓` : it.id);
  return c;
}

function drawRoom() {
  const svg = d3.select(root.querySelector("svg.room"));
  svg.selectAll("*").remove();
  const its = items(S.cond), m = S.meet;
  const done = m && m.shown >= m.order.length;
  const seenIdx = m ? new Set(m.order.slice(0, m.shown)) : new Set();
  const current = m && !done && m.shown > 0 ? m.order[m.shown - 1] : null;

  // the four members and what each holds
  for (let k = 0; k < M; k++) {
    const x = CARD_X0 + k * (CARD_W + CARD_GAP), g = svg.append("g").attr("transform", `translate(${x},${CARD_Y})`);
    g.append("rect").attr("width", CARD_W).attr("height", CARD_H).attr("rx", 12)
      .attr("fill", "var(--card)").attr("stroke", "var(--ink)").attr("stroke-width", 2);
    g.append("text").attr("class", "hand").attr("x", CARD_W / 2).attr("y", 26).attr("text-anchor", "middle").attr("font-size", 24)
      .text(`Member ${k + 1}`);
    const mine = its.map((it, i) => ({ it, i })).filter(d => d.it.holders.includes(k));
    const ix = (CARD_W - (4 * CHIP_W + 3 * CHIP_GAP)) / 2;
    for (const [cand, y0] of [["okay", 44], ["best", 100]]) {
      const list = mine.filter(d => d.it.cand === cand);
      g.append("text").attr("x", ix).attr("y", y0).attr("font-size", 14).attr("font-weight", 800).style("fill", colour(cand))
        .text(`${name(cand)}'s good points`);
      list.forEach((d, j) => {
        let state = "";
        if (seenIdx.has(d.i)) state = m.res[d.i].said[d.it.holders.indexOf(k)] ? "said" : "quiet";
        chip(g, ix + (j % 4) * (CHIP_W + CHIP_GAP), y0 + 8 + Math.floor(j / 4) * (CHIP_H + CHIP_GAP), CHIP_W, CHIP_H, d.it,
          { state, current: d.i === current, shared: d.it.holders.length > 1 });
      });
    }
    const nb = mine.filter(d => d.it.cand === "best").length, no = mine.filter(d => d.it.cand === "okay").length;
    const pref = nb > no ? "best" : "okay";
    g.append("text").attr("x", CARD_W / 2).attr("y", 188).attr("text-anchor", "middle").attr("font-size", 14).style("fill", "var(--ink-soft)")
      .text(`Alone: Okay ${no} · Best ${nb}`);
    g.append("text").attr("class", "hand").attr("x", CARD_W / 2).attr("y", 211).attr("text-anchor", "middle").attr("font-size", 21)
      .style("fill", colour(pref)).text(`prefers ${name(pref)}`);
  }

  // the shared board: what was discussed
  const bw = W - 2 * CARD_X0;
  svg.append("rect").attr("x", CARD_X0).attr("y", BOARD_Y).attr("width", bw).attr("height", 118).attr("rx", 12)
    .attr("fill", "var(--paper)").attr("stroke", "var(--ink)").attr("stroke-width", 2).attr("stroke-dasharray", "8 6");
  svg.append("text").attr("class", "hand").attr("x", CARD_X0 + 14).attr("y", BOARD_Y + 26).attr("font-size", 22)
    .text("Discussed in the meeting");
  const cols = [{ cand: "best", x: CARD_X0 + 14, n: 8 }, { cand: "okay", x: CARD_X0 + 14 + 8 * (SLOT_W + SLOT_GAP) + 40, n: 4 }];
  let counts = { best: 0, okay: 0 };
  for (const col of cols) {
    const list = its.map((it, i) => ({ it, i })).filter(d => d.it.cand === col.cand);
    const up = list.filter(d => seenIdx.has(d.i) && m.res[d.i].up).length;
    counts[col.cand] = up;
    svg.append("text").attr("x", col.x).attr("y", BOARD_Y + 52).attr("font-size", 14).attr("font-weight", 800).style("fill", colour(col.cand))
      .text(`${name(col.cand)}: ${m ? up : "–"} of ${col.n}`);
    list.forEach((d, j) => {
      const x = col.x + j * (SLOT_W + SLOT_GAP), y = BOARD_Y + 62;
      if (seenIdx.has(d.i) && m.res[d.i].up) chip(svg, x, y, SLOT_W, SLOT_H, d.it, { current: d.i === current, shared: d.it.holders.length > 1 });
      else {
        svg.append("rect").attr("x", x).attr("y", y).attr("width", SLOT_W).attr("height", SLOT_H).attr("rx", 6)
          .attr("fill", "none").attr("stroke", "var(--line)").attr("stroke-width", 2).attr("stroke-dasharray", "4 3");
        if (done || seenIdx.has(d.i)) svg.append("text").attr("x", x + SLOT_W / 2).attr("y", y + SLOT_H / 2 + 5).attr("text-anchor", "middle")
          .attr("font-size", 13).style("fill", "var(--ink-soft)").text(d.it.id);
      }
    });
  }
  svg.append("text").attr("x", CARD_X0 + bw - 14).attr("y", BOARD_Y + 26).attr("text-anchor", "end").attr("font-size", 13)
    .style("fill", "var(--ink-soft)").text("an empty slot = a point nobody mentioned");

  // the outcome
  let head = "Run a meeting to see what gets said.", col = "var(--ink-soft)";
  if (m && !done) head = `Best ${counts.best} · Okay ${counts.okay} so far`, col = "var(--ink)";
  if (done) {
    head = m.tie ? `A tie, ${m.best} – ${m.okay}: a coin flip picks ${name(m.pick)}` : `The group picks ${name(m.pick)}  (Best ${m.best} – Okay ${m.okay})`;
    col = m.pick === "best" ? "var(--truth)" : "var(--wrong)";
  }
  svg.append("text").attr("class", "hand").attr("x", W / 2).attr("y", BOARD_Y + 152).attr("text-anchor", "middle").attr("font-size", 30)
    .style("fill", col).text(head);
  svg.append("text").attr("x", W / 2).attr("y", H - 6).attr("text-anchor", "middle").attr("font-size", 13).style("fill", "var(--ink-soft)")
    .text(S.cond === "hidden"
      ? "dashed edge = all four hold it · no edge = only this member holds it · ✓ = mentioned it · faded = didn't mention it"
      : "dashed edge = all four hold it · ✓ = mentioned it · faded = didn't mention it");
}

function drawReadouts() {
  const p = S.p, pct = v => (v >= 0.995 && v < 1 ? "over 99%" : `${Math.round(v * 100)}%`);
  const rows = [];
  if (S.cond === "hidden") rows.push(["", "A point one member holds comes up", pct(discussed(p, 1))]);
  rows.push(["", "A point all four hold comes up", pct(discussed(p, 4))]);
  const exact = pBestNow();
  rows.push([exact >= 0.5 ? "truth" : "wrong", "Chance the group picks Best", pct(exact)]);
  const { shared, unique } = S.seen;
  if (shared[1]) {
    rows.push(["crowd", "In your meetings, shared points that came up", `${shared[0]} of ${shared[1]}`]);
    if (unique[1]) rows.push(["crowd", "In your meetings, one-holder points that came up", `${unique[0]} of ${unique[1]}`]);
  }
  if (S.tally) rows.push(["crowd", "Of 1,000 meetings, the group picked Best", fmt(S.tally.best)]);
  root.querySelector(".readouts").innerHTML = rows.map(([c, k, v]) =>
    `<div class="readout ${c}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");

  const m = S.meet, w = root.querySelector(".why");
  let note = "";
  if (m && m.shown >= m.order.length) {
    note = S.cond === "hidden"
      ? `Okay's points are held by all four members, so each had four chances to come up. Each of Best's points is held by one member, so it had one chance.`
      : `Every point is held by all four members, so every point had four chances to come up, and Best's 8 points usually outnumber Okay's 4.`;
  }
  w.innerHTML = note; w.hidden = !note;
}

function drawChart() {
  root.querySelector(".chart-legend").innerHTML =
    `<span class="key"><span class="swatch" style="background:${HIDDEN_C}"></span>hidden profile</span>` +
    `<span class="key"><span class="swatch dashed"></span>everyone knows everything</span>` +
    `<span class="key">○ your p · ◆ 1,000 simulated meetings</span>`;
  const svg = d3.select(root.querySelector("svg.chart"));
  svg.selectAll("*").remove();
  const x = d3.scaleLinear([0, 1], [CM.l, CW - CM.r]), y = d3.scaleLinear([0, 1], [CH - CM.b, CM.t]);
  svg.append("g").attr("class", "grid").attr("transform", `translate(${CM.l},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSize(-(CW - CM.l - CM.r)).tickFormat("")).select(".domain").remove();
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${CH - CM.b})`).call(d3.axisBottom(x).ticks(10).tickFormat(d3.format(".1f")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${CM.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".0%")));
  svg.append("text").attr("x", CW - CM.r).attr("y", CH - 4).attr("text-anchor", "end").attr("font-size", 14).style("fill", "var(--ink-soft)")
    .text("p: chance one holder mentions an item");
  svg.append("line").attr("x1", CM.l).attr("x2", CW - CM.r).attr("y1", y(0.5)).attr("y2", y(0.5))
    .attr("stroke", "var(--ink-soft)").attr("stroke-width", 1.5).attr("stroke-dasharray", "2 5");

  const ps = d3.range(0.01, 1.0001, 0.005);
  const curves = [
    { cond: "shared", f: pBestShared, col: SHARED_C, dash: "10 7" },
    { cond: "hidden", f: pBestHidden, col: HIDDEN_C, dash: null },
  ];
  for (const c of curves) {
    const on = c.cond === S.cond;
    svg.append("path").datum(ps).attr("fill", "none").attr("stroke", c.col).attr("stroke-width", on ? 5 : 3)
      .attr("stroke-dasharray", c.dash).attr("stroke-linecap", "round").attr("opacity", on ? 1 : 0.6)
      .attr("d", d3.line(p => x(p), p => y(c.f(p))));
  }
  for (const c of curves) {
    const on = c.cond === S.cond, v = c.f(S.p);
    svg.append("circle").attr("cx", x(S.p)).attr("cy", y(v)).attr("r", on ? 9 : 6).attr("fill", "var(--card)")
      .attr("stroke", on ? "var(--ink)" : c.col).attr("stroke-width", 3);
    if (on) svg.append("text").attr("class", "hand").attr("x", x(S.p) + (S.p > 0.8 ? -16 : 16)).attr("y", y(v) + (v > 0.85 ? 26 : -12))
      .attr("text-anchor", S.p > 0.8 ? "end" : "start").attr("font-size", 22).text(`p = ${S.p.toFixed(2)}: ${v.toFixed(2)}`);
  }
  if (S.tally) {
    const v = S.tally.best / 1000;
    svg.append("path").attr("d", d3.symbol(d3.symbolDiamond, 150)()).attr("transform", `translate(${x(S.tally.p)},${y(v)})`)
      .attr("fill", "var(--crowd)").attr("stroke", "var(--ink)").attr("stroke-width", 2);
    svg.append("text").attr("x", x(S.tally.p) + (S.tally.p > 0.8 ? -14 : 14)).attr("y", y(v) + (v > 0.85 ? 44 : 30))
      .attr("text-anchor", S.tally.p > 0.8 ? "end" : "start").attr("font-size", 15).style("fill", "var(--ink-soft)")
      .text(`1,000 meetings: ${v.toFixed(2)}`);
  }
}

// for checking against the deck's numbers (p_best in render_charts.py)
export const _model = { pBestHidden, pBestShared, discussed, meeting };
