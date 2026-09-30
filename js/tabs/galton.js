import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { normal, sample, mean, median, slider, button, seg, drawPerson, stackDots, fmt } from "../lib/util.js";
import { TRUE_WEIGHT as T, N_ESTIMATES, reconstructCrowd } from "../../data/galton1907.js";

const POP = reconstructCrowd();
const N_STEPS_FAIR = [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 400, 787];
const N_STEPS_WHATIF = [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 400, 1000];
const W = 900, H = 300, M = { l: 30, r: 30, t: 44, b: 40 };
const CW = 900, CH = 260, CM = { l: 64, r: 30, t: 20, b: 46 };

let S, root;

export function mount(el) {
  root = el;
  S = { mode: "fair", nIdx: 5, sigma: 60, bias: 0, rho: 0, crowd: [], seed: 0 };
  el.innerHTML = `
    <header class="tab-head">
      <h1>Galton's ox</h1>
      <p class="question">Plymouth, 1906. 787 people guess the weight of an ox. How close does the crowd get — and why?</p>
    </header>
    <div class="mode"></div>
    <div class="layout" style="margin-top:1rem">
      <div>
        <div class="card stage-card"><svg class="dots" viewBox="0 0 ${W} ${H}" role="img"></svg></div>
        <div class="readouts"></div>
        <div class="card chart-card">
          <h2 class="chart-title"></h2>
          <svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img"></svg>
        </div>
      </div>
      <div class="card controls"></div>
    </div>`;
  el.querySelector(".mode").appendChild(seg(
    [{ label: "Galton's fair, 1907", value: "fair" }, { label: "What if…", value: "whatif" }],
    S.mode, m => { S.mode = m; buildControls(); newCrowd(); }));
  buildControls();
  newCrowd();
}

export function onKey(k) { if (k === "r") newCrowd(); }
export function unmount() { root = null; }

const nNow = () => (S.mode === "fair" ? N_STEPS_FAIR : N_STEPS_WHATIF)[S.nIdx];

function buildControls() {
  const c = root.querySelector(".controls");
  c.innerHTML = `<h2>${S.mode === "fair" ? "The fair" : "A different fair"}</h2>`;
  const steps = S.mode === "fair" ? N_STEPS_FAIR : N_STEPS_WHATIF;
  S.nIdx = Math.min(S.nIdx, steps.length - 1);
  c.appendChild(slider({
    label: "People in the crowd", min: 0, max: steps.length - 1, value: S.nIdx,
    format: i => fmt(steps[i]), onInput: i => { S.nIdx = i; newCrowd(); },
  }));
  if (S.mode === "whatif") {
    c.appendChild(slider({ label: "How noisy each guess is", min: 5, max: 100, step: 5, value: S.sigma,
      format: v => `± ${v} lb`, hint: "Each person's random error.", onInput: v => { S.sigma = v; newCrowd(); } }));
    c.appendChild(slider({ label: "Shared bias", min: -100, max: 100, step: 5, value: S.bias,
      format: v => `${v > 0 ? "+" : ""}${v} lb`, hint: "An error everyone makes in the same direction.", onInput: v => { S.bias = v; newCrowd(); } }));
    c.appendChild(slider({ label: "How much people copy each other", min: 0, max: 0.9, step: 0.05, value: S.rho,
      format: v => fmt(v, 2), hint: "Correlation between guesses. 0 = fully independent.", onInput: v => { S.rho = v; newCrowd(); } }));
  }
  const row = document.createElement("div"); row.className = "btn-row";
  row.appendChild(button("Ask a new crowd", newCrowd, "primary"));
  if (S.mode === "whatif") row.appendChild(button("Reset", () => { Object.assign(S, { sigma: 60, bias: 0, rho: 0, nIdx: 5 }); buildControls(); newCrowd(); }));
  c.appendChild(row);
  const note = document.createElement("p"); note.className = "note";
  note.innerHTML = S.mode === "fair"
    ? `Each crowd is drawn from Galton's 787 guesses, rebuilt from the percentiles he published in <i>Nature</i> (1907). The extreme tails are extrapolated.`
    : `Same ox, imaginary crowds. Change how people err, and watch what the crowd can and cannot fix.`;
  c.appendChild(note);
}

function newCrowd() {
  const n = nNow();
  if (S.mode === "fair") {
    S.crowd = sample(POP, n);
  } else {
    const z0 = normal(), a = Math.sqrt(S.rho), b = Math.sqrt(1 - S.rho);
    S.crowd = d3.range(n).map(() => T + S.bias + S.sigma * (a * z0 + b * normal()));
  }
  draw();
}

function draw() {
  drawDots();
  drawReadouts();
  drawChart();
}

function drawDots() {
  const svg = d3.select(root.querySelector("svg.dots"));
  svg.selectAll("*").remove();
  const dom = S.mode === "fair" ? [1020, 1340] : [800, 1600];
  const x = d3.scaleLinear(dom, [M.l, W - M.r]);
  const clamp = v => Math.max(dom[0], Math.min(dom[1], v));
  const vals = S.crowd.map(clamp);
  const floor = H - M.b, room = floor - M.t;
  const n = vals.length, asPeople = n <= 60;

  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${floor})`)
    .call(d3.axisBottom(x).ticks(8).tickFormat(d => `${fmt(d)} lb`));

  let size = asPeople ? 30 : 12, dots;
  for (;;) {
    dots = stackDots(vals, x, asPeople ? size * 0.7 : size);
    const top = d3.max(dots, d => d.level) + 1;
    if (top * (asPeople ? size * 0.95 : size) <= room || size <= 3) break;
    size -= 1;
  }
  const g = svg.append("g");
  if (asPeople) {
    g.selectAll("g").data(dots).join("g")
      .attr("class", "person")
      .attr("transform", d => `translate(${d.x},${floor - 2 - d.level * size * 0.95})`)
      .each(function () { drawPerson(d3.select(this), size); });
  } else {
    g.selectAll("circle").data(dots).join("circle")
      .attr("cx", d => d.x).attr("cy", d => floor - size / 2 - d.level * size).attr("r", size / 2 - 0.5)
      .attr("fill", "var(--person)");
  }

  const m = mean(S.crowd), crowdRight = m >= T;
  marker(svg, x(T), "var(--truth)", S.mode === "fair" ? `the ox: ${fmt(T)} lb` : `truth: ${fmt(T)} lb`, M.t - 26, !crowdRight);
  marker(svg, x(clamp(m)), "var(--crowd)", `crowd average: ${fmt(m)} lb`, M.t - 2, crowdRight);
  if (S.mode === "fair" && n > 2) {
    const md = median(S.crowd);
    svg.append("line").attr("x1", x(md)).attr("x2", x(md)).attr("y1", M.t + 14).attr("y2", floor)
      .attr("stroke", "var(--ink-soft)").attr("stroke-dasharray", "4 4").attr("stroke-width", 1.5);
  }
}

function marker(svg, px, color, label, ly, right) {
  svg.append("line").attr("x1", px).attr("x2", px).attr("y1", ly + 6).attr("y2", H - M.b)
    .attr("stroke", color).attr("stroke-width", 4).attr("stroke-linecap", "round");
  const anchor = right ? "start" : "end";
  svg.append("text").attr("class", "hand").attr("x", px + (anchor === "start" ? 8 : -8)).attr("y", ly + 16)
    .attr("text-anchor", anchor).attr("font-size", 24).style("fill", color).text(label);
}

function drawReadouts() {
  const m = mean(S.crowd), crowdErr = Math.abs(m - T);
  const indErr = mean(S.crowd.map(g => Math.abs(g - T)));
  const rows = [
    ["crowd", "The crowd's average is off by", `${fmt(crowdErr)} lb`],
    ["wrong", "A typical person is off by", `${fmt(indErr)} lb`],
  ];
  if (S.mode === "fair") {
    rows.push(["", "Galton's pick: the median guess", `${fmt(median(S.crowd))} lb`]);
  } else {
    const n = S.crowd.length, neff = n / (1 + (n - 1) * S.rho);
    rows.push(["", "The crowd is worth this many independent people", fmt(neff, neff < 10 ? 1 : 0)]);
  }
  root.querySelector(".readouts").innerHTML = rows.map(([c, k, v]) =>
    `<div class="readout ${c}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
}

// Typical error (root-mean-square, lb) of the crowd average, for crowds of size n.
function rmseFair(n, reps = 300) {
  let s = 0;
  for (let r = 0; r < reps; r++) { const e = mean(sample(POP, n)) - T; s += e * e; }
  return Math.sqrt(s / reps);
}
const rmseTheory = n => Math.sqrt(S.bias ** 2 + S.sigma ** 2 * S.rho + (S.sigma ** 2 * (1 - S.rho)) / n);
let fairCurve = null;

function drawChart() {
  root.querySelector(".chart-title").textContent = "How wrong is the crowd's average, for crowds of different sizes?";
  const svg = d3.select(root.querySelector("svg.chart"));
  svg.selectAll("*").remove();
  const nMax = S.mode === "fair" ? N_ESTIMATES : 1000;
  const x = d3.scaleLog([1, nMax], [CM.l, CW - CM.r]);
  let pts;
  if (S.mode === "fair") {
    fairCurve ??= [1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200, 300, 500, 787].map(n => ({ n, e: rmseFair(n) }));
    pts = fairCurve;
  } else {
    pts = d3.range(0, 3.0001, 0.02).map(t => ({ n: 10 ** t, e: rmseTheory(10 ** t) }));
  }
  const yMax = S.mode === "fair" ? d3.max(pts, d => d.e) * 1.1 : Math.max(20, Math.sqrt(S.bias ** 2 + S.sigma ** 2) * 1.1);
  const y = d3.scaleLinear([0, yMax], [CH - CM.b, CM.t]);

  svg.append("g").attr("class", "grid").attr("transform", `translate(${CM.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(CW - CM.l - CM.r)).tickFormat("")).select(".domain").remove();
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${CH - CM.b})`)
    .call(d3.axisBottom(x).tickValues([1, 3, 10, 30, 100, 300, 1000].filter(v => v <= nMax)).tickFormat(d3.format(",")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${CM.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d} lb`));
  svg.append("text").attr("x", CW - CM.r).attr("y", CH - 2).attr("text-anchor", "end").attr("font-size", 15)
    .style("fill", "var(--ink-soft)").text("people in the crowd (log scale)");

  if (S.mode === "whatif") {
    const floorE = Math.sqrt(S.bias ** 2 + S.sigma ** 2 * S.rho);
    const indep = d3.range(0, 3.0001, 0.05).map(t => ({ n: 10 ** t, e: Math.sqrt(S.bias ** 2 + S.sigma ** 2 / 10 ** t) }));
    if (S.rho > 0) svg.append("path").datum(indep).attr("fill", "none").attr("stroke", "var(--ink-soft)")
      .attr("stroke-dasharray", "3 5").attr("stroke-width", 2).attr("d", d3.line(d => x(d.n), d => y(d.e)));
    if (floorE > 0.5) {
      svg.append("line").attr("x1", CM.l).attr("x2", CW - CM.r).attr("y1", y(floorE)).attr("y2", y(floorE))
        .attr("stroke", "var(--wrong)").attr("stroke-width", 2).attr("stroke-dasharray", "8 6");
      svg.append("text").attr("class", "hand").attr("x", CM.l + 10).attr("y", y(floorE) + 24).attr("text-anchor", "start")
        .attr("font-size", 22).style("fill", "var(--wrong)").text(`the floor: ${fmt(floorE)} lb no crowd can average away`);
    }
  }
  svg.append("path").datum(pts).attr("fill", "none").attr("stroke", "var(--crowd)").attr("stroke-width", 5)
    .attr("stroke-linecap", "round").attr("d", d3.line(d => x(d.n), d => y(d.e)).curve(d3.curveMonotoneX));

  const n = nNow(), e = S.mode === "fair" ? rmseFair(n) : rmseTheory(n);
  svg.append("circle").attr("cx", x(n)).attr("cy", y(e)).attr("r", 10).attr("fill", "var(--card)")
    .attr("stroke", "var(--ink)").attr("stroke-width", 3);
  svg.append("text").attr("class", "hand").attr("x", x(n) + (n > 300 ? -14 : 14)).attr("y", y(e) - 12)
    .attr("text-anchor", n > 300 ? "end" : "start").attr("font-size", 22)
    .text(`${fmt(n)} ${n === 1 ? "person" : "people"}: typically off by ${fmt(e)} lb`);
}
