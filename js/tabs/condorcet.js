import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { slider, button, drawPerson, fmt } from "../lib/util.js";

const W = 900, H = 360;
const CW = 900, CH = 260, CM = { l: 64, r: 30, t: 20, b: 46 };
const N_MAX = 101;

let S, root;

export function mount(el) {
  root = el;
  S = { p: 0.6, m: 5, votes: [], tally: null }; // n = 2m + 1
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
  c.appendChild(slider({ label: "Chance each voter is right", min: 0.3, max: 0.9, step: 0.01, value: S.p,
    format: v => `${Math.round(v * 100)}%`, hint: "50% is a coin toss.", onInput: v => { S.p = v; S.tally = null; vote(); } }));
  c.appendChild(slider({ label: "Voters", min: 0, max: (N_MAX - 1) / 2, value: S.m,
    format: m => 2 * m + 1, hint: "Always odd, so there are no ties.", onInput: m => { S.m = m; S.tally = null; vote(); } }));
  const row = document.createElement("div"); row.className = "btn-row";
  row.appendChild(button("Hold a vote", vote, "primary"));
  row.appendChild(button("Hold 1,000 votes", thousand));
  c.appendChild(row);
  vote();
}

export function onKey(k) { if (k === "r") vote(); }
export function unmount() { root = null; }

const nNow = () => 2 * S.m + 1;

// Exact probability that more than half of n voters are right.
function pMajority(n, p) {
  let pmf = Math.pow(1 - p, n), total = 0;
  for (let k = 0; k <= n; k++) {
    if (k > n / 2) total += pmf;
    pmf = pmf * ((n - k) / (k + 1)) * (p / (1 - p));
  }
  return Math.min(1, total);
}

function vote() {
  S.votes = d3.range(nNow()).map(() => Math.random() < S.p);
  draw();
}

function thousand() {
  const n = nNow();
  let wins = 0;
  for (let r = 0; r < 1000; r++) {
    let right = 0;
    for (let i = 0; i < n; i++) if (Math.random() < S.p) right++;
    if (right > n / 2) wins++;
  }
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
  const n = S.votes.length, right = S.votes.filter(Boolean).length, win = right > n / 2;
  const top = 70, avail = { w: W - 40, h: H - top - 16 };
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * (avail.w / avail.h) * 0.8)));
  const rows = Math.ceil(n / cols);
  const cell = Math.min(avail.w / cols, avail.h / rows, 80);
  const x0 = (W - cols * cell) / 2;
  // right votes first, so the split is visible at a glance
  const order = S.votes.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  svg.append("g").selectAll("g").data(order).join("g")
    .attr("class", d => `person ${d.v ? "right" : "wrong"}`)
    .attr("transform", (d, k) => `translate(${x0 + (k % cols + 0.5) * cell},${top + (Math.floor(k / cols) + 0.92) * cell})`)
    .each(function (d) {
      const g = d3.select(this);
      drawPerson(g, cell * 0.85);
      if (cell >= 26) g.append("text").attr("y", -cell * 0.28).attr("text-anchor", "middle")
        .attr("font-size", cell * 0.3).attr("font-weight", 800).style("fill", "#fff").text(d.v ? "✓" : "✗");
    })
    .attr("opacity", 0).transition().delay((d, k) => Math.min(k * 12, 600)).duration(200).attr("opacity", 1);

  svg.append("text").attr("class", "hand").attr("x", W / 2).attr("y", 44).attr("text-anchor", "middle").attr("font-size", 38)
    .style("fill", win ? "var(--truth)" : "var(--wrong)")
    .text(`${win ? "The majority is RIGHT" : "The majority is WRONG"}  (${right} – ${n - right})`);
}

function drawReadouts() {
  const n = nNow(), exact = pMajority(n, S.p);
  const rows = [
    ["", "One voter on their own is right", `${Math.round(S.p * 100)}%`],
    [exact >= S.p ? "truth" : "wrong", `A majority of ${n} is right`, `${(exact * 100).toFixed(1)}%`],
  ];
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

  const pts = d3.range(0, (N_MAX - 1) / 2 + 1).map(m => ({ n: 2 * m + 1, v: pMajority(2 * m + 1, S.p) }));
  svg.append("path").datum(pts).attr("fill", "none").attr("stroke", S.p >= 0.5 ? "var(--truth)" : "var(--wrong)")
    .attr("stroke-width", 5).attr("stroke-linecap", "round").attr("d", d3.line(d => x(d.n), d => y(d.v)).curve(d3.curveMonotoneX));

  const n = nNow(), v = pMajority(n, S.p);
  svg.append("circle").attr("cx", x(n)).attr("cy", y(v)).attr("r", 10).attr("fill", "var(--card)")
    .attr("stroke", "var(--ink)").attr("stroke-width", 3);
}
