import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { slider, button, drawPerson, fmt } from "../lib/util.js";

const W = 900, H = 380;
const CW = 900, CH = 260, CM = { l: 64, r: 30, t: 20, b: 46 };
const N_MAX = 101;

let S, root;

export function mount(el) {
  root = el;
  // n = 2m + 1; spread = competence spread around p; follow = share copying the leader
  S = { p: 0.6, m: 5, spread: 0, follow: 0, jury: null, tally: null };
  el.innerHTML = `
    <header class="tab-head">
      <h1>Condorcet's jury</h1>
      <p class="question">Each voter is a bit better than a coin toss. Should you trust one of them, or the majority?</p>
    </header>
    <div class="layout">
      <div>
        <div class="card stage-card"><svg class="jury" viewBox="0 0 ${W} ${H}" role="img"></svg></div>
        <div class="readouts"></div>
        <div class="card chart-card">
          <h2>How often is the majority right, as the jury grows?</h2>
          <svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img"></svg>
        </div>
      </div>
      <div class="card controls"></div>
    </div>`;
  const c = el.querySelector(".controls");
  c.innerHTML = `<h2>The jury</h2>`;
  const reset = () => { S.tally = null; vote(); };
  c.appendChild(slider({ label: "Chance each voter is right", min: 0.3, max: 0.9, step: 0.01, value: S.p,
    format: v => `${Math.round(v * 100)}%`, hint: "On average. 50% is a coin toss.", onInput: v => { S.p = v; reset(); } }));
  c.appendChild(slider({ label: "Voters", min: 0, max: (N_MAX - 1) / 2, value: S.m,
    format: m => 2 * m + 1, hint: "Always odd, so there are no ties.", onInput: m => { S.m = m; reset(); } }));
  c.appendChild(slider({ label: "How much voters differ", min: 0, max: 0.4, step: 0.01, value: S.spread,
    format: v => (v === 0 ? "none" : `± ${Math.round(v * 100)} pts`),
    hint: "Some voters better, some worse — the average stays put.", onInput: v => { S.spread = v; reset(); } }));
  c.appendChild(slider({ label: "Who copies an opinion leader", min: 0, max: 0.9, step: 0.05, value: S.follow,
    format: v => `${Math.round(v * 100)}%`,
    hint: "Copiers vote however the leader (★) votes.", onInput: v => { S.follow = v; reset(); } }));
  const row = document.createElement("div"); row.className = "btn-row";
  row.appendChild(button("Hold a vote", vote, "primary"));
  row.appendChild(button("Hold 1,000 votes", thousand));
  c.appendChild(row);
  vote();
}

export function onKey(k) { if (k === "r") vote(); }
export function unmount() { root = null; }

const nNow = () => 2 * S.m + 1;
const clampP = v => Math.max(0.01, Math.min(0.99, v));

// Competences for a jury of n: evenly spread over p ± spread (clipped), so the
// same settings always give the same jury. Voter 0 is the leader, at p.
function competences(n, p = S.p, spread = S.spread) {
  const others = d3.range(n - 1).map(i => clampP(n - 1 === 1 ? p : p - spread + (2 * spread * i) / (n - 2)));
  return [clampP(p), ...others];
}

// Exact P(majority right). The leader votes right with prob c[0]; every other
// voter copies the leader with prob `follow`, else votes right with prob c[i].
function pMajority(n, p = S.p, spread = S.spread, follow = S.follow) {
  const c = competences(n, p, spread);
  const cond = leaderRight => {
    // distribution of right votes among the n-1 others (Poisson–binomial DP)
    let dist = [1];
    for (let i = 1; i < n; i++) {
      const q = follow * (leaderRight ? 1 : 0) + (1 - follow) * c[i];
      const next = new Array(dist.length + 1).fill(0);
      dist.forEach((w, k) => { next[k] += w * (1 - q); next[k + 1] += w * q; });
      dist = next;
    }
    const lead = leaderRight ? 1 : 0;
    return dist.reduce((s, w, k) => s + (k + lead > n / 2 ? w : 0), 0);
  };
  return c[0] * cond(true) + (1 - c[0]) * cond(false);
}

function castVotes(n) {
  const c = competences(n);
  const leader = Math.random() < c[0];
  return c.map((ci, i) => {
    if (i === 0) return { right: leader, leader: true, copy: false, c: ci };
    const copy = Math.random() < S.follow;
    return { right: copy ? leader : Math.random() < ci, leader: false, copy, c: ci };
  });
}

function vote() {
  S.jury = castVotes(nNow());
  draw();
}

function thousand() {
  const n = nNow();
  let wins = 0;
  for (let r = 0; r < 1000; r++) if (castVotes(n).filter(v => v.right).length > n / 2) wins++;
  S.tally = wins;
  vote();
}

function draw() {
  drawJury();
  drawReadouts();
  drawChart();
}

function drawJury() {
  const svg = d3.select(root.querySelector("svg.jury"));
  svg.selectAll("*").remove();
  const jury = S.jury, n = jury.length, right = jury.filter(v => v.right).length, win = right > n / 2;
  const top = 70, avail = { w: W - 40, h: H - top - 30 };
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * (avail.w / avail.h) * 0.8)));
  const rows = Math.ceil(n / cols);
  const cell = Math.min(avail.w / cols, avail.h / rows, 80);
  const x0 = (W - cols * cell) / 2;
  // leader first, then right votes, so the split is visible at a glance
  const order = jury.map((v, i) => ({ ...v, i })).sort((a, b) => (b.leader - a.leader) || (b.right - a.right));
  const g = svg.append("g").selectAll("g").data(order).join("g")
    .attr("class", d => `person ${d.right ? "right" : "wrong"}`)
    .attr("transform", (d, k) => `translate(${x0 + (k % cols + 0.5) * cell},${top + (Math.floor(k / cols) + 0.92) * cell})`)
    // with differing competence, weaker voters are paler
    .attr("opacity", d => (S.spread > 0 ? 0.35 + 0.65 * d.c : 1))
    .each(function (d) {
      const p = d3.select(this);
      drawPerson(p, cell * 0.85);
      if (cell >= 26) p.append("text").attr("y", -cell * 0.28).attr("text-anchor", "middle")
        .attr("font-size", cell * 0.3).attr("font-weight", 800).style("fill", "#fff").text(d.right ? "✓" : "✗");
      if (d.leader) p.append("text").attr("y", -cell * 0.88).attr("text-anchor", "middle")
        .attr("font-size", Math.max(16, cell * 0.42)).style("fill", "var(--crowd)").style("stroke", "var(--ink)")
        .style("stroke-width", 1).text("★");
      if (d.copy && cell >= 18) p.append("circle").attr("cx", cell * 0.3).attr("cy", -cell * 0.7).attr("r", Math.max(3, cell * 0.07))
        .attr("fill", "var(--crowd)").attr("stroke", "var(--ink)").attr("stroke-width", 1);
    });

  svg.append("text").attr("class", "hand").attr("x", W / 2).attr("y", 44).attr("text-anchor", "middle").attr("font-size", 38)
    .style("fill", win ? "var(--truth)" : "var(--wrong)")
    .text(`${win ? "The majority is RIGHT" : "The majority is WRONG"}  (${right} – ${n - right})`);

  const legend = [];
  if (S.follow > 0) legend.push("★ opinion leader   ● copied the leader this time");
  if (S.spread > 0) legend.push("paler = less competent");
  if (legend.length) svg.append("text").attr("x", W / 2).attr("y", H - 8).attr("text-anchor", "middle")
    .attr("font-size", 17).style("fill", "var(--ink-soft)").text(legend.join("   ·   "));
}

function drawReadouts() {
  const n = nNow(), exact = pMajority(n);
  const rows = [
    ["", "One voter on their own is right", `${Math.round(S.p * 100)}%`],
    [exact >= S.p ? "truth" : "wrong", `A majority of ${n} is right`, `${(exact * 100).toFixed(1)}%`],
  ];
  if (S.spread > 0) {
    const below = competences(n).filter(c => c < 0.5).length;
    rows.push(["wrong", "Voters worse than a coin toss", `${below} of ${n}`]);
  }
  if (S.follow > 0) {
    const copied = S.jury.filter(v => v.copy).length;
    rows.push(["crowd", "Copied the leader in this vote", `${copied} of ${n - 1}`]);
  }
  if (S.tally !== null) rows.push(["crowd", "In 1,000 simulated votes, the majority was right", fmt(S.tally)]);
  root.querySelector(".readouts").innerHTML = rows.map(([c, k, v]) =>
    `<div class="readout ${c}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
}

function drawChart() {
  const svg = d3.select(root.querySelector("svg.chart"));
  svg.selectAll("*").remove();
  const x = d3.scaleLinear([1, N_MAX], [CM.l, CW - CM.r]);
  const y = d3.scaleLinear([0, 1], [CH - CM.b, CM.t]);
  svg.append("g").attr("class", "grid").attr("transform", `translate(${CM.l},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSize(-(CW - CM.l - CM.r)).tickFormat("")).select(".domain").remove();
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${CH - CM.b})`).call(d3.axisBottom(x).ticks(10));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${CM.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".0%")));
  svg.append("text").attr("x", CW - CM.r).attr("y", CH - 2).attr("text-anchor", "end").attr("font-size", 15)
    .style("fill", "var(--ink-soft)").text("voters");

  // one voter alone
  svg.append("line").attr("x1", CM.l).attr("x2", CW - CM.r).attr("y1", y(S.p)).attr("y2", y(S.p))
    .attr("stroke", "var(--ink-soft)").attr("stroke-width", 2).attr("stroke-dasharray", "6 6");
  svg.append("text").attr("class", "hand").attr("x", CW - CM.r).attr("y", y(S.p) + (S.p > 0.5 ? 22 : -8))
    .attr("text-anchor", "end").attr("font-size", 22).style("fill", "var(--ink-soft)").text("one voter alone");

  const ns = d3.range(0, (N_MAX - 1) / 2 + 1).map(m => 2 * m + 1);
  const line = d3.line(d => x(d.n), d => y(d.v)).curve(d3.curveMonotoneX);
  const twisted = S.spread > 0 || S.follow > 0;
  if (twisted) {
    // reference: Condorcet's own assumptions — identical, independent voters
    const ref = ns.map(n => ({ n, v: pMajority(n, S.p, 0, 0) }));
    svg.append("path").datum(ref).attr("fill", "none").attr("stroke", "var(--ink-soft)").attr("stroke-width", 2.5)
      .attr("stroke-dasharray", "3 5").attr("d", line);
    const last = ref[ref.length - 1];
    svg.append("text").attr("class", "hand").attr("x", x(last.n) - 4).attr("y", y(last.v) + (S.p >= 0.5 ? 22 : -10))
      .attr("text-anchor", "end").attr("font-size", 20).style("fill", "var(--ink-soft)").text("identical, independent voters");
  }
  const pts = ns.map(n => ({ n, v: pMajority(n) }));
  const good = pts[pts.length - 1].v >= S.p;
  svg.append("path").datum(pts).attr("fill", "none").attr("stroke", good ? "var(--truth)" : "var(--wrong)")
    .attr("stroke-width", 5).attr("stroke-linecap", "round").attr("d", line);

  const n = nNow(), v = pMajority(n);
  svg.append("circle").attr("cx", x(n)).attr("cy", y(v)).attr("r", 10).attr("fill", "var(--card)")
    .attr("stroke", "var(--ink)").attr("stroke-width", 3);
}
