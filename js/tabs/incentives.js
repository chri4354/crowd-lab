import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { slider, button, seg, drawPerson, fmt } from "../lib/util.js";

// After Kao et al. (2014) and Pescetelli et al. (2025). Two options, one right.
// Everyone sees the same headline (right with prob rH) and their own private
// tip (right with prob rL, independently). When the two disagree, person i goes
// with the tip with prob p_i. The group takes the majority. People learn p_i by
// a Rescorla–Wagner rule, rewarded either for their own answer or the group's.
const W = 900, H = 380;
const CW = 900, CH = 260, CM = { l: 64, r: 30, t: 20, b: 46 };
const N_MAX = 101, ALPHA = 0.1, ROUNDS_PER_FRAME = 4, TRACE_MAX = 2000;

let S, root, ctl, raf = null;

export function mount(el) {
  root = el;
  // n = 2m + 1; pay = "me" | "us"; V = associative strengths per person
  S = { pay: "me", m: 12, rH: 0.75, rL: 0.6, people: [], round: null, trace: [], recent: [] };
  el.innerHTML = `
    <header class="tab-head">
      <h1>Collective incentives</h1>
      <p class="question">Everyone sees the same headline. Each person also gets a private tip. When the two disagree, which should they trust — and does it depend on who gets paid?</p>
    </header>
    <div class="mode"></div>
    <div class="layout" style="margin-top:1rem">
      <div>
        <div class="card stage-card"><svg class="crowd" viewBox="0 0 ${W} ${H}" role="img"></svg></div>
        <div class="readouts"></div>
        <div class="card chart-card landscape-card">
          <h2>How often is the group right, for each level of trust in the tip?</h2>
          <svg class="landscape" viewBox="0 0 ${CW} ${CH}" role="img"></svg>
        </div>
        <div class="card chart-card trace-card">
          <h2>What people learn, round by round</h2>
          <svg class="trace" viewBox="0 0 ${CW} ${CH}" role="img"></svg>
        </div>
      </div>
      <div class="card controls"></div>
    </div>`;
  el.querySelector(".mode").appendChild(seg(
    [{ label: "Pay each person for their own answer", value: "me" }, { label: "Pay everyone for the group's answer", value: "us" }],
    S.pay, v => { S.pay = v; S.recent = []; draw(); }));
  buildControls();
  forget();
}

export function onKey(k) { if (k === "r") forget(); }
export function unmount() { stop(); root = null; }

const nNow = () => 2 * S.m + 1;
const pOf = a => a.VL / (a.VL + a.VH);
const meanP = () => d3.mean(S.people, pOf);
// everyone starts knowing nothing: equal, tiny strengths, so p = 0.5
const newPerson = (p = 0.5, s = 0.02) => ({ VL: p * s, VH: (1 - p) * s });

function buildControls() {
  const c = root.querySelector(".controls");
  c.innerHTML = `<h2>The world</h2>`;
  ctl = {};
  c.appendChild(slider({ label: "People", min: 0, max: (N_MAX - 1) / 2, value: S.m, tour: "m",
    format: m => 2 * m + 1, hint: "Always odd, so there are no ties.", onInput: m => { S.m = m; resize(); draw(); } }));
  c.appendChild(slider({ label: "Headline is right", min: 0.5, max: 1, step: 0.01, value: S.rH, tour: "rH",
    format: v => `${Math.round(v * 100)}%`, hint: "Shared: everyone reads the same one.", onInput: v => { S.rH = v; S.recent = []; draw(); } }));
  c.appendChild(slider({ label: "Private tip is right", min: 0.5, max: 1, step: 0.01, value: S.rL, tour: "rL",
    format: v => `${Math.round(v * 100)}%`, hint: "Each person gets their own, independently.", onInput: v => { S.rL = v; S.recent = []; draw(); } }));
  ctl.p = slider({ label: "When they disagree, go with the tip", min: 0, max: 1, step: 0.01, value: 0.5, tour: "p",
    format: v => `${Math.round(v * 100)}%`, hint: "Set it by hand, or let people learn it.",
    onInput: v => setTrust(v) });
  c.appendChild(ctl.p);
  const row = document.createElement("div"); row.className = "btn-row";
  ctl.play = button("Let them learn", toggle, "primary");
  ctl.play.dataset.tour = "play";
  row.appendChild(ctl.play);
  row.appendChild(button("One round", () => { stop(); learnRound(); draw(); }));
  row.lastChild.dataset.tour = "round";
  row.appendChild(button("Forget", forget));
  row.lastChild.dataset.tour = "forget";
  c.appendChild(row);
  const note = document.createElement("p"); note.className = "note";
  note.innerHTML = `After each round, people strengthen whichever source pointed to the answer they were paid on, if it turned out right, and weaken it if not. Nobody knows how big the group is, or that the headline is shared.`;
  c.appendChild(note);
}

// everyone goes with the tip with probability v when the sources disagree
function setTrust(v) {
  stop();
  S.people = S.people.map(() => newPerson(v, 0.5));
  S.recent = [];
  draw();
}

function forget() {
  stop();
  S.people = d3.range(nNow()).map(() => newPerson());
  S.trace = []; S.recent = [];
  S.round = playRound();
  draw();
}

// change group size, keeping what people have learned; newcomers copy the average
function resize() {
  const n = nNow(), p = meanP();
  S.people = S.people.length >= n ? S.people.slice(0, n) : [...S.people, ...d3.range(n - S.people.length).map(() => newPerson(p, 0.5))];
  S.recent = [];
  S.round = playRound();
}

// ---------- one round ----------
function playRound() {
  const headline = Math.random() < S.rH;
  const votes = S.people.map(a => {
    const tip = Math.random() < S.rL;
    const withTip = tip !== headline && Math.random() < pOf(a);
    return { tip, right: tip === headline ? tip : (withTip ? tip : headline), withTip };
  });
  const right = votes.filter(v => v.right).length;
  return { headline, votes, right, groupRight: right > votes.length / 2 };
}

function learnRound() {
  const r = playRound();
  S.people.forEach((a, i) => {
    const v = r.votes[i];
    // the answer this person is paid on, and whether it was right
    const paidRight = S.pay === "us" ? r.groupRight : v.right;
    const d = ALPHA * ((paidRight ? 1 : 0) - (a.VL + a.VH));
    // a source "pointed to" that answer if its rightness matches the answer's
    if (v.tip === paidRight) a.VL = Math.max(1e-4, a.VL + d);
    if (r.headline === paidRight) a.VH = Math.max(1e-4, a.VH + d);
  });
  S.round = r;
  S.trace.push(meanP());
  if (S.trace.length > TRACE_MAX) S.trace.shift();
  S.recent.push(r.groupRight);
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

// ---------- exact accuracy ----------
// P(a binomial(n, q) count is a strict majority)
function majority(n, q) {
  if (q <= 0) return 0;
  if (q >= 1) return 1;
  let pmf = Math.pow(1 - q, n), s = 0;
  for (let k = 0; k <= n; k++) {
    if (k > n / 2) s += pmf;
    pmf *= ((n - k) / (k + 1)) * (q / (1 - q));
  }
  return s;
}
// If everyone goes with the tip with prob p when the sources disagree:
// right | headline right = 1 − p(1 − rL);  right | headline wrong = p·rL
const groupAcc = (p, n = nNow()) => S.rH * majority(n, 1 - p * (1 - S.rL)) + (1 - S.rH) * majority(n, p * S.rL);
const personAcc = p => S.rH + p * (S.rL - S.rH);
const PS = d3.range(0, 1.0001, 0.005);
const bestForGroup = () => PS.reduce((b, p) => (groupAcc(p) > groupAcc(b) + 1e-12 ? p : b), 0);
const bestForPerson = () => (S.rL > S.rH ? 1 : 0);

// ---------- drawing ----------
function draw() {
  if (!root) return;
  ctl.p.set(meanP());
  drawCrowd();
  drawReadouts();
  drawLandscape();
  drawTrace();
}

function drawCrowd() {
  const svg = d3.select(root.querySelector("svg.crowd"));
  svg.selectAll("*").remove();
  const r = S.round, n = r.votes.length;
  const top = 96, avail = { w: W - 40, h: H - top - 30 };
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * (avail.w / avail.h) * 0.8)));
  const rows = Math.ceil(n / cols);
  const cell = Math.min(avail.w / cols, avail.h / rows, 80);
  const x0 = (W - cols * cell) / 2;
  const order = r.votes.map((v, i) => ({ ...v, i })).sort((a, b) => b.right - a.right);
  svg.append("g").selectAll("g").data(order).join("g")
    .attr("class", d => `person ${d.right ? "right" : "wrong"}`)
    .attr("transform", (d, k) => `translate(${x0 + (k % cols + 0.5) * cell},${top + (Math.floor(k / cols) + 0.92) * cell})`)
    .each(function (d) {
      const p = d3.select(this);
      drawPerson(p, cell * 0.85);
      if (cell >= 26) p.append("text").attr("y", -cell * 0.28).attr("text-anchor", "middle")
        .attr("font-size", cell * 0.3).attr("font-weight", 800).style("fill", "#fff").text(d.right ? "✓" : "✗");
      if (d.withTip && cell >= 18) p.append("circle").attr("cx", cell * 0.3).attr("cy", -cell * 0.7).attr("r", Math.max(3, cell * 0.07))
        .attr("fill", "var(--crowd)").attr("stroke", "var(--ink)").attr("stroke-width", 1);
    });

  svg.append("text").attr("class", "hand").attr("x", W / 2).attr("y", 40).attr("text-anchor", "middle").attr("font-size", 26)
    .style("fill", r.headline ? "var(--truth)" : "var(--wrong)")
    .text(`The headline points to the ${r.headline ? "right" : "wrong"} answer`);
  svg.append("text").attr("class", "hand").attr("x", W / 2).attr("y", 80).attr("text-anchor", "middle").attr("font-size", 34)
    .style("fill", r.groupRight ? "var(--truth)" : "var(--wrong)")
    .text(`${r.groupRight ? "The group is RIGHT" : "The group is WRONG"}  (${r.right} – ${n - r.right})`);
  svg.append("text").attr("x", W / 2).attr("y", H - 8).attr("text-anchor", "middle")
    .attr("font-size", 17).style("fill", "var(--ink-soft)").text("● went with their own tip against the headline");
}

function drawReadouts() {
  const p = meanP(), g = groupAcc(p), best = bestForGroup();
  const rows = [
    ["", "The headline on its own is right", `${Math.round(S.rH * 100)}%`],
    ["", "A typical person is right", `${(personAcc(p) * 100).toFixed(1)}%`],
    [g > S.rH + 0.005 ? "truth" : "wrong", `The group of ${nNow()} is right`, `${(g * 100).toFixed(1)}%`],
    ["crowd", "The best this group could do", `${(groupAcc(best) * 100).toFixed(1)}%`],
  ];
  if (S.recent.length >= 20) rows.push(["crowd", `Group right in the last ${S.recent.length} rounds`, `${S.recent.filter(Boolean).length}`]);
  root.querySelector(".readouts").innerHTML = rows.map(([c, k, v]) =>
    `<div class="readout ${c}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
}

function axes(svg, x, y, xLabel, yFormat) {
  svg.append("g").attr("class", "grid").attr("transform", `translate(${CM.l},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSize(-(CW - CM.l - CM.r)).tickFormat("")).select(".domain").remove();
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${CH - CM.b})`).call(d3.axisBottom(x).ticks(10).tickFormat(d3.format(x.domain()[1] <= 1 ? ".0%" : ",d")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${CM.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(yFormat)));
  svg.append("text").attr("x", CW - CM.r).attr("y", CH - 2).attr("text-anchor", "end").attr("font-size", 15)
    .style("fill", "var(--ink-soft)").text(xLabel);
}

// a labelled marker on the x axis: ▲ best for one person / for the group
function marker(svg, px, py, color, label, below) {
  svg.append("path").attr("d", d3.symbol(d3.symbolTriangle, 160)()).attr("transform", `translate(${px},${py})`)
    .attr("fill", color).attr("stroke", "var(--ink)").attr("stroke-width", 1.5);
  svg.append("text").attr("class", "hand").attr("x", px).attr("y", py + (below ? 28 : -14))
    .attr("text-anchor", px < 160 ? "start" : px > CW - 160 ? "end" : "middle").attr("font-size", 20).style("fill", color).text(label);
}

function drawLandscape() {
  const svg = d3.select(root.querySelector("svg.landscape"));
  svg.selectAll("*").remove();
  const x = d3.scaleLinear([0, 1], [CM.l, CW - CM.r]);
  const pts = PS.map(p => ({ p, v: groupAcc(p) }));
  const [lo, hi] = d3.extent([...pts.map(d => d.v), S.rH]);
  const y = d3.scaleLinear([Math.max(0, lo - 0.03), Math.min(1, hi + 0.03)], [CH - CM.b, CM.t]).nice();
  axes(svg, x, y, "trust in the private tip, when the sources disagree", ".0%");

  svg.append("line").attr("x1", CM.l).attr("x2", CW - CM.r).attr("y1", y(S.rH)).attr("y2", y(S.rH))
    .attr("stroke", "var(--ink-soft)").attr("stroke-width", 2).attr("stroke-dasharray", "6 6");
  svg.append("text").attr("class", "hand").attr("x", CW - CM.r).attr("y", y(S.rH) + 22)
    .attr("text-anchor", "end").attr("font-size", 20).style("fill", "var(--ink-soft)").text("the headline alone");

  svg.append("path").datum(pts).attr("fill", "none").attr("stroke", "var(--accent)")
    .attr("stroke-width", 5).attr("stroke-linecap", "round").attr("d", d3.line(d => x(d.p), d => y(d.v)));

  const bp = bestForPerson(), bg = bestForGroup();
  marker(svg, x(bp), y(groupAcc(bp)), "var(--wrong)", "best for each person", groupAcc(bp) > groupAcc(bg) - 0.02);
  marker(svg, x(bg), y(groupAcc(bg)), "var(--truth)", "best for the group", false);
  const p = meanP();
  svg.append("circle").attr("cx", x(p)).attr("cy", y(groupAcc(p))).attr("r", 10).attr("fill", "var(--card)")
    .attr("stroke", "var(--ink)").attr("stroke-width", 3);
}

function drawTrace() {
  const svg = d3.select(root.querySelector("svg.trace"));
  svg.selectAll("*").remove();
  const t = S.trace;
  const x = d3.scaleLinear([0, Math.max(300, t.length)], [CM.l, CW - CM.r]);
  const y = d3.scaleLinear([0, 1], [CH - CM.b, CM.t]);
  axes(svg, x, y, "rounds", ".0%");

  const ref = (v, color, label, dy) => {
    svg.append("line").attr("x1", CM.l).attr("x2", CW - CM.r).attr("y1", y(v)).attr("y2", y(v))
      .attr("stroke", color).attr("stroke-width", 2.5).attr("stroke-dasharray", "6 6");
    svg.append("text").attr("class", "hand").attr("x", CW - CM.r).attr("y", y(v) + dy)
      .attr("text-anchor", "end").attr("font-size", 20).style("fill", color).text(label);
  };
  const bp = bestForPerson(), bg = bestForGroup();
  ref(bp, "var(--wrong)", "best for each person", bp > 0.5 ? 22 : -8);
  ref(bg, "var(--truth)", "best for the group", Math.abs(bg - bp) < 0.12 ? (bp > 0.5 ? 44 : -30) : (bg > 0.5 ? 22 : -8));

  if (t.length) svg.append("path").datum(t).attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 4)
    .attr("stroke-linejoin", "round").attr("d", d3.line((d, i) => x(i + 1), d => y(d)));
  else svg.append("text").attr("class", "hand").attr("x", (CM.l + CW - CM.r) / 2).attr("y", y(0.5) - 12)
    .attr("text-anchor", "middle").attr("font-size", 22).style("fill", "var(--ink-soft)").text("Press “Let them learn”");
  svg.append("text").attr("x", CM.l + 8).attr("y", CM.t + 14).attr("font-size", 15).style("fill", "var(--ink-soft)")
    .text("average trust in the private tip");
}

// ---------- guided story ----------
function setPay(v) {
  S.pay = v;
  S.recent = [];
  root.querySelectorAll(".mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === v)));
  draw();
}
// the tab's starting world: 25 people, headline right 75%, tip right 60%, nothing learned
function startOver() {
  stop();
  Object.assign(S, { m: 12, rH: 0.75, rL: 0.6 });
  buildControls();
  setPay("me");
  forget();
}
const pc = v => `${(v * 100).toFixed(1)}%`;
let rounds = 0;

export const story = [
  { setup: startOver,
    text: `<p>Everyone reads the same headline. It points to the right answer 75% of the time.</p>
           <p>Each person also has a <b>private tip</b> of their own: less reliable, right 60% of the time, but independent of everyone else's.</p>
           <p>When the two disagree, which should you trust? It depends on how people are paid.</p>` },
  { target: ".stage-card", reveal: [".stage-card"], setup: startOver,
    text: `<p>Here are 25 people facing a yes-or-no question. The top line says whether today's headline points the right way.</p>
           <p>Each person votes with the headline or with their tip (● means they went with their tip against the headline). The group decides by majority.</p>` },
  { target: '[data-tour="round"]', reveal: [".controls", '[data-tour="round"]'], place: "below", setup: () => { rounds = 0; },
    text: `<p>Play a few rounds. Each one is a new question, with a new headline and new tips.</p>`,
    waitFor: { event: "click", target: '[data-tour="round"]', until: () => ++rounds >= 3, prompt: "Press One round three times." } },
  { target: ".readouts", reveal: [".readouts"], setup: () => setTrust(0.5),
    text: () => `<p>Right now people go with their tip half the time when the two disagree.</p>
                 <p>A typical person is right ${pc(personAcc(meanP()))} of the time, worse than just following the headline (75%). The group is right ${pc(groupAcc(meanP()))}: hardly better than the headline.</p>` },
  { target: '[data-tour="p"]', reveal: ['[data-tour="p"]'], place: "below",
    text: `<p>Suppose you are paid for <b>your own</b> answer. The headline is more reliable than your tip, so the smart move is to follow the headline every time.</p>`,
    waitFor: { event: "input", target: '[data-tour="p"] input', until: () => meanP() <= 0.05, prompt: "Drag “go with the tip” down to 0%." } },
  { target: ".readouts",
    text: `<p>Now everyone is right 75% of the time, the best anyone can do alone.</p>
           <p>But the group is right exactly 75% too. Everyone copies the same headline, so when it is wrong, they are all wrong together.</p>` },
  { target: [".landscape-card", '[data-tour="p"]'], reveal: [".landscape-card"],
    text: `<p>This curve shows how often the group is right, for every level of trust in the tip. The circle is where your group is now.</p>`,
    waitFor: { event: "input", target: '[data-tour="p"] input', until: () => meanP() >= 0.8, prompt: "Drag “go with the tip” up to 80% or more, and watch the circle." } },
  { target: ".landscape-card",
    text: () => `<p>Best for each person (red ▲): never trust the tip. Best for the group (green ▲): trust it ${Math.round(bestForGroup() * 100)}% of the time, which makes the group right ${pc(groupAcc(bestForGroup()))}.</p>
                 <p>Independent tips cancel out each other's mistakes in the majority, as in <a href="#/condorcet">Condorcet's jury</a>. A shared headline cannot.</p>` },
  { target: '[data-tour="play"]', reveal: [".trace-card", '[data-tour="play"]', '[data-tour="forget"]'], place: "below",
    setup: () => { setPay("me"); setTrust(0.5); S.trace = []; draw(); },
    text: `<p>Real people don't know this curve. They learn from what they are paid on: after each round, they trust a little more whichever source pointed to the answer they were paid for, if it was right.</p>
           <p>Pay them for <b>their own</b> answer, and let them learn.</p>`,
    waitFor: { event: "click", target: '[data-tour="play"]', prompt: "Press Let them learn." } },
  { target: ".trace-card", setup: () => { if (!raf) start(); },
    text: `<p>Trust in the tip sinks to about 20%. People learn to lean on the headline, the best strategy for each of them, and the group ends up no better than the headline.</p>` },
  { target: ".mode", reveal: [".mode", '[data-tour="m"]', '[data-tour="rH"]', '[data-tour="rL"]'], place: "below",
    text: `<p>Same people, same learning rule. Now change <b>how people are paid</b>.</p>`,
    waitFor: { event: "click", target: '.mode button[data-value="us"]', prompt: "Click “Pay everyone for the group's answer”." } },
  { target: [".trace-card", ".readouts"], setup: () => { if (!raf) start(); },
    text: `<p>Trust in the tip climbs towards the green line. Paid for the group's answer, people learn to keep their own information, and the group is right about 86% of the time.</p>
           <p>Notice the cost: a typical person is now right less often than before. The crowd gains what its members lose.</p>` },
  { text: `<p>That's collective incentives. Pay people for their own accuracy and they all lean on the shared source, so the group is no wiser than the headline. Pay them for the group's accuracy and they learn to keep their independent information.</p>
           <p>The model follows Kao et al. (2014); an experiment with real news is Pescetelli et al. (2025). Next: the same idea with numbers instead of choices, in <a href="#/estimates">Incentives, with estimates</a>.</p>` },
];

