import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { slider, button, seg, fmt } from "../lib/util.js";

// A fishing lake shared by a fleet of boats. Our own agent-based model: Gordon–Schaefer
// for the fish, and a simplified model in the spirit of Sethi & Somanathan (1996) for
// the norms. Not their equations.
//
// Fish: the stock S grows by r·S·(1 − S/K). A boat with effort e catches q·e·S and makes
// p·q·e·S − c·e. Profit per unit of effort is p·q·S − c, so it is zero at S = c/(p·q):
// Gordon's open-access level, where the rent has gone. The most the lake can yield each
// year comes at S = K/2.
//
// Boats are of three types. Cooperators fish the agreed effort E_C. Defectors move their
// effort towards more profit: up while p·q·S > c, down when it is below (capped at E_MAX).
// Enforcers fish like cooperators, and each one sees each defector with chance m; when it
// does, the defector pays a fine F and the enforcer pays a cost γ.
//
// Each round: the fish grow; boats fish; fines; then each boat, with chance REVISE, looks
// at one other boat and, if it earned more this round, copies its type with chance
// (difference) / SCALE (pairwise proportional imitation: replicator dynamics on average).
// With open boundaries, while fishing pays (p·q·S > c), a new boat joins as a defector with
// chance ENTRY per round, up to N_MAX boats; newcomers who lose money leave.
const K = 100, R_GROW = 0.25, Q = 0.01, PRICE = 10, COST = 2;
const N0 = 25, N_MAX = 50, E_C = 0.4, E_MAX = 1.2, ETA = 0.015;
const REVISE = 0.1, SCALE = 1.5, ENTRY = 0.5, EXIT = 0.2, START_D = 0.2, ROUNDS = 300;
const S_OA = COST / (PRICE * Q), S_MSY = K / 2;
// presets start from run 2: in about 92% of runs each Ostrom preset ends the way its name says,
// and run 2 is one of those for both
const FIRST_SEED = 2;

const W = 900, H = 362;
const CW = 900, CH = 230, CM = { l: 64, r: 24, t: 16, b: 44 };
const COL = { C: "var(--series-1, #3B4BE4)", D: "var(--series-2, #e2612c)", E: "var(--series-3, #12966a)" };
const NAME = { C: "cooperators", D: "defectors", E: "enforcers" };

const PRESETS = {
  hardin: { mode: "hardin", e0: 0, d0: 1, m: 0.5, F: 1.2, gamma: 0.3, bounded: false, S0: K },
  holds: { mode: "ostrom", e0: 0.44, d0: START_D, m: 0.5, F: 1.2, gamma: 0.3, bounded: true, S0: K },
  collapses: { mode: "ostrom", e0: 0.2, d0: START_D, m: 0.5, F: 1.2, gamma: 0.3, bounded: true, S0: K },
};

let S, root, ctl, raf = null, last = 0, acc = 0;

export function mount(el) {
  root = el;
  S = { ...PRESETS.hardin, preset: "hardin", seed: FIRST_SEED, speed: 10, world: null };
  el.innerHTML = `
    <header class="tab-head">
      <h1>The commons</h1>
      <p class="question">Twenty-five boats share a lake. Each can fish a little or a lot. Do the fish last, and what does it take?</p>
    </header>
    <div class="mode"></div>
    <div class="layout" style="margin-top:1rem">
      <div>
        <div class="card stage-card"><svg class="lake" viewBox="0 0 ${W} ${H}" role="img" aria-label="The lake, its fish and the boats"></svg></div>
        <div class="readouts"></div>
        <p class="note why"></p>
        <div class="card chart-card stock-card">
          <h2>Fish in the lake</h2>
          <svg class="stock" viewBox="0 0 ${CW} ${CH}" role="img"></svg>
        </div>
        <div class="card chart-card profit-card">
          <h2>Profit from fishing, all boats together</h2>
          <svg class="profit" viewBox="0 0 ${CW} ${CH}" role="img"></svg>
        </div>
        <div class="card chart-card shares-card">
          <h2>Who is fishing how</h2>
          <div class="chart-legend"></div>
          <svg class="shares" viewBox="0 0 ${CW} ${CH}" role="img"></svg>
        </div>
        <div class="card chart-card about-card">
          <h2>Hardin and Ostrom</h2>
          <p class="note" style="margin-top:0">Hardin (1968) argued that a shared resource will be overused unless it is privatised or regulated by the state. Each user gets all of the extra catch, but the cost of a smaller stock is shared by everyone. Gordon (1954) had shown the same for fisheries: with open access, boats keep coming while fishing pays, so the stock falls to the level where a boat's catch only just covers its costs.</p>
          <p class="note">Ostrom (1990) studied communities that have run their own commons for decades or centuries, without either: alpine pastures in Switzerland, village forests in Japan, irrigation in Spain and the Philippines. She set out eight design principles that the long-lasting ones share.</p>
          <p class="note">The sliders cover only three of the eight: <b>clear boundaries</b>, <b>monitoring</b> and <b>sanctions</b> (here one fixed fine; Ostrom's sanctions are graduated, starting small). The other five are rules that fit local conditions, users taking part in making the rules, ways to resolve conflicts cheaply, outside authorities recognising the users' right to organise, and nested layers of governance for larger systems. These do not reduce to a few parameters.</p>
        </div>
      </div>
      <div class="card controls"></div>
    </div>`;
  el.querySelector(".mode").appendChild(seg(
    [{ label: "Hardin: open access", value: "hardin" }, { label: "Ostrom: rules", value: "ostrom" }],
    S.mode, m => applyPreset(m === "hardin" ? "hardin" : "holds")));
  buildControls();
  applyPreset("hardin");
}

export function onKey(k) { if (k === "r") runAgain(); }
export function unmount() { stop(); root = null; }

// ---------- the model (no d3 here, so it can be tested on its own) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newWorld(P, seed) {
  const rand = mulberry32(seed);
  const nE = Math.round(P.e0 * N0), nD = Math.min(N0 - nE, Math.round(P.d0 * N0));
  const types = [...Array(N0 - nE - nD).fill("C"), ...Array(nD).fill("D"), ...Array(nE).fill("E")];
  // shuffle, so the types are spread around the lake
  for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
  const boats = types.map((type, i) => ({ id: i, type, e: E_C, out: false, pay: 0, fined: 0 }));
  const w = { rand, S: P.S0, boats, t: 0, nextId: N0, hist: [] };
  record(w, 0, 0);
  return w;
}

function record(w, harvest, profit) {
  const n = w.boats.length, count = t => w.boats.filter(b => b.type === t).length;
  w.hist.push({ t: w.t, S: w.S, harvest, profit, n, C: count("C"), D: count("D"), E: count("E") });
}

function stepWorld(w, P) {
  const { rand, boats } = w;
  // 1–2. the fish grow and the boats fish, both from this round's stock S0:
  // S1 = S0 + r·S0·(1 − S0/K) − q·E·S0 (the discrete Schaefer model; its steady states are
  // the continuous ones). If the boats would take more than there is, catches are scaled down.
  const S0 = w.S;
  let want = 0; for (const b of boats) want += Q * b.e * S0;
  const f = want > S0 ? S0 / want : 1;
  let profit = 0;
  for (const b of boats) { b.catch = Q * b.e * S0 * f; b.pay = PRICE * b.catch - COST * b.e; b.fined = 0; profit += b.pay; }
  w.S = Math.max(S0 + R_GROW * S0 * (1 - S0 / K) - want * f, 1e-6);
  // 3. each enforcer sees each defector with chance m: a fine F for one, a cost γ for the other
  const E = boats.filter(b => b.type === "E"), D = boats.filter(b => b.type === "D");
  for (const d of D) for (const e of E) if (rand() < P.m) { d.pay -= P.F; d.fined++; e.pay -= P.gamma; }
  // 4. a few boats look at one other boat, and may copy it if it earned more
  const n = boats.length, before = boats.map(b => ({ type: b.type, pay: b.pay }));
  boats.forEach((b, i) => {
    if (n < 2 || rand() >= REVISE) return;
    let j = Math.floor(rand() * (n - 1)); if (j >= i) j++;
    const gain = before[j].pay - before[i].pay;
    if (gain > 0 && rand() < gain / SCALE && before[j].type !== b.type) { b.type = before[j].type; if (b.type !== "D") b.e = E_C; }
  });
  // 5. defectors fish more while it pays, less when it doesn't (profit per unit of effort,
  // at the stock they have just fished)
  const margin = PRICE * Q * S0 - COST;
  for (const b of boats) if (b.type === "D") b.e = Math.min(E_MAX, Math.max(0, b.e + ETA * margin));
  // 6. open boundaries: newcomers join while fishing pays, and leave if they lose money
  if (!P.bounded) {
    if (margin > 0 && boats.length < N_MAX && rand() < ENTRY) boats.push({ id: w.nextId++, type: "D", e: E_C, out: true, pay: 0, fined: 0 });
    for (let i = boats.length - 1; i >= 0; i--) if (boats[i].out && boats[i].pay < 0 && rand() < EXIT) boats.splice(i, 1);
  }
  w.t++;
  record(w, want * f, profit);
}

// what one boat would gain this round from fishing flat out (E_MAX) rather than at the agreed
// effort, and the fine it can expect: the comparison that decides whether defection spreads
function defectionSums(w, P) {
  const margin = PRICE * Q * w.S - COST, nE = w.boats.filter(b => b.type === "E").length;
  return { extra: (E_MAX - E_C) * Math.max(0, margin), fine: P.m * P.F * nE };
}

// ---------- running ----------
const params = () => ({ e0: S.e0, d0: S.d0, m: S.m, F: S.F, gamma: S.gamma, bounded: S.bounded, S0: S.S0 });
const done = () => S.world.t >= ROUNDS;

function reset() { stop(); S.world = newWorld(params(), S.seed); draw(); }
function runAgain() { S.seed++; reset(); }
function step() { stop(); if (!done()) { stepWorld(S.world, params()); draw(); } }

function toggle() { raf ? stop() : start(); }
function start() {
  if (done()) reset();
  ctl.play.textContent = "Pause";
  last = performance.now(); acc = 0;
  const tick = now => {
    acc += ((now - last) / 1000) * S.speed; last = now;
    let k = 0;
    while (acc >= 1 && k < 30 && !done()) { stepWorld(S.world, params()); acc -= 1; k++; }
    if (k) draw();
    if (done()) { stop(); draw(); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  if (ctl?.play) ctl.play.textContent = "Play";
}

function applyPreset(name) {
  Object.assign(S, PRESETS[name], { preset: name, seed: FIRST_SEED });
  root.querySelectorAll(".mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === S.mode)));
  ctl.m.set(S.m); ctl.F.set(S.F); ctl.gamma.set(S.gamma); ctl.e0.set(S.e0);
  setBounded(S.bounded, false);
  ctl.rules.style.display = S.mode === "ostrom" ? "" : "none";
  ctl.presets.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.preset === name)));
  reset();
}

function setBounded(v, redraw = true) {
  S.bounded = v;
  ctl.bounds.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === (v ? "on" : "off"))));
  if (redraw) draw();
}

// a slider change is not one of the presets any more
const custom = () => ctl.presets.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", "false"));

function buildControls() {
  const c = root.querySelector(".controls");
  c.innerHTML = `<h2>The lake</h2>`;
  ctl = {};
  const row = document.createElement("div"); row.className = "btn-row";
  ctl.play = button("Play", toggle, "primary"); ctl.play.dataset.tour = "play";
  row.appendChild(ctl.play);
  row.appendChild(button("Step", step)); row.lastChild.dataset.tour = "step";
  row.appendChild(button("Reset", reset)); row.lastChild.dataset.tour = "reset";
  row.appendChild(button("Run again", runAgain)); row.lastChild.dataset.tour = "again";
  c.appendChild(row);
  c.appendChild(slider({ label: "Speed", min: 2, max: 40, step: 1, value: S.speed, tour: "speed",
    format: v => `${v} rounds/s`, hint: `A run is ${ROUNDS} rounds.`, onInput: v => { S.speed = v; } }));

  ctl.presets = document.createElement("div"); ctl.presets.className = "btn-row"; ctl.presets.dataset.tour = "presets";
  for (const [k, label] of [["hardin", "Hardin: open access"], ["holds", "Norm holds"], ["collapses", "Norm collapses"]]) {
    const b = button(label, () => applyPreset(k)); b.dataset.preset = k; ctl.presets.appendChild(b);
  }
  c.appendChild(ctl.presets);

  // clear boundaries: an on/off toggle
  ctl.bounds = document.createElement("div"); ctl.bounds.className = "control"; ctl.bounds.dataset.tour = "bounds";
  ctl.bounds.innerHTML = `<label><span>Clear boundaries</span></label>`;
  ctl.bounds.appendChild(seg([{ label: "On", value: "on" }, { label: "Off", value: "off" }], S.bounded ? "on" : "off",
    v => { custom(); setBounded(v === "on"); }));
  ctl.bounds.insertAdjacentHTML("beforeend", `<p class="hint">Off: new boats join while fishing pays, up to ${N_MAX}. On: the ${N0} boats are the only ones.</p>`);
  c.appendChild(ctl.bounds);

  // the rules: only in Ostrom mode
  ctl.rules = document.createElement("div"); ctl.rules.className = "controls"; ctl.rules.dataset.tour = "rules";
  ctl.e0 = slider({ label: "Starting share of enforcers", min: 0, max: 0.8, step: 0.04, value: 0.44, tour: "e0",
    format: v => `${Math.round(v * N0)} of ${N0}`, hint: `${Math.round(START_D * N0)} boats start as defectors; the rest cooperate. Changing this restarts the run.`,
    onInput: v => { custom(); S.e0 = v; reset(); } });
  ctl.m = slider({ label: "Monitoring", min: 0, max: 1, step: 0.05, value: 0.5, tour: "m",
    format: v => `${Math.round(v * 100)}%`, hint: "The chance an enforcer sees a given defector in a round.",
    onInput: v => { custom(); S.m = v; draw(); } });
  ctl.F = slider({ label: "Fine", min: 0, max: 3, step: 0.1, value: 1.2, tour: "F",
    format: v => v.toFixed(1), hint: "What a defector pays each time an enforcer sees it.",
    onInput: v => { custom(); S.F = v; draw(); } });
  ctl.gamma = slider({ label: "Cost of fining, to the enforcer", min: 0, max: 1.5, step: 0.05, value: 0.3, tour: "gamma",
    format: v => v.toFixed(2), hint: "Time and trouble, paid by the enforcer each time it fines someone.",
    onInput: v => { custom(); S.gamma = v; draw(); } });
  ctl.rules.append(ctl.e0, ctl.m, ctl.F, ctl.gamma);
  c.appendChild(ctl.rules);

  const note = document.createElement("p"); note.className = "note";
  note.innerHTML = `Each round the fish grow, every boat fishes, enforcers fine the defectors they see, and a few boats copy the type of a boat that earned more.
    <br><br>Prices and costs: a fish sells for ${PRICE}; a unit of effort costs ${COST}. A cooperator's effort is ${E_C}: if all ${N0} boats fish that much, the lake gives the most profit it can, year after year. A defector's effort goes up to ${E_MAX} while fishing pays.
    <br><br>The fish follow the Gordon–Schaefer model. The boats are a simplified model in the spirit of Sethi and Somanathan (1996), not their equations.`;
  c.appendChild(note);
  ctl.seed = document.createElement("p"); ctl.seed.className = "note"; ctl.seed.style.margin = "0";
  c.appendChild(ctl.seed);
}

// ---------- drawing ----------
function draw() {
  if (!root) return;
  ctl.seed.textContent = `Run ${S.seed}. Reset replays it; Run again draws a new one.`;
  drawLake();
  drawReadouts();
  drawStock();
  drawProfit();
  drawShares();
}

// fixed spots for up to 90 fish, inside the lake
const LAKE = { cx: W / 2, cy: 192, rx: 360, ry: 112 };
const FISH = (() => {
  const rand = mulberry32(7), out = [];
  while (out.length < 90) {
    const x = rand() * 2 - 1, y = rand() * 2 - 1;
    if (x * x + y * y < 0.62) out.push({ x: LAKE.cx + x * LAKE.rx, y: LAKE.cy + y * LAKE.ry, flip: rand() < 0.5 });
  }
  return out;
})();

function drawLake() {
  const svg = d3.select(root.querySelector("svg.lake"));
  svg.selectAll("*").remove();
  const w = S.world, nFish = Math.round((w.S / K) * FISH.length);
  svg.append("ellipse").attr("cx", LAKE.cx).attr("cy", LAKE.cy).attr("rx", LAKE.rx + 40).attr("ry", LAKE.ry + 32)
    .attr("fill", "var(--paper-2)").attr("stroke", "var(--ink)").attr("stroke-width", 2.5);
  const fish = svg.append("g");
  FISH.slice(0, nFish).forEach(p => {
    const g = fish.append("g").attr("transform", `translate(${p.x},${p.y}) scale(${p.flip ? -1 : 1},1)`);
    g.append("ellipse").attr("rx", 11).attr("ry", 6).attr("fill", "var(--crowd)").attr("stroke", "var(--ink)").attr("stroke-width", 1.2);
    g.append("path").attr("d", "M9,0 L18,-6 L18,6 Z").attr("fill", "var(--crowd)").attr("stroke", "var(--ink)").attr("stroke-width", 1.2);
  });

  // the boats, round the edge
  const n = w.boats.length;
  w.boats.forEach((b, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
    const x = LAKE.cx + Math.cos(a) * (LAKE.rx + 14), y = LAKE.cy + Math.sin(a) * (LAKE.ry + 12);
    const s = n > 34 ? 0.8 : 1;
    const g = svg.append("g").attr("transform", `translate(${x},${y}) scale(${s})`);
    if (b.fined) g.append("circle").attr("r", 20).attr("fill", "none").attr("stroke", "var(--wrong)").attr("stroke-width", 3);
    g.append("path").attr("d", "M-16,0 L16,0 L10,9 L-10,9 Z").attr("fill", COL[b.type]).attr("stroke", "var(--ink)").attr("stroke-width", 1.5);
    g.append("line").attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", -18).attr("stroke", "var(--ink)").attr("stroke-width", 1.5);
    if (b.type === "E") g.append("path").attr("d", "M0,-18 L12,-14 L0,-10 Z").attr("fill", COL.E).attr("stroke", "var(--ink)").attr("stroke-width", 1);
    if (b.type === "D") g.append("path").attr("d", "M0,-18 L0,-2 L-11,-2 Z").attr("fill", COL.D).attr("stroke", "var(--ink)").attr("stroke-width", 1);
  });

  svg.append("text").attr("class", "hand").attr("x", LAKE.cx).attr("y", 32).attr("text-anchor", "middle").attr("font-size", 32)
    .text(`Round ${w.t} · fish: ${Math.round((w.S / K) * 100)}% of what the lake can hold`);
  svg.append("text").attr("x", W / 2).attr("y", H - 4).attr("text-anchor", "middle").attr("font-size", 17).style("fill", "var(--ink-soft)")
    .text(S.mode === "ostrom" ? "blue: cooperator · orange, big sail: defector · green flag: enforcer · red ring: fined this round"
      : "orange: a boat that fishes as hard as pays · each fish is about 1% of what the lake can hold");
}

function drawReadouts() {
  const w = S.world, h = w.hist[w.hist.length - 1], n = h.n;
  const share = w.S / K, avg = n ? h.profit / n : 0;
  const rows = [
    [share >= 0.4 ? "truth" : share <= 0.3 ? "wrong" : "", "Fish, as a share of what the lake can hold", `${Math.round(share * 100)}%`],
    ["", "Average profit per boat, this round", w.t ? fmt(Math.abs(avg) < 0.005 ? 0 : avg, 2) : "–"],
    [h.D === 0 ? "truth" : h.D / n > 0.5 ? "wrong" : "", "Defectors", `${h.D} of ${n}`],
  ];
  if (S.mode === "ostrom") {
    const d = defectionSums(w, params());
    const extra = Math.max(0, d.extra);
    rows.push(["crowd", "What a defector gains by fishing hard", fmt(extra, 2)]);
    rows.push([d.fine > extra ? "truth" : d.fine < extra ? "wrong" : "", "The fine it can expect", fmt(d.fine, 2)]);
  } else if (!S.bounded) rows.push(["crowd", "Boats on the lake", `${n}`]);
  root.querySelector(".readouts").innerHTML = rows.map(([c, k, v]) =>
    `<div class="readout ${c}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");

  const el = root.querySelector(".why");
  let note = "";
  if (done()) {
    const tail = w.hist.slice(-50), mS = d3.mean(tail, x => x.S) / K;
    if (S.mode === "hardin" || h.D / n > 0.5) {
      const near = Math.abs(mS - S_OA / K) < 0.05;
      note = `After ${ROUNDS} rounds the fish are at ${Math.round(mS * 100)}% of what the lake can hold, ${near ? "close to" : "on the way to"} the open-access level c/(p·q) = ${Math.round((S_OA / K) * 100)}%. There, a boat's catch only just covers its costs, so the profit the lake could give has gone.` +
        (S.mode !== "ostrom" ? "" : S.m > 0 && S.F > 0 && S.gamma > 0
          ? ` Enforcers paid for every fine they gave, so they earned less than cooperators and were copied less, until there were too few to make defecting cost more than it gained.`
          : ` Defectors were rarely made to pay, so defecting paid more than cooperating.`);
    } else if (h.D === 0) {
      note = `No defectors are left, and the fish are at ${Math.round(mS * 100)}% of what the lake can hold. With nobody to fine, enforcers earn what cooperators earn, so neither type gains on the other.${defectionSums(w, params()).fine > defectionSums(w, params()).extra ? " A defector who appeared now would expect a bigger fine than its gain." : " But a defector who appeared now would gain more than the fine it could expect."}` +
        (!S.bounded && n > N0 ? ` But ${n - N0} newcomers have joined, and every extra boat fishes too, so the stock is lower than it would be with clear boundaries.` : "");
    } else {
      note = `After ${ROUNDS} rounds, ${h.D} of ${n} boats still defect. Close to the threshold, chance decides which way a run goes. Try Run again.`;
    }
  }
  el.innerHTML = note; el.hidden = !note;
}

function axes(svg, y, yLabel, yFormat) {
  const x = d3.scaleLinear([0, ROUNDS], [CM.l, CW - CM.r]);
  svg.append("g").attr("class", "grid").attr("transform", `translate(${CM.l},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSize(-(CW - CM.l - CM.r)).tickFormat("")).select(".domain").remove();
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${CH - CM.b})`).call(d3.axisBottom(x).ticks(6));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${CM.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(yFormat)));
  svg.append("text").attr("x", CW - CM.r).attr("y", CH - 4).attr("text-anchor", "end").attr("font-size", 15).style("fill", "var(--ink-soft)").text("round");
  if (yLabel) svg.append("text").attr("x", CM.l + 8).attr("y", CM.t + 4).attr("font-size", 15).style("fill", "var(--ink-soft)").text(yLabel);
  return x;
}

function refLine(svg, x, y, v, label, colour) {
  svg.append("line").attr("x1", CM.l).attr("x2", CW - CM.r).attr("y1", y(v)).attr("y2", y(v))
    .attr("stroke", colour).attr("stroke-width", 2).attr("stroke-dasharray", "7 6");
  svg.append("text").attr("class", "hand").attr("x", CW - CM.r - 4).attr("y", y(v) - 6).attr("text-anchor", "end").attr("font-size", 22)
    .style("fill", colour).text(label);
}

function drawStock() {
  const svg = d3.select(root.querySelector("svg.stock"));
  svg.selectAll("*").remove();
  const y = d3.scaleLinear([0, K], [CH - CM.b, CM.t]);
  const x = axes(svg, y, "", ",d");
  refLine(svg, x, y, S_MSY, "most fish per year, every year: K/2", "var(--truth)");
  refLine(svg, x, y, S_OA, "open access: c/(p·q)", "var(--wrong)");
  svg.append("path").datum(S.world.hist).attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 4)
    .attr("stroke-linejoin", "round").attr("d", d3.line(d => x(d.t), d => y(d.S)));
}

function drawProfit() {
  const svg = d3.select(root.querySelector("svg.profit"));
  svg.selectAll("*").remove();
  const hist = S.world.hist.slice(1);
  const lo = Math.min(0, d3.min(hist, d => d.profit) ?? 0), hi = Math.max(50, d3.max(hist, d => d.profit) ?? 0);
  const y = d3.scaleLinear([lo, hi], [CH - CM.b, CM.t]).nice();
  const x = axes(svg, y, "", ",d");
  // the most the whole lake can earn, year after year (maximum economic yield): total effort
  // E* = r(pqK − c)/(2pq²K), at a stock of K(1 − qE*/r). With these numbers E* = N0·E_C.
  const eStar = (R_GROW * (PRICE * Q * K - COST)) / (2 * PRICE * Q * Q * K);
  const best = PRICE * Q * eStar * K * (1 - (Q * eStar) / R_GROW) - COST * eStar;
  refLine(svg, x, y, best, "the most the lake can earn, every year", "var(--truth)");
  svg.append("line").attr("x1", CM.l).attr("x2", CW - CM.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "var(--ink-soft)").attr("stroke-width", 1.5);
  svg.append("path").datum(hist).attr("fill", "none").attr("stroke", "var(--crowd)").attr("stroke-width", 4)
    .attr("stroke-linejoin", "round").attr("d", d3.line(d => x(d.t), d => y(d.profit)));
}

function drawShares() {
  root.querySelector(".chart-legend").innerHTML = ["C", "D", "E"].map(t =>
    `<span class="key"><span class="swatch" style="background:${COL[t]}"></span>${NAME[t]}</span>`).join("");
  const svg = d3.select(root.querySelector("svg.shares"));
  svg.selectAll("*").remove();
  const y = d3.scaleLinear([0, 1], [CH - CM.b, CM.t]);
  const x = axes(svg, y, "", ".0%");
  const rows = S.world.hist.map(d => ({ t: d.t, C: d.C / d.n, D: d.D / d.n, E: d.E / d.n }));
  const stack = d3.stack().keys(["E", "C", "D"])(rows);
  svg.append("g").selectAll("path").data(stack).join("path").attr("fill", s => COL[s.key]).attr("opacity", 0.85)
    .attr("d", d3.area().x(d => x(d.data.t)).y0(d => y(d[0])).y1(d => y(d[1])));
}

// for checking the model outside the page
export const _model = { newWorld, stepWorld, defectionSums, PRESETS, S_OA, S_MSY, K, ROUNDS };
