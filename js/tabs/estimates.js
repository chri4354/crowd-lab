import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { normal, mean, slider, button, seg, drawPerson, stackDots, fmt } from "../lib/util.js";

// The continuous cousin of the incentives tab. Everyone estimates a number.
// The headline is off by one error everyone shares (sd sH); each private tip
// is off by its own error (sd sP). Person i reports
//   x_i = (1 − t_i)·headline + t_i·tip_i
// and the crowd's answer is the average. People learn t_i by the delta rule
// (Widrow–Hoff, the continuous Rescorla–Wagner), from the error of whatever
// they are paid on: their own estimate, or the crowd's.
const T = 100, DOM = [40, 160];
const W = 900, H = 320, M = { l: 30, r: 30, t: 92, b: 40 };
const CW = 900, CH = 260, CM = { l: 64, r: 30, t: 20, b: 46 };
const N_MAX = 101, ETA = 0.05, ROUNDS_PER_FRAME = 4, TRACE_MAX = 2000;

let S, root, ctl, raf = null;

export function mount(el) {
  root = el;
  S = { pay: "me", n: 25, sH: 10, sP: 20, t: [], round: null, trace: [], recent: [] };
  el.innerHTML = `
    <header class="tab-head">
      <h1>Collective incentives, with estimates</h1>
      <p class="question">The same question as <a href="#/incentives">Collective incentives</a>, but people now guess a number and the crowd takes the average. How much should each guess lean on a private tip rather than the shared headline?</p>
    </header>
    <div class="mode"></div>
    <div class="layout" style="margin-top:1rem">
      <div>
        <div class="card stage-card"><svg class="dots" viewBox="0 0 ${W} ${H}" role="img"></svg></div>
        <div class="readouts"></div>
        <div class="card chart-card">
          <h2>How far off, for each level of trust in the tip?</h2>
          <svg class="landscape" viewBox="0 0 ${CW} ${CH}" role="img"></svg>
        </div>
        <div class="card chart-card">
          <h2>What people learn, round by round</h2>
          <svg class="trace" viewBox="0 0 ${CW} ${CH}" role="img"></svg>
        </div>
      </div>
      <div class="card controls"></div>
    </div>`;
  el.querySelector(".mode").appendChild(seg(
    [{ label: "Pay each person for their own estimate", value: "me" }, { label: "Pay everyone for the crowd's estimate", value: "us" }],
    S.pay, v => { S.pay = v; S.recent = []; draw(); }));
  buildControls();
  forget();
}

export function onKey(k) { if (k === "r") forget(); }
export function unmount() { stop(); root = null; }

const meanT = () => mean(S.t);

function buildControls() {
  const c = root.querySelector(".controls");
  c.innerHTML = `<h2>The world</h2>`;
  ctl = {};
  c.appendChild(slider({ label: "People", min: 1, max: N_MAX, value: S.n,
    onInput: n => { S.n = n; resize(); draw(); } }));
  c.appendChild(slider({ label: "Headline is typically off by", min: 2, max: 30, value: S.sH,
    format: v => `± ${v}`, hint: "Shared: everyone reads the same one, so everyone gets the same error.",
    onInput: v => { S.sH = v; S.recent = []; S.round = playRound(); draw(); } }));
  c.appendChild(slider({ label: "Private tip is typically off by", min: 2, max: 30, value: S.sP,
    format: v => `± ${v}`, hint: "Each person gets their own, with its own error.",
    onInput: v => { S.sP = v; S.recent = []; S.round = playRound(); draw(); } }));
  ctl.t = slider({ label: "Weight on the tip", min: 0, max: 1, step: 0.01, value: 0.5,
    format: v => `${Math.round(v * 100)}%`, hint: "0% = repeat the headline; 100% = go with your own tip.",
    onInput: v => { stop(); S.t = S.t.map(() => v); S.recent = []; S.round = playRound(); draw(); } });
  c.appendChild(ctl.t);
  const row = document.createElement("div"); row.className = "btn-row";
  ctl.play = button("Let them learn", toggle, "primary");
  row.appendChild(ctl.play);
  row.appendChild(button("One round", () => { stop(); learnRound(); draw(); }));
  row.appendChild(button("Forget", forget));
  c.appendChild(row);
  const note = document.createElement("p"); note.className = "note";
  note.innerHTML = `After each round people see how far off the estimate they were paid on was, and nudge their weight on the tip to shrink that error next time. This is the model in Pescetelli (2026, submitted): the continuous version of the <a href="#/incentives">choice tab</a>.`;
  c.appendChild(note);
}

function forget() {
  stop();
  S.t = d3.range(S.n).map(() => 0.5);
  S.trace = []; S.recent = [];
  S.round = playRound();
  draw();
}

// change crowd size, keeping what people have learned; newcomers copy the average
function resize() {
  const t = meanT();
  S.t = S.t.length >= S.n ? S.t.slice(0, S.n) : [...S.t, ...d3.range(S.n - S.t.length).map(() => t)];
  S.recent = [];
  S.round = playRound();
}

// ---------- one round ----------
function playRound() {
  const headline = T + S.sH * normal();
  const people = S.t.map(t => {
    const tip = T + S.sP * normal();
    return { tip, x: (1 - t) * headline + t * tip };
  });
  return { headline, people, crowd: mean(people.map(p => p.x)) };
}

function learnRound() {
  const r = playRound();
  const scale = S.sH * S.sH + S.sP * S.sP;
  S.t = S.t.map((t, i) => {
    const p = r.people[i];
    // error of the estimate this person is paid on; moving t shifts their own
    // estimate by (tip − headline), so step against error × that
    const err = (S.pay === "us" ? r.crowd : p.x) - T;
    return Math.max(0, Math.min(1, t - ETA * err * (p.tip - r.headline) / scale));
  });
  S.round = r;
  S.trace.push(meanT());
  if (S.trace.length > TRACE_MAX) S.trace.shift();
  S.recent.push(Math.abs(r.crowd - T));
  if (S.recent.length > 100) S.recent.shift();
}

function toggle() { raf ? stop() : start(); }
function start() {
  ctl.play.textContent = "Pause";
  const tick = () => {
    for (let k = 0; k < ROUNDS_PER_FRAME; k++) learnRound();
    draw();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  if (ctl?.play) ctl.play.textContent = "Let them learn";
}

// ---------- exact typical errors (root-mean-square) ----------
// error_i = (1 − t)·e_headline + t·e_i;  crowd error = (1 − t)·e_headline + t·mean(e_i)
const personErr = t => Math.sqrt((1 - t) ** 2 * S.sH ** 2 + t ** 2 * S.sP ** 2);
const crowdErr = (t, n = S.n) => Math.sqrt((1 - t) ** 2 * S.sH ** 2 + t ** 2 * S.sP ** 2 / n);
const bestForPerson = () => S.sH ** 2 / (S.sH ** 2 + S.sP ** 2);
const bestForGroup = () => S.sH ** 2 / (S.sH ** 2 + S.sP ** 2 / S.n);
const TS = d3.range(0, 1.0001, 0.005);

// ---------- drawing ----------
function draw() {
  if (!root) return;
  ctl.t.set(meanT());
  drawDots();
  drawReadouts();
  drawLandscape();
  drawTrace();
}

function drawDots() {
  const svg = d3.select(root.querySelector("svg.dots"));
  svg.selectAll("*").remove();
  const x = d3.scaleLinear(DOM, [M.l, W - M.r]);
  const clamp = v => Math.max(DOM[0], Math.min(DOM[1], v));
  const r = S.round, vals = r.people.map(p => clamp(p.x));
  const floor = H - M.b, room = floor - M.t;
  const n = vals.length, asPeople = n <= 60;

  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${floor})`).call(d3.axisBottom(x).ticks(8));

  let size = asPeople ? 30 : 12, dots;
  for (;;) {
    dots = stackDots(vals, x, asPeople ? size * 0.7 : size);
    const top = d3.max(dots, d => d.level) + 1;
    if (top * (asPeople ? size * 0.95 : size) <= room || size <= 3) break;
    size -= 1;
  }
  const g = svg.append("g");
  if (asPeople) {
    g.selectAll("g").data(dots).join("g").attr("class", "person")
      .attr("transform", d => `translate(${d.x},${floor - 2 - d.level * size * 0.95})`)
      .each(function () { drawPerson(d3.select(this), size); });
  } else {
    g.selectAll("circle").data(dots).join("circle")
      .attr("cx", d => d.x).attr("cy", d => floor - size / 2 - d.level * size).attr("r", size / 2 - 0.5)
      .attr("fill", "var(--person)");
  }

  // labels go on the side away from the truth, on three rows
  const side = v => (v >= T ? "start" : "end");
  marker(svg, x(T), "var(--truth)", `truth: ${T}`, 6, r.crowd >= T ? "end" : "start", false);
  marker(svg, x(clamp(r.headline)), "var(--ink-soft)", `headline: ${fmt(r.headline)}`, 34, side(r.headline), true);
  marker(svg, x(clamp(r.crowd)), "var(--crowd)", `crowd average: ${fmt(r.crowd)}`, 62, side(r.crowd), false);
}

function marker(svg, px, color, label, ly, anchor, dashed) {
  svg.append("line").attr("x1", px).attr("x2", px).attr("y1", ly + 6).attr("y2", H - M.b)
    .attr("stroke", color).attr("stroke-width", 4).attr("stroke-linecap", "round")
    .attr("stroke-dasharray", dashed ? "8 7" : null);
  svg.append("text").attr("class", "hand").attr("x", px + (anchor === "start" ? 8 : -8)).attr("y", ly + 16)
    .attr("text-anchor", anchor).attr("font-size", 24).style("fill", color).text(label);
}

function drawReadouts() {
  const t = meanT(), c = crowdErr(t);
  const rows = [
    ["", "The headline is typically off by", `± ${fmt(S.sH, 1)}`],
    ["", "A typical person is off by", `± ${fmt(personErr(t), 1)}`],
    [c < S.sH - 0.05 ? "truth" : "wrong", `The crowd of ${S.n} is off by`, `± ${fmt(c, 1)}`],
    ["crowd", "The best this crowd could do", `± ${fmt(crowdErr(bestForGroup()), 1)}`],
  ];
  if (S.recent.length >= 20) {
    const rms = Math.sqrt(mean(S.recent.map(e => e * e)));
    rows.push(["crowd", `Crowd's typical miss, last ${S.recent.length} rounds`, `± ${fmt(rms, 1)}`]);
  }
  root.querySelector(".readouts").innerHTML = rows.map(([k, label, v]) =>
    `<div class="readout ${k}"><div class="k">${label}</div><div class="v">${v}</div></div>`).join("");
}

function axes(svg, x, y, xLabel, yFormat) {
  svg.append("g").attr("class", "grid").attr("transform", `translate(${CM.l},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSize(-(CW - CM.l - CM.r)).tickFormat("")).select(".domain").remove();
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${CH - CM.b})`)
    .call(d3.axisBottom(x).ticks(10).tickFormat(d3.format(x.domain()[1] <= 1 ? ".0%" : ",d")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${CM.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(yFormat));
  svg.append("text").attr("x", CW - CM.r).attr("y", CH - 2).attr("text-anchor", "end").attr("font-size", 15)
    .style("fill", "var(--ink-soft)").text(xLabel);
}

function triangle(svg, px, py, color, label, below) {
  svg.append("path").attr("d", d3.symbol(d3.symbolTriangle, 160)()).attr("transform", `translate(${px},${py}) rotate(180)`)
    .attr("fill", color).attr("stroke", "var(--ink)").attr("stroke-width", 1.5);
  svg.append("text").attr("class", "hand").attr("x", px).attr("y", py + (below ? 28 : -14))
    .attr("text-anchor", px < 160 ? "start" : px > CW - 160 ? "end" : "middle").attr("font-size", 20).style("fill", color).text(label);
}

function drawLandscape() {
  const svg = d3.select(root.querySelector("svg.landscape"));
  svg.selectAll("*").remove();
  const x = d3.scaleLinear([0, 1], [CM.l, CW - CM.r]);
  const top = Math.max(personErr(0), personErr(1), S.sH) * 1.08;
  const y = d3.scaleLinear([0, top], [CH - CM.b, CM.t]).nice();
  axes(svg, x, y, "weight on the private tip", d => `± ${d}`);

  svg.append("line").attr("x1", CM.l).attr("x2", CW - CM.r).attr("y1", y(S.sH)).attr("y2", y(S.sH))
    .attr("stroke", "var(--ink-soft)").attr("stroke-width", 2).attr("stroke-dasharray", "6 6");
  svg.append("text").attr("class", "hand").attr("x", CW - CM.r).attr("y", y(S.sH) - 8)
    .attr("text-anchor", "end").attr("font-size", 20).style("fill", "var(--ink-soft)").text("the headline alone");

  const line = f => d3.line(t => x(t), t => y(f(t)));
  svg.append("path").datum(TS).attr("fill", "none").attr("stroke", "var(--wrong)").attr("stroke-width", 3)
    .attr("stroke-dasharray", "3 6").attr("stroke-linecap", "round").attr("d", line(personErr));
  svg.append("text").attr("class", "hand").attr("x", x(1) - 4).attr("y", y(personErr(1)) + 22).attr("text-anchor", "end")
    .attr("font-size", 20).style("fill", "var(--wrong)").text("one person");
  svg.append("path").datum(TS).attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 5)
    .attr("stroke-linecap", "round").attr("d", line(t => crowdErr(t)));
  svg.append("text").attr("class", "hand").attr("x", x(0.2)).attr("y", y(crowdErr(0.2)) + 26).attr("text-anchor", "middle")
    .attr("font-size", 20).style("fill", "var(--accent)").text("the crowd's average");

  // lower is better, so the triangles point down onto each curve's minimum
  const bp = bestForPerson(), bg = bestForGroup();
  triangle(svg, x(bp), y(personErr(bp)) - 10, "var(--wrong)", "best for each person", false);
  triangle(svg, x(bg), y(crowdErr(bg)) - 10, "var(--truth)", "best for the group", Math.abs(bg - bp) < 0.15);
  const t = meanT();
  svg.append("circle").attr("cx", x(t)).attr("cy", y(crowdErr(t))).attr("r", 10).attr("fill", "var(--card)")
    .attr("stroke", "var(--ink)").attr("stroke-width", 3);
}

function drawTrace() {
  const svg = d3.select(root.querySelector("svg.trace"));
  svg.selectAll("*").remove();
  const tr = S.trace;
  const x = d3.scaleLinear([0, Math.max(300, tr.length)], [CM.l, CW - CM.r]);
  const y = d3.scaleLinear([0, 1], [CH - CM.b, CM.t]);
  axes(svg, x, y, "rounds", d3.format(".0%"));

  const ref = (v, color, label, dy) => {
    svg.append("line").attr("x1", CM.l).attr("x2", CW - CM.r).attr("y1", y(v)).attr("y2", y(v))
      .attr("stroke", color).attr("stroke-width", 2.5).attr("stroke-dasharray", "6 6");
    svg.append("text").attr("class", "hand").attr("x", CW - CM.r).attr("y", y(v) + dy)
      .attr("text-anchor", "end").attr("font-size", 20).style("fill", color).text(label);
  };
  const bp = bestForPerson(), bg = bestForGroup();
  ref(bp, "var(--wrong)", "best for each person", bp > 0.5 ? 22 : -8);
  ref(bg, "var(--truth)", "best for the group", Math.abs(bg - bp) < 0.12 ? (bp > 0.5 ? 44 : -30) : (bg > 0.5 ? 22 : -8));

  if (tr.length) svg.append("path").datum(tr).attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 4)
    .attr("stroke-linejoin", "round").attr("d", d3.line((d, i) => x(i + 1), d => y(d)));
  else svg.append("text").attr("class", "hand").attr("x", (CM.l + CW - CM.r) / 2).attr("y", y(0.5) - 12)
    .attr("text-anchor", "middle").attr("font-size", 22).style("fill", "var(--ink-soft)").text("Press “Let them learn”");
  svg.append("text").attr("x", CM.l + 8).attr("y", CM.t + 14).attr("font-size", 15).style("fill", "var(--ink-soft)")
    .text("average weight on the private tip");
}
