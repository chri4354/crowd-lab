import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { button, drawPerson, mean, fmt } from "../lib/util.js";

const W = 900, H = 420, M = { l: 40, r: 40 };
const BASE = 262;           // y of the number line (people's feet)
const SIZE = 58;            // person height
const x = d3.scaleLinear([0, 100], [M.l, W - M.r]);

const PRESETS = {
  "All too high": [58, 62, 66, 70, 74, 78, 82],
  "Bracketing": [30, 38, 46, 55, 62, 70, 49],
  "Clones": [68, 69, 70, 71, 72, 70, 69],
  "Wild": [8, 92, 20, 85, 35, 75, 60],
};

let S, root, nextId;

export function mount(el) {
  root = el;
  nextId = 0;
  S = { truth: 50, people: PRESETS["All too high"].map(v => ({ id: nextId++, v })) };
  el.innerHTML = `
    <header class="tab-head">
      <h1>Page's crowd</h1>
      <p class="question">Drag the people. When does the crowd's average land closer to the truth than they do?</p>
    </header>
    <div class="layout">
      <div>
        <div class="card stage-card"><svg class="line" viewBox="0 0 ${W} ${H}" role="img" aria-label="Guesses on a number line; drag people and the truth flag."></svg></div>
        <div class="card chart-card">
          <h2>The diversity prediction theorem</h2>
          <div class="equation"></div>
          <svg class="bars" viewBox="0 0 900 222" role="img"></svg>
          <p class="note">Errors are <b>squared</b>: a miss of 10 counts 100. That is what makes the equation exact — for any crowd, any truth, always.</p>
        </div>
      </div>
      <div class="card controls"></div>
    </div>`;
  const c = el.querySelector(".controls");
  c.innerHTML = `<h2>Arrange the crowd</h2><p class="note" style="margin:0">Drag people along the line. Drag the green flag to move the truth. With the keyboard: Tab to a person, then ← →.</p>`;
  const presets = document.createElement("div"); presets.className = "btn-row";
  Object.keys(PRESETS).forEach(name => presets.appendChild(button(name, () => {
    S.people = PRESETS[name].map(v => ({ id: nextId++, v })); S.truth = 50; draw();
  })));
  c.appendChild(presets);
  const addrm = document.createElement("div"); addrm.className = "btn-row";
  addrm.appendChild(button("+ person", () => { if (S.people.length < 20) { S.people.push({ id: nextId++, v: Math.round(5 + Math.random() * 90) }); draw(); } }));
  addrm.appendChild(button("− person", () => { if (S.people.length > 2) { S.people.pop(); draw(); } }));
  c.appendChild(addrm);
  const status = document.createElement("div"); status.className = "readouts"; status.style.gridTemplateColumns = "1fr";
  c.appendChild(status);
  draw();
}

export function onKey(k) {
  if (k === "r") { S.people = S.people.map(p => ({ ...p, v: Math.round(5 + Math.random() * 90) })); draw(); }
}
export function unmount() { root = null; }

function stats() {
  const g = S.people.map(p => p.v), m = mean(g);
  const avg = mean(g.map(v => (v - S.truth) ** 2));
  const div = mean(g.map(v => (v - m) ** 2));
  const crowd = (m - S.truth) ** 2;
  return { m, avg, div, crowd };
}

// stack people who overlap, so every one stays grabbable
function levels(people) {
  const placed = [];
  return new Map(people.slice().sort((a, b) => a.v - b.v).map(p => {
    let lv = 0;
    while (placed.some(q => q.lv === lv && Math.abs(x(q.v) - x(p.v)) < SIZE * 0.62)) lv++;
    placed.push({ v: p.v, lv });
    return [p.id, lv];
  }));
}

function kde(values, bw = 7) {
  const k = u => Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
  return d3.range(0, 100.5, 1).map(t => ({ t, d: mean(values.map(v => k((t - v) / bw))) / bw }));
}

function draw() {
  const svg = d3.select(root.querySelector("svg.line"));
  const st = stats();

  // static layer, rebuilt each time (cheap); people are keyed so drags survive
  svg.selectAll(".bg").remove();
  const bg = svg.insert("g", ":first-child").attr("class", "bg");
  bg.append("g").attr("class", "axis").attr("transform", `translate(0,${BASE})`).call(d3.axisBottom(x).ticks(10));

  // distribution of guesses
  const dens = kde(S.people.map(p => p.v));
  const yd = d3.scaleLinear([0, d3.max(dens, d => d.d) || 1], [0, 70]);
  bg.append("path").datum(dens).attr("fill", "var(--person)").attr("opacity", 0.14)
    .attr("d", d3.area(d => x(d.t), () => BASE - 2 * SIZE - 6, d => BASE - 2 * SIZE - 6 - yd(d.d)).curve(d3.curveBasis));
  bg.append("text").attr("x", M.l).attr("y", BASE - 2 * SIZE - 80).attr("font-size", 15).style("fill", "var(--ink-soft)")
    .text("spread of guesses");

  // each person's error, drawn from the truth to their guess
  const sorted = S.people.slice().sort((a, b) => a.v - b.v);
  bg.selectAll("line.err").data(sorted).join("line").attr("class", "err")
    .attr("x1", x(S.truth)).attr("x2", p => x(p.v))
    .attr("y1", (p, i) => BASE + 56 + i * 5).attr("y2", (p, i) => BASE + 56 + i * 5)
    .attr("stroke", "var(--wrong)").attr("stroke-width", 3).attr("stroke-linecap", "round").attr("opacity", 0.75);
  bg.append("text").attr("x", M.l).attr("y", BASE + 50).attr("font-size", 15).style("fill", "var(--ink-soft)")
    .text("each person's miss");

  // crowd average
  bg.append("path").attr("transform", `translate(${x(st.m)},${BASE + 4})`)
    .attr("d", d3.symbol(d3.symbolTriangle, 260)()).attr("fill", "var(--crowd)").attr("stroke", "var(--ink)").attr("stroke-width", 2);
  bg.append("line").attr("x1", x(st.m)).attr("x2", x(st.m)).attr("y1", BASE + 50).attr("y2", BASE + 56 + S.people.length * 5)
    .attr("stroke", "var(--crowd)").attr("stroke-width", 5).attr("stroke-linecap", "round");
  bg.append("text").attr("class", "hand").attr("x", x(st.m)).attr("y", H - 8).attr("text-anchor", "middle")
    .attr("font-size", 24).style("fill", "var(--crowd)").text(`crowd average ${fmt(st.m, 1)}`);

  // people (keyed join)
  const lv = levels(S.people);
  const people = svg.selectAll("g.person").data(S.people, d => d.id);
  people.exit().remove();
  const entered = people.enter().append("g").attr("class", "person draggable").attr("tabindex", 0)
    .attr("role", "slider").attr("aria-valuemin", 0).attr("aria-valuemax", 100)
    .each(function () { drawPerson(d3.select(this), SIZE); })
    .call(d3.drag().on("drag", function (e, d) { d.v = clamp(x.invert(e.x)); draw(); }))
    .on("keydown", function (e, d) {
      const step = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowLeft") { d.v = clamp(d.v - step); draw(); e.preventDefault(); }
      if (e.key === "ArrowRight") { d.v = clamp(d.v + step); draw(); e.preventDefault(); }
    });
  entered.merge(people)
    .attr("transform", d => `translate(${x(d.v)},${BASE - 2 - lv.get(d.id) * SIZE * 0.9})`)
    .attr("aria-valuenow", d => Math.round(d.v)).attr("aria-label", d => `guess ${Math.round(d.v)}`)
    .raise();

  // truth flag (draggable)
  svg.selectAll("g.truth").data([0]).join(enter => {
    const g = enter.append("g").attr("class", "truth draggable").attr("tabindex", 0)
      .attr("role", "slider").attr("aria-label", "the truth");
    g.append("line").attr("y1", -BASE + 20).attr("y2", 12).attr("stroke", "var(--truth)").attr("stroke-width", 4).attr("stroke-linecap", "round");
    g.append("path").attr("d", `M0,${-BASE + 20} l34,10 l-34,10 Z`).attr("fill", "var(--truth)");
    g.append("text").attr("class", "hand lbl").attr("x", 40).attr("y", -BASE + 36).attr("font-size", 24).style("fill", "var(--truth)");
    g.call(d3.drag().on("drag", e => { S.truth = clamp(x.invert(e.x)); draw(); }))
      .on("keydown", e => {
        const step = e.shiftKey ? 5 : 1;
        if (e.key === "ArrowLeft") { S.truth = clamp(S.truth - step); draw(); e.preventDefault(); }
        if (e.key === "ArrowRight") { S.truth = clamp(S.truth + step); draw(); e.preventDefault(); }
      });
    return g;
  }).attr("transform", `translate(${x(S.truth)},${BASE})`)
    .select(".lbl").text(`truth ${fmt(S.truth, 0)}`)
    .attr("text-anchor", S.truth > 80 ? "end" : "start").attr("x", S.truth > 80 ? -8 : 40);

  drawIdentity(st);
  drawStatus(st);
}

const clamp = v => Math.max(0, Math.min(100, v));

function drawIdentity(st) {
  root.querySelector(".equation").innerHTML =
    `<span class="crowd">crowd's error ${fmt(st.crowd)}</span> = <span class="avg">average error ${fmt(st.avg)}</span> − <span class="div">diversity ${fmt(st.div)}</span>`;
  const svg = d3.select(root.querySelector("svg.bars"));
  svg.selectAll("*").remove();
  const L = 10, R = 890, max = Math.max(st.avg, 1);
  const s = d3.scaleLinear([0, max], [0, R - L]);
  const rows = [
    { y: 28, label: "How wrong people are, on average", parts: [{ w: st.crowd, c: "var(--crowd)" }, { w: st.div, c: "var(--accent)" }], v: st.avg, vc: "var(--wrong)" },
    { y: 104, label: "How much they disagree (diversity)", parts: [{ w: st.div, c: "var(--accent)", off: st.crowd }], v: st.div, vc: "var(--accent)" },
    { y: 180, label: "How wrong the crowd is", parts: [{ w: st.crowd, c: "var(--crowd)" }], v: st.crowd, vc: "var(--crowd)" },
  ];
  rows.forEach(r => {
    svg.append("text").attr("x", L).attr("y", r.y - 8).attr("font-size", 18).attr("font-weight", 700).text(r.label);
    svg.append("rect").attr("x", L).attr("y", r.y).attr("width", R - L).attr("height", 36).attr("rx", 8)
      .attr("fill", "none").attr("stroke", "var(--line)").attr("stroke-dasharray", "3 4");
    let acc = 0;
    r.parts.forEach(p => {
      const start = p.off ?? acc;
      svg.append("rect").attr("x", L + s(start)).attr("y", r.y).attr("width", Math.max(0, s(p.w))).attr("height", 36)
        .attr("rx", 8).attr("fill", p.c).attr("stroke", "var(--ink)").attr("stroke-width", 2);
      acc = start + p.w;
    });
  });
  // dotted guides showing the top bar is made of the other two
  [st.crowd, st.avg].forEach(v => svg.append("line").attr("x1", L + s(v)).attr("x2", L + s(v)).attr("y1", 64).attr("y2", 216)
    .attr("stroke", "var(--ink-soft)").attr("stroke-dasharray", "2 4"));
}

function drawStatus(st) {
  const above = S.people.filter(p => p.v > S.truth).length, below = S.people.filter(p => p.v < S.truth).length;
  const bracket = above > 0 && below > 0;
  const beats = S.people.filter(p => Math.abs(p.v - S.truth) < Math.abs(st.m - S.truth)).length;
  root.querySelector(".controls .readouts").innerHTML = `
    <div class="readout ${bracket ? "truth" : "wrong"}"><div class="k">${below} below the truth · ${above} above</div>
      <div class="v">${bracket ? "Bracketed ✓" : "All on one side ✗"}</div></div>
    <div class="readout crowd"><div class="k">People closer to the truth than the crowd's average</div>
      <div class="v">${beats} of ${S.people.length}</div></div>`;
}
