import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { slider, button, seg, normal, fmt } from "../lib/util.js";

// After Bahrami et al. (2010), "Optimally interacting minds", with a dots task in place of their
// faint-contrast flashes (dots, as in Pescetelli & Yeung, 2021, survive any screen). Our own toy.
// The signal d is how many more dots the right box has (negative: the left one). Each person's
// glimpse gives them evidence x = d + σ·noise; their sensitivity is s = 1/σ, and their
// confidence is z = x/σ (how far the evidence is from "no idea", in their own units).
// Four ways for two people to decide together (Bahrami et al.'s four models):
//   coin flip         share only the choice; a disagreement is a coin flip
//   follow the better share the choice, and go with whoever is better at the task
//   more confident    share how sure you are: go with the larger |z|, i.e. the sign of z1 + z2
//   share everything  share the evidence and how noisy it is: weigh each x by 1/σ² (Bayes)
// Pair sensitivity: ≈ (s1+s2)/2, max(s1,s2), (s1+s2)/√2 and √(s1²+s2²) respectively.
// Confidence sharing beats the better member only if s_min/s_max > √2 − 1 ≈ 0.41.
const W = 900, H = 390, HS = 450;
const BOX = [{ x: 24, side: -1 }, { x: 476, side: 1 }], BW = 400, BH = 250, BY = 12, DOT_R = 6;
const CW = 900, CH = 310, CM = { l: 62, r: 24, t: 32, b: 50 };
const LEVELS = [2, 4, 6, 8, 12];           // how many more dots the fuller box has
const FLASH_MS = 700;
const SIG_A = 8;                           // A's noise in the What-if mode, in dots
const RATIO_BREAK = Math.SQRT2 - 1;
const WORD = ["", "guessing", "think so", "sure"];
const BLUE = "var(--series-1, #3B4BE4)", ORANGE = "var(--series-2, #e2612c)", GREEN = "var(--series-3, #12966a)";
const GREY = "var(--series-0, #7d7a85)", PURPLE = "var(--accent)";
const sideName = s => (s < 0 ? "Left" : "Right");

let S, root, timer = null;

export function mount(el) {
  root = el;
  S = { mode: "play", partner: 1, you: [], rounds: [], cur: null, phase: "idle",
        r: 1, glimpse: null, tally: null };
  el.innerHTML = `
    <header class="tab-head">
      <h1>Two heads</h1>
      <p class="question">You and a partner both glimpse the same thing, and disagree. Counting votes gives a tie. What should settle it?</p>
    </header>
    <div class="mode"></div>
    <div class="layout" style="margin-top:1rem">
      <div>
        <div class="card stage-card"><svg class="stage" viewBox="0 0 ${W} ${H}" role="img"></svg></div>
        <div class="answers" data-tour="answer"></div>
        <div class="readouts"></div>
        <p class="note why"></p>
        <div class="card chart-card">
          <h2>When are two heads better than the better one?</h2>
          <div class="chart-legend"></div>
          <svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img"></svg>
        </div>
      </div>
      <div class="card controls"></div>
    </div>`;
  el.querySelector(".mode").appendChild(seg(
    [{ label: "Play with a partner", value: "play" }, { label: "What if", value: "sim" }],
    S.mode, m => setMode(m)));
  buildControls();
  draw();
}

export function onKey(k) {
  if (k !== "r") return;
  if (S.mode === "play") { if (S.phase === "idle" || S.phase === "done") newRound(); }
  else glimpse();
}
export function unmount() { clearTimeout(timer); root = null; }

// ---------- the model ----------
// standard normal CDF (Abramowitz & Stegun 7.1.26)
function Phi(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const e = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const p = 1 - e * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 + p / 2 : 0.5 - p / 2;
}
const pick = a => a[Math.floor(Math.random() * a.length)];
const sign = v => (v < 0 ? -1 : 1);

// pair sensitivity over the better member's, for a weaker/stronger ratio x (Bahrami et al., Eqs. 1–4)
const RULES = [
  { id: "coin", name: "Coin flip", what: "share only the choice", col: GREY, dash: "2 6", gain: x => (1 + x) / 2 },
  { id: "better", name: "Follow the better", what: "go with the better one", col: "var(--ink)", dash: null, gain: () => 1 },
  { id: "conf", name: "More confident wins", what: "share how sure you are", col: PURPLE, dash: null, gain: x => (1 + x) / Math.SQRT2 },
  { id: "bayes", name: "Share everything", what: "share the evidence and how noisy it is", col: GREEN, dash: "10 6", gain: x => Math.sqrt(1 + x * x) },
];

// exact chance of being right, averaged over the mix of difficulties, for a sensitivity s
const accuracy = s => d3.mean(LEVELS, L => Phi(L * s));
function exactRules(sA, sB) {
  const a = accuracy(sA), b = accuracy(sB);
  return { a, b, coin: (a + b) / 2, better: Math.max(a, b), conf: accuracy((sA + sB) / Math.SQRT2), bayes: accuracy(Math.hypot(sA, sB)) };
}

// what each rule decides for one glimpse
function decideAll(xa, sa, xb, sb, flip = pick([-1, 1])) {
  const za = xa * sa, zb = xb * sb;
  return {
    coin: sign(xa) === sign(xb) ? sign(xa) : flip,
    better: sa >= sb ? sign(xa) : sign(xb),
    conf: sign(za + zb),
    bayes: sign(xa * sa * sa + xb * sb * sb),
  };
}

// ---------- play ----------
// your noise, estimated from your answers so far: P(right) = Φ(|d|/σ), with a gentle pull to σ ≈ 7
function sigmaYou() {
  let best = 7, bestLL = -Infinity;
  for (let s = 2; s <= 40; s += 0.25) {
    let ll = -Math.pow(Math.log(s / 7), 2) / (2 * 0.4 * 0.4);
    for (const h of S.you) { const p = Math.min(0.999, Math.max(0.501, Phi(Math.abs(h.d) / s))); ll += Math.log(h.correct ? p : 1 - p); }
    if (ll > bestLL) { bestLL = ll; best = s; }
  }
  return best;
}

// scatter n dots in a box without overlaps
function scatter(n) {
  const pts = [], m = DOT_R * 2 + 3;
  let tries = 0;
  while (pts.length < n && tries < 20000) {
    tries++;
    const x = 16 + Math.random() * (BW - 32), y = 16 + Math.random() * (BH - 32);
    if (pts.every(p => (p.x - x) ** 2 + (p.y - y) ** 2 > m * m)) pts.push({ x, y });
  }
  return pts;
}

function newRound() {
  clearTimeout(timer);
  const L = pick(LEVELS), side = pick([-1, 1]), base = 30 + Math.floor(Math.random() * 11);
  const n = side < 0 ? [base + L, base] : [base, base + L];
  S.cur = { d: side * L, n, dots: n.map(scatter) };
  S.phase = "show";
  draw();
  timer = setTimeout(() => { if (!root || S.phase !== "show") return; S.phase = "answer"; draw(); }, FLASH_MS);
}

function answer(side, level) {
  if (S.phase !== "show" && S.phase !== "answer") return;
  clearTimeout(timer);
  const c = S.cur, sp = sigmaYou() / S.partner;
  const xp = c.d + sp * normal(), z = Math.abs(xp) / sp;
  const you = { side, level, correct: side === sign(c.d) };
  const partner = { side: sign(xp), level: z < 0.6 ? 1 : z < 1.4 ? 2 : 3 };
  partner.correct = partner.side === sign(c.d);
  let pair;
  if (you.side === partner.side) pair = { side: you.side, how: "agree" };
  else if (you.level !== partner.level) pair = { side: you.level > partner.level ? you.side : partner.side, how: "sure" };
  else pair = { side: pick([-1, 1]), how: "coin" };
  pair.correct = pair.side === sign(c.d);
  const coin = you.side === partner.side ? +you.correct : 0.5;   // what a coin flip would score, on average
  Object.assign(c, { you, partner, pair, coin });
  S.rounds.push(c);
  S.you.push({ d: c.d, correct: you.correct });
  S.phase = "done";
  draw();
  over();
}

// tell anyone listening (the guided story) that the round is over; it comes from the
// Start / Next round button, so the story can point at the button while it waits
const over = () => root?.querySelector('[data-tour="next"]')?.dispatchEvent(new CustomEvent("round-over", { bubbles: true }));

function setPartner(v) {
  S.partner = v; S.rounds = []; S.cur = null; S.phase = "idle"; clearTimeout(timer);
  root.querySelectorAll('[data-tour="partner"] button').forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.value) === v)));
  draw();
}

// ---------- what if ----------
// a glimpse keeps its luck (the noise draws), so moving the slider rescales the same glimpse
function glimpse() {
  S.glimpse = { d: pick([-1, 1]) * pick(LEVELS), ea: normal(), eb: normal(), flip: pick([-1, 1]) };
  scoreGlimpse();
  draw();
}
function scoreGlimpse() {
  const g = S.glimpse, sb = S.r / SIG_A;
  g.xa = g.d + SIG_A * g.ea; g.xb = g.d + (SIG_A / S.r) * g.eb;
  g.dec = decideAll(g.xa, 1 / SIG_A, g.xb, sb, g.flip);
}

function thousand() {
  const sa = 1 / SIG_A, sb = S.r / SIG_A, t = { a: 0, b: 0, coin: 0, better: 0, conf: 0, bayes: 0 };
  for (let i = 0; i < 1000; i++) {
    const d = pick([-1, 1]) * pick(LEVELS), xa = d + SIG_A * normal(), xb = d + (SIG_A / S.r) * normal();
    const dec = decideAll(xa, sa, xb, sb), s = sign(d);
    t.a += sign(xa) === s; t.b += sign(xb) === s;
    for (const k of ["coin", "better", "conf", "bayes"]) t[k] += dec[k] === s;
  }
  S.tally = { ...t, r: S.r };
  draw();
}

function setR(v) { S.r = Math.round(v * 100) / 100; S.tally = null; root.querySelector('[data-tour="r"]')?.set(S.r); if (S.glimpse) scoreGlimpse(); draw(); }

// ---------- modes and controls ----------
function setMode(m) {
  clearTimeout(timer);
  S.mode = m;
  if (m === "play") { S.phase = S.cur && S.cur.you ? "done" : "idle"; if (S.phase === "idle") S.cur = null; }
  root.querySelectorAll(".mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === m)));
  root.querySelector("svg.stage").setAttribute("viewBox", `0 0 ${W} ${m === "play" ? H : HS}`);
  buildControls();
  draw();
}

function buildControls() {
  const c = root.querySelector(".controls");
  c.innerHTML = "";
  if (S.mode === "play") {
    c.insertAdjacentHTML("beforeend", `<h2>Your partner</h2>`);
    const p = seg([{ label: "As good as you", value: 1 }, { label: "Much worse", value: 0.25 }], S.partner, v => setPartner(v));
    p.dataset.tour = "partner";
    c.appendChild(p);
    const row = document.createElement("div"); row.className = "btn-row"; row.style.marginTop = "1rem";
    row.appendChild(button("Start over", () => setPartner(S.partner))); row.lastChild.dataset.tour = "reset";
    c.appendChild(row);
    c.insertAdjacentHTML("beforeend", `<p class="note">Two boxes of dots flash for ${(FLASH_MS / 1000).toFixed(1)} s. Say which had more, and how sure you are.
      <br><br>Your partner is a simulation. It sees its own noisy glimpse of the same boxes, tuned to be about as good as you (or a quarter as sensitive), going by your answers so far.
      <br><br>When you disagree, the pair goes with whoever is more sure. A tie in sureness is a coin flip.
      <br><br>Keyboard: R starts the next round.</p>`);
  } else {
    c.insertAdjacentHTML("beforeend", `<h2>Two observers, A and B</h2>`);
    c.appendChild(slider({ label: "B's sensitivity, as a fraction of A's", min: 0.1, max: 1, step: 0.01, value: S.r, tour: "r",
      format: v => v.toFixed(2), hint: "1: equally good. 0.25: B's glimpse is four times as noisy.", onInput: v => setR(v) }));
    const row = document.createElement("div"); row.className = "btn-row";
    row.appendChild(button("Next glimpse", glimpse, "primary")); row.lastChild.dataset.tour = "glimpse";
    row.appendChild(button("Run 1,000 glimpses", thousand)); row.lastChild.dataset.tour = "thousand";
    c.appendChild(row);
    c.insertAdjacentHTML("beforeend", `<p class="note">Each glimpse leaves a person with a belief: a bell curve centred on what they saw, as wide as their noise. Sensitivity is one over that width.
      <br><br>The four rules are Bahrami et al.'s four models. Bayes weighs each person by one over their variance; sharing confidence weighs them by one over their standard deviation.</p>`);
  }
  buildAnswers();
}

function buildAnswers() {
  const a = root.querySelector(".answers");
  a.innerHTML = "";
  a.hidden = S.mode !== "play";
  if (a.hidden) return;
  const top = document.createElement("div"); top.className = "answers-top";
  top.appendChild(button("Start", () => newRound(), "primary")); top.lastChild.dataset.tour = "next";
  top.insertAdjacentHTML("beforeend", `<p class="answers-q">Which box had more dots, and how sure are you?</p>`);
  a.appendChild(top);
  const g = document.createElement("div"); g.className = "answers-grid";
  for (const [side, level] of [[-1, 3], [-1, 2], [-1, 1], [1, 1], [1, 2], [1, 3]]) {
    const w = WORD[level][0].toUpperCase() + WORD[level].slice(1);
    const b = button(side < 0 ? `◀ ${w}` : `${w} ▶`, () => answer(side, level));
    b.setAttribute("aria-label", `${side < 0 ? "Left" : "Right"}, ${WORD[level]}`);
    b.dataset.side = side; b.dataset.level = level;
    b.style.borderColor = side < 0 ? BLUE : ORANGE;
    g.appendChild(b);
  }
  a.appendChild(g);
}

// ---------- drawing ----------
function draw() {
  if (!root) return;
  if (S.mode === "play") drawPlay(); else drawSim();
  drawReadouts();
  drawChart();
}

function drawPlay() {
  const svg = d3.select(root.querySelector("svg.stage"));
  svg.selectAll("*").remove();
  const c = S.cur, ph = S.phase, busy = ph === "show" || ph === "answer";
  root.querySelectorAll(".answers button").forEach(b => { b.disabled = !busy; });
  const nb = root.querySelector('[data-tour="next"]');
  if (nb) { nb.disabled = busy; nb.textContent = S.rounds.length || c ? "Next round" : "Start"; }
  BOX.forEach((b, i) => {
    const g = svg.append("g").attr("transform", `translate(${b.x},${BY})`);
    const more = c && ph === "done" && sign(c.d) === b.side;
    g.append("rect").attr("width", BW).attr("height", BH).attr("rx", 14).attr("fill", "var(--card)")
      .attr("stroke", more ? "var(--truth)" : "var(--ink)").attr("stroke-width", more ? 5 : 2);
    if (c && (ph === "show" || ph === "done"))
      g.selectAll("circle").data(c.dots[i]).join("circle").attr("cx", p => p.x).attr("cy", p => p.y).attr("r", DOT_R)
        .attr("fill", "var(--ink)").attr("opacity", ph === "done" ? 0.35 : 1);
    if (c && ph === "answer")
      g.append("text").attr("class", "hand").attr("x", BW / 2).attr("y", BH / 2 + 14).attr("text-anchor", "middle").attr("font-size", 52)
        .style("fill", "var(--line)").text("?");
    if (c && ph === "done") {
      g.append("text").attr("class", "hand").attr("x", BW / 2).attr("y", BH / 2 + 14).attr("text-anchor", "middle").attr("font-size", 48)
        .style("fill", more ? "var(--truth)" : "var(--ink-soft)").text(`${c.n[i]} dots`);
      if (more) g.append("text").attr("class", "hand").attr("x", BW / 2).attr("y", BH - 16).attr("text-anchor", "middle").attr("font-size", 22)
        .style("fill", "var(--truth)").text("★ more dots");
    }
    svg.append("text").attr("class", "hand").attr("x", b.x + BW / 2).attr("y", BY + BH + 26).attr("text-anchor", "middle").attr("font-size", 22)
      .style("fill", b.side < 0 ? BLUE : ORANGE).text(b.side < 0 ? "Left" : "Right");
  });
  svg.append("text").attr("x", W / 2).attr("y", BY + BH / 2 + 8).attr("text-anchor", "middle").attr("font-size", 26).style("fill", "var(--ink-soft)").text("+");

  // who said what
  const y0 = BY + BH + 56;
  if (!c) {
    svg.append("text").attr("class", "hand").attr("x", W / 2).attr("y", y0 + 34).attr("text-anchor", "middle").attr("font-size", 26)
      .style("fill", "var(--ink-soft)").text("Press Start, and watch both boxes.");
    return;
  }
  if (ph !== "done") {
    svg.append("text").attr("class", "hand").attr("x", W / 2).attr("y", y0 + 34).attr("text-anchor", "middle").attr("font-size", 26)
      .style("fill", "var(--ink-soft)").text(ph === "show" ? "Look…" : "Which box had more? Answer below.");
    return;
  }
  const cols = [
    { x: 160, who: "You", a: c.you, sub: WORD[c.you.level] },
    { x: W / 2, who: "The pair", a: c.pair, sub: { agree: "you agreed", sure: "the surer one", coin: "a coin flip" }[c.pair.how] },
    { x: W - 160, who: "Your partner", a: c.partner, sub: WORD[c.partner.level] },
  ];
  for (const k of cols) {
    svg.append("text").attr("x", k.x).attr("y", y0).attr("text-anchor", "middle").attr("font-size", 15).attr("font-weight", 800)
      .style("fill", "var(--ink-soft)").text(k.who);
    svg.append("text").attr("class", "hand").attr("x", k.x).attr("y", y0 + 34).attr("text-anchor", "middle").attr("font-size", k.who === "The pair" ? 34 : 28)
      .style("fill", k.a.correct ? "var(--truth)" : "var(--wrong)").text(`${sideName(k.a.side)} ${k.a.correct ? "✓" : "✗"}`);
    svg.append("text").attr("x", k.x).attr("y", y0 + 56).attr("text-anchor", "middle").attr("font-size", 15).style("fill", "var(--ink-soft)").text(k.sub);
  }
}

function drawSim() {
  const svg = d3.select(root.querySelector("svg.stage"));
  svg.selectAll("*").remove();
  const x = d3.scaleLinear([-40, 40], [40, W - 40]);
  const UP = 196, LO = 352, K = 2000;   // baselines; K sets the curves' area
  const sa = SIG_A, sb = SIG_A / S.r, sc = 1 / Math.sqrt(1 / (sa * sa) + 1 / (sb * sb));
  const g = S.glimpse;
  const pdf = (v, m, s) => (K / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-((v - m) ** 2) / (2 * s * s));
  const xs = d3.range(-40, 40.01, 0.25);
  const curve = (m, s, base, col, label, labelDy = 0) => {
    const area = d3.area(v => x(v), () => base, v => base - pdf(v, m, s));
    svg.append("path").datum(xs).attr("d", area).attr("fill", col).attr("opacity", 0.16);
    svg.append("path").datum(xs).attr("d", area.lineY1()).attr("fill", "none").attr("stroke", col).attr("stroke-width", 3.5);
    const top = base - pdf(m, m, s);
    svg.append("line").attr("x1", x(m)).attr("x2", x(m)).attr("y1", base).attr("y2", top).attr("stroke", col).attr("stroke-width", 2).attr("stroke-dasharray", "3 3");
    const lx = Math.max(150, Math.min(W - 150, x(m)));
    svg.append("text").attr("class", "hand").attr("x", lx).attr("y", Math.max(48, top - 8) + labelDy).attr("text-anchor", "middle").attr("font-size", 21)
      .style("fill", col).text(label);
  };
  for (const [base, title] of [[UP, "What each of them believes after one glimpse"], [LO, "Sharing everything: one belief for the pair"]]) {
    svg.append("line").attr("x1", x(-40)).attr("x2", x(40)).attr("y1", base).attr("y2", base).attr("stroke", "var(--ink-soft)").attr("stroke-width", 1.5);
    svg.append("text").attr("x", x(-40)).attr("y", base + 18).attr("font-size", 13).style("fill", "var(--ink-soft)").text("◀ more on the left");
    svg.append("text").attr("x", x(40)).attr("y", base + 18).attr("text-anchor", "end").attr("font-size", 13).style("fill", "var(--ink-soft)").text("more on the right ▶");
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", base - 150).attr("y2", base + 4).attr("stroke", "var(--line)").attr("stroke-width", 2).attr("stroke-dasharray", "4 4");
    svg.append("text").attr("x", x(0)).attr("y", base + 18).attr("text-anchor", "middle").attr("font-size", 13).style("fill", "var(--ink-soft)").text(title);
  }
  if (!g) {
    svg.append("text").attr("class", "hand").attr("x", W / 2).attr("y", 110).attr("text-anchor", "middle").attr("font-size", 26)
      .style("fill", "var(--ink-soft)").text("Press Next glimpse.");
    return;
  }
  // the truth
  for (const base of [UP, LO]) {
    svg.append("line").attr("x1", x(g.d)).attr("x2", x(g.d)).attr("y1", base === UP ? 30 : base - 160).attr("y2", base).attr("stroke", "var(--truth)").attr("stroke-width", 3);
  }
  svg.append("text").attr("x", x(g.d) + (g.d > 0 ? 6 : -6)).attr("y", 22).attr("text-anchor", g.d > 0 ? "start" : "end").attr("font-size", 14).attr("font-weight", 800)
    .style("fill", "var(--truth)").text(`truth: ${Math.abs(g.d)} more on the ${g.d > 0 ? "right" : "left"}`);
  const conf = (xv, s) => `${Math.round(Phi(Math.abs(xv) / s) * 100)}% sure`;
  const closeLabels = Math.abs(x(g.xa) - x(g.xb)) < 230;
  curve(g.xa, sa, UP, BLUE, `A: ${sideName(g.xa)}, ${conf(g.xa, sa)}`);
  curve(g.xb, sb, UP, ORANGE, `B: ${sideName(g.xb)}, ${conf(g.xb, sb)}`, closeLabels ? -24 : 0);
  const mc = (g.xa / (sa * sa) + g.xb / (sb * sb)) * sc * sc;
  curve(mc, sc, LO, GREEN, `the pair: ${sideName(mc)}, ${conf(mc, sc)}`);

  // the four rules' verdicts
  const s = sign(g.d);
  RULES.forEach((r, i) => {
    const cx = 112 + i * 225, v = g.dec[r.id];
    svg.append("text").attr("x", cx).attr("y", HS - 34).attr("text-anchor", "middle").attr("font-size", 14).attr("font-weight", 800)
      .style("fill", r.col).text(r.name);
    svg.append("text").attr("class", "hand").attr("x", cx).attr("y", HS - 8).attr("text-anchor", "middle").attr("font-size", 24)
      .style("fill", v === s ? "var(--truth)" : "var(--wrong)").text(`${sideName(v)} ${v === s ? "✓" : "✗"}`);
  });
}

const pct = v => `${Math.round(v * 100)}%`;

function drawReadouts() {
  const el = root.querySelector(".readouts"), w = root.querySelector(".why");
  let rows = [], note = "";
  if (S.mode === "play") {
    const R = S.rounds, n = R.length;
    if (n) {
      const you = d3.mean(R, q => +q.you.correct), par = d3.mean(R, q => +q.partner.correct);
      const pair = d3.mean(R, q => +q.pair.correct), coin = d3.mean(R, q => q.coin), best = Math.max(you, par);
      rows = [
        ["", "Rounds with this partner", fmt(n)],
        ["", "You were right", pct(you)],
        ["", "Your partner was right", pct(par)],
        [pair > best ? "truth" : pair < best ? "wrong" : "", "The pair, going with the surer one", pct(pair)],
        ["crowd", "The pair, if disagreements were a coin flip", pct(coin)],
      ];
    }
    const c = S.cur;
    if (c && S.phase === "done") {
      const y = `you said ${sideName(c.you.side)}, ${WORD[c.you.level]}`, p = `your partner said ${sideName(c.partner.side)}, ${WORD[c.partner.level]}`;
      note = c.pair.how === "agree" ? `You agreed (${y}; ${p}), so that's the pair's answer.`
        : c.pair.how === "sure" ? `You disagreed: ${y}; ${p}. One vote each is a tie, so the pair went with the surer one: <b>${sideName(c.pair.side)}</b>.`
        : `You disagreed, and were equally sure: ${y}; ${p}. A coin flip picked <b>${sideName(c.pair.side)}</b>.`;
    }
  } else {
    const ex = exactRules(1 / SIG_A, S.r / SIG_A), t = S.tally && S.tally.r === S.r ? S.tally : null;
    const v = k => (t ? pct(t[k] / 1000) : pct(ex[k]));
    const tag = t ? "in 1,000 glimpses" : "right";
    const best = t ? Math.max(t.a, t.b) / 1000 : ex.better, val = k => (t ? t[k] / 1000 : ex[k]);
    const cls = k => (val(k) > best + 0.005 ? "truth" : val(k) < best - 0.005 ? "wrong" : "");
    rows = [
      ["", `A alone, ${tag}`, v("a")],
      ["", `B alone, ${tag}`, v("b")],
      [cls("coin"), `Coin flip, ${tag}`, v("coin")],
      [cls("better"), `Follow the better, ${tag}`, v("better")],
      [cls("conf"), `More confident wins, ${tag}`, v("conf")],
      [cls("bayes"), `Share everything, ${tag}`, v("bayes")],
    ];
    if (S.glimpse) note = `A's belief is ${S.r < 1 ? "the narrower" : "as wide as B's"} curve${S.r < 1 ? `: B's glimpse is ${fmt(1 / S.r, 1)} times as noisy` : ""}. Sharing everything multiplies the two beliefs together, so the narrower one pulls harder: each is weighted by one over its variance.`;
  }
  el.innerHTML = rows.map(([c, k, v]) => `<div class="readout ${c}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
  w.innerHTML = note; w.hidden = !note;
}

function drawChart() {
  root.querySelector(".chart-legend").innerHTML = RULES.map(r =>
    `<span class="key"><span class="swatch" style="background:${r.col}${r.dash ? ";opacity:.75" : ""}"></span>${r.name}</span>`).join("") +
    `<span class="key"><span class="swatch" style="background:var(--crowd)"></span>real pairs (Bahrami et al., fitted line)</span>`;
  const svg = d3.select(root.querySelector("svg.chart"));
  svg.selectAll("*").remove();
  const x = d3.scaleLinear([0, 1], [CM.l, CW - CM.r]), y = d3.scaleLinear([0.4, 1.5], [CH - CM.b, CM.t]);
  svg.append("g").attr("class", "grid").attr("transform", `translate(${CM.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(CW - CM.l - CM.r)).tickFormat("")).select(".domain").remove();
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${CH - CM.b})`).call(d3.axisBottom(x).ticks(10).tickFormat(d3.format(".1f")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${CM.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d3.format(".1f")(d)}×`));
  svg.append("text").attr("x", CW - CM.r).attr("y", CH - 6).attr("text-anchor", "end").attr("font-size", 14).style("fill", "var(--ink-soft)")
    .text("the weaker one's sensitivity, as a fraction of the stronger one's");
  svg.append("text").attr("x", CM.l - 50).attr("y", 16).attr("font-size", 14).style("fill", "var(--ink-soft)")
    .text("the pair's sensitivity, against the better one alone");

  const xs = d3.range(0.02, 1.0001, 0.01);
  // real pairs: Bahrami et al.'s fit to experiment 2, gain = 0.74 + 0.6 × ratio
  svg.append("path").datum(d3.range(0.1, 1.0001, 0.01)).attr("fill", "none").attr("stroke", "var(--crowd)").attr("stroke-width", 5)
    .attr("stroke-linecap", "round").attr("opacity", 0.85).attr("d", d3.line(v => x(v), v => y(0.74 + 0.6 * v)));
  for (const r of RULES)
    svg.append("path").datum(xs).attr("fill", "none").attr("stroke", r.col).attr("stroke-width", r.id === "conf" ? 5 : 3)
      .attr("stroke-dasharray", r.dash).attr("stroke-linecap", "round").attr("d", d3.line(v => x(v), v => y(r.gain(v))));
  // where sharing confidence stops helping
  svg.append("circle").attr("cx", x(RATIO_BREAK)).attr("cy", y(1)).attr("r", 5).attr("fill", PURPLE);
  svg.append("text").attr("x", x(RATIO_BREAK)).attr("y", y(1) + 24).attr("text-anchor", "middle").attr("font-size", 14).attr("font-weight", 800)
    .style("fill", PURPLE).text("0.41");
  svg.append("text").attr("x", x(0.52)).attr("y", y(1) + 18).attr("font-size", 13).style("fill", "var(--ink-soft)").text("below 1×: worse than the better one alone");

  // this pair
  const r = S.mode === "play" ? S.partner : S.r;
  svg.append("line").attr("x1", x(r)).attr("x2", x(r)).attr("y1", y(0.4)).attr("y2", y(1.5)).attr("stroke", "var(--ink-soft)").attr("stroke-width", 1.5).attr("stroke-dasharray", "2 5");
  const vc = RULES[2].gain(r);
  svg.append("circle").attr("cx", x(r)).attr("cy", y(vc)).attr("r", 9).attr("fill", "var(--card)").attr("stroke", "var(--ink)").attr("stroke-width", 3);
  root.querySelector(".chart-legend").insertAdjacentHTML("beforeend",
    `<span class="key lead">○ ${S.mode === "play" ? "you and your partner" : "A and B"}, going with the surer one: ${vc.toFixed(2)}×</span>`);
}

// ---------- guided story ----------
let played = 0;
// while playing, light up the boxes and the answer buttons, not just the Start button
const PLAYING = [".stage-card", ".answers"];
// and bring them into view: on a phone, boxes at the top so the story sheet sits below the buttons
const toBoxes = () => {
  if (innerWidth < 760) root?.querySelector(".stage-card")?.scrollIntoView({ block: "start" });
  else scrollTo(0, 0);
};
const storyPlay = (partner = 1) => {
  if (S.mode !== "play") setMode("play");
  setPartner(partner);
};
const nRounds = () => S.rounds.length;
const playStats = () => {
  const R = S.rounds;
  if (!R.length) return null;
  const m = f => d3.mean(R, f);
  return { n: R.length, you: m(q => +q.you.correct), par: m(q => +q.partner.correct), pair: m(q => +q.pair.correct), coin: m(q => q.coin),
           dis: R.filter(q => q.you.side !== q.partner.side).length };
};

export const story = [
  { setup: () => storyPlay(1),
    text: `<p><b>2010.</b> Bahador Bahrami and colleagues sat pairs of people in front of the same screen. A faint patch flashed, too briefly to be sure where. Each person chose on their own; if they disagreed, they talked until they agreed.</p>
           <p>Are two heads better than one? Yes, they found, but only sometimes. And the reason is <i>how sure</i> each of them was.</p>` },
  { target: ".stage-card", reveal: [".stage-card"],
    text: `<p>Here is a version you can play, with dots instead of faint patches. Two boxes flash for a moment. Which had more dots?</p>
           <p>You won't be sure, and that's the point. You'll say how sure you are, too.</p>` },
  { target: PLAYING, reveal: [".controls", '[data-tour="next"]', '[data-tour="answer"]'], place: "top-right", setup: toBoxes,
    text: `<p>Press <b>Start</b>, watch both boxes, then answer: left or right, and whether you are sure, think so, or are guessing.</p>
           <p>A partner sees the same boxes and answers too.</p>`,
    waitFor: { event: "round-over", target: '[data-tour="next"]', prompt: "Play one round." } },
  { target: ".stage-card",
    text: () => { const c = S.cur;
      const what = !c?.you ? "" : c.pair.how === "agree" ? `<p>This time you agreed, so that was easy.</p>`
        : `<p>This time you disagreed: one vote each.</p>`;
      return `${what}<p>When two people disagree, counting votes gives a tie, and a tie is a coin flip. Bahrami's pairs did something better: they said how sure they were. Here, the pair goes with the surer one.</p>`; } },
  { target: PLAYING, reveal: [".readouts"], place: "top-right", setup: () => { played = 0; toBoxes(); },
    text: `<p>Play some more, and watch the scores add up below.</p>`,
    waitFor: { event: "round-over", target: '[data-tour="next"]', until: () => ++played >= 12, prompt: () => `Play 12 more rounds (${Math.min(played, 12)} so far).` } },
  { target: ".readouts",
    text: () => { const t = playStats(); if (!t) return "";
      return `<p>So far: you ${pct(t.you)}, your partner ${pct(t.par)}, the pair ${pct(t.pair)}. With a coin flip on the ${t.dis} disagreements, the pair would have scored about ${pct(t.coin)}.</p>
              <p>A coin flip can never beat the better of you; on average it lands halfway between you. Going with the surer one can, because on each round the surer one is more often right. A few rounds are noisy; the chart below has the exact answer.</p>`; } },
  { target: ".chart-card", reveal: [".chart-card"],
    text: `<p>Bahrami's chart. Along the bottom: how good the weaker partner is, as a fraction of the stronger. Up the side: how good the pair is, against the better partner alone.</p>
           <p>Two equally good people going with the surer one (purple) are about <b>1.41 times</b> as sensitive as either alone. A coin flip (grey) never gets above 1.</p>` },
  { target: '[data-tour="partner"]', reveal: ['[data-tour="partner"]'], place: "below",
    text: `<p>Now change partners: one whose glimpse is four times as noisy as yours.</p>`,
    waitFor: { event: "click", target: '[data-tour="partner"] button[data-value="0.25"]', prompt: "Click “Much worse”." } },
  { target: PLAYING, place: "top-right", setup: () => { played = 0; toBoxes(); },
    text: `<p>Play a dozen rounds with your new partner.</p>`,
    waitFor: { event: "round-over", target: '[data-tour="next"]', until: () => ++played >= 12, prompt: () => `Play 12 rounds (${Math.min(played, 12)} so far).` } },
  { target: [".readouts", ".chart-card"],
    text: () => { const t = playStats();
      return `<p>${t ? `This time: you ${pct(t.you)}, your partner ${pct(t.par)}, the pair ${pct(t.pair)}.` : ""} On the chart you are now at 0.25, below the line: over many rounds, the pair does worse than you alone, even going with the surer one.</p>
              <p>Your partner isn't lying about how sure they feel. But a noisy glimpse sometimes lands far from the middle by luck, and feels sure. Sureness says how clear the glimpse <i>seemed</i>, not how good the person is at seeing.</p>`; } },
  { target: ".mode", reveal: [".mode"], place: "below",
    text: `<p>Why exactly 0.41? Look inside two heads.</p>`,
    waitFor: { event: "click", target: '.mode button[data-value="sim"]', prompt: "Click “What if”." } },
  { target: '[data-tour="glimpse"]', reveal: ['[data-tour="glimpse"]'], place: "top-right", setup: () => setR(0.25),
    text: `<p>Two observers, A and B; B is four times as noisy, like your second partner. Take a glimpse.</p>`,
    waitFor: { event: "click", target: '[data-tour="glimpse"]', prompt: "Click Next glimpse." } },
  { target: ".stage-card",
    text: `<p>After a glimpse, each of them holds a belief: a bell curve centred on what they saw. A's is narrow; B's is wide, because B's glimpse is noisy.</p>
           <p>The pair's best belief (green, below) multiplies the two together. That is <b>Bayes' rule</b>: each belief counts in proportion to one over its variance, so the narrow one pulls much harder. Your brain does this with your own senses, combining sight and touch (Ernst &amp; Banks, 2002).</p>` },
  { target: ".stage-card",
    text: `<p>Saying "I'm sure" shares where your belief sits relative to its own width. It does not share the width. So the pair can only weigh each person by one over their <i>spread</i>, not one over their spread squared.</p>
           <p>For equals, that makes no difference. For a noisy partner, it gives them too much say. Click a few more glimpses and watch the four rules along the bottom.</p>` },
  { target: '[data-tour="r"]', reveal: ['[data-tour="r"]'], place: "below",
    text: `<p>Make B as good as A.</p>`,
    waitFor: { event: "input", target: '[data-tour="r"] input', until: () => S.r >= 0.95, prompt: "Drag B's sensitivity to 1." } },
  { target: '[data-tour="thousand"]', reveal: ['[data-tour="thousand"]'], place: "below",
    text: `<p>Count it: <b>Run 1,000 glimpses</b>.</p>`,
    waitFor: { event: "click", target: '[data-tour="thousand"]', prompt: "Click Run 1,000 glimpses." } },
  { target: ".readouts",
    text: () => { const t = S.tally; if (!t) return "";
      return `<p>A alone: ${pct(t.a / 1000)}. Going with the more confident: ${pct(t.conf / 1000)}. Sharing everything: ${pct(t.bayes / 1000)}. For equals, sharing confidence is as good as sharing everything.</p>
              <p>Now drag B back down, below 0.41, and run 1,000 again. Sharing everything stays at least as good as A; sharing confidence falls below.</p>`; } },
  { target: ".chart-card",
    text: `<p>Is that what people did? The yellow line is Bahrami's fit to real pairs, some secretly given a noisier screen. It sits close to purple: people shared their confidence about as well as the model allows, and unequal pairs lost.</p>
           <p>Strangest of all, in their fourth experiment pairs never learned who had been right, and still gained. Talking about confidence was enough.</p>` },
  { reveal: ['[data-tour="reset"]'],
    text: `<p>That's two heads. Counting choices (<a href="#/condorcet">Condorcet's jury</a>) ignores how sure each person is. Sharing confidence does better, as long as the two are similarly good. Only knowing how reliable each of you is does better still.</p>
           <p>People tend to treat each other as equally good even when they are not (Mahmoodi et al., 2015). How could you learn who to trust, with no one telling you who was right? Pescetelli &amp; Yeung (2021) suggest: by how often they agree with you when you are sure.</p>` },
];
