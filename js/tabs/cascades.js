import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { slider, button, seg, drawPerson, fmt } from "../lib/util.js";

// After Bikhchandani, Hirshleifer & Welch (1992), told with Banerjee's (1992) two restaurants.
// One of two restaurants is better. Diners arrive one by one; each has a friend's tip that
// names the better one with probability p, and sees how many diners sit in each room (not
// their tips). A sensible diner counts what the rooms reveal (+1 per tip for Blue Door,
// −1 per tip for Orange Tree), adds their own tip, and follows the sign; on a tie, their tip.
// While neither room leads by two, every diner follows their tip, so the rooms reveal the
// tips exactly. Once one leads by two, no single tip can outweigh it: from then on everyone
// joins the busier room, and new diners reveal nothing. That is an information cascade.
const W = 900, H = 404;
const ROOM = [{ x: 30, c: 1 }, { x: 480, c: -1 }], RW = 390, TOP = 46, AWN = 40, COLS = 10, CELL = 36, RH = 40;
const CW = 900, CH = 250, CM = { l: 56, r: 24, t: 24, b: 44 };
const N_MAX = 30, STEP_MS = 260, KERB_X = 300, KERB_Y = 374;
const BLUE = "var(--series-1, #3B4BE4)", ORANGE = "var(--series-2, #e2612c)";
const colour = c => (c > 0 ? BLUE : ORANGE);
const place = c => (c > 0 ? "Blue Door" : "Orange Tree");

let S, root, timer = null;

export function mount(el) {
  root = el;
  S = { mode: "watch", n: 20, p: 2 / 3, ev: null, shown: 0, tally: null,
        turn: null, score: { played: 0, better: 0, sensible: 0 } };
  el.innerHTML = `
    <header class="tab-head">
      <h1>Information cascades</h1>
      <p class="question">Two restaurants, side by side, and one is better. Your friend says try the empty one; the other is full. Do you trust your friend, or the crowd?</p>
    </header>
    <div class="mode"></div>
    <div class="layout" style="margin-top:1rem">
      <div>
        <div class="card stage-card"><svg class="street" viewBox="0 0 ${W} ${H}" role="img"></svg></div>
        <div class="readouts"></div>
        <p class="note why"></p>
        <div class="card chart-card">
          <h2>How often does the evening end in the worse restaurant?</h2>
          <div class="chart-legend"></div>
          <svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img"></svg>
        </div>
      </div>
      <div class="card controls"></div>
    </div>`;
  el.querySelector(".mode").appendChild(seg(
    [{ label: "Watch the street", value: "watch" }, { label: "Take your turn", value: "turn" }],
    S.mode, m => setMode(m)));
  buildControls();
  newEvening(false);
}

export function onKey(k) { if (k === "r") (S.mode === "watch" ? newEvening(true) : newTurn()); }
export function unmount() { clearTimeout(timer); root = null; }

// ---------- the model ----------
// what the rooms reveal, from the head count: exact while neither leads by two, then stuck at ±2
const reveal = (blue, orange) => Math.max(-2, Math.min(2, blue - orange));
// a sensible diner's choice, given what the rooms reveal and their own tip (+1 / −1)
const decide = (d, tip) => { const s = d + tip; return s > 0 ? 1 : s < 0 ? -1 : tip; };

// seat diners from index `from` on, each choosing sensibly from the head count they see
function seat(ev, from) {
  let blue = 0, orange = 0;
  ev.diners.forEach((q, i) => {
    if (i >= from) {
      q.d = reveal(blue, orange); q.counts = [blue, orange];
      if (!q.you) q.choice = decide(q.d, q.tip);
    }
    q.chose = q.you ? q.choice === q.tip : Math.abs(q.d) < 2;   // solid: came on their own tip
    if (q.choice > 0) blue++; else orange++;
  });
  const c = ev.diners.findIndex(q => Math.abs(q.d) >= 2);
  ev.cascadeAt = c < 0 ? null : c;
}

function evening(n, p) {
  const better = Math.random() < 0.5 ? 1 : -1;
  const ev = { better, diners: d3.range(n).map(() => ({ tip: Math.random() < p ? better : -better })) };
  seat(ev, 0);
  return ev;
}

// exact chance that the last of n diners picks the worse restaurant
// (what the rooms reveal is a walk that stops at ±2)
function lineWrong(n, p) {
  let P = new Map([[-2, 0], [-1, 0], [0, 1], [1, 0], [2, 0]]), last = 0;
  const wrong = d => (d >= 2 ? 0 : d <= -2 ? 1 : 1 - p);
  for (let k = 0; k < n; k++) {
    last = d3.sum([...P], ([d, w]) => w * wrong(d));
    const Q = new Map([[-2, P.get(-2)], [-1, 0], [0, 0], [1, 0], [2, P.get(2)]]);
    for (const d of [-1, 0, 1]) { Q.set(d + 1, Q.get(d + 1) + P.get(d) * p); Q.set(d - 1, Q.get(d - 1) + P.get(d) * (1 - p)); }
    P = Q;
  }
  return last;
}
// exact chance that a majority of the same n tips names the worse one (a tie counts half)
function pooledWrong(n, p) {
  let pm = Math.pow(p, n), s = 0;
  for (let k = n; k >= 0; k--) {
    if (k < n / 2) s += pm; else if (k === n / 2) s += pm / 2;
    pm *= (k / (n - k + 1)) * ((1 - p) / p);
  }
  return s;
}

// ---------- watching the street ----------
// tell anyone listening (the guided story) that the evening is over; it comes from the
// Next evening button, so the story can point at the button while it waits
const over = () => root?.querySelector('[data-tour="next"]')?.dispatchEvent(new CustomEvent("evening-over", { bubbles: true }));

function play(isDone, tick) {
  const step = () => {
    if (!root) return;
    tick();
    draw();
    if (isDone()) over(); else timer = setTimeout(step, STEP_MS);
  };
  timer = setTimeout(step, STEP_MS);
}

function newEvening(animate) {
  clearTimeout(timer);
  S.ev = evening(S.n, S.p);
  S.shown = animate ? 0 : S.n;
  draw();
  if (animate) play(() => S.shown >= S.n, () => S.shown++);
}

function thousand() {
  let line = 0, pooled = 0;
  for (let r = 0; r < 1000; r++) {
    const ev = evening(S.n, S.p);
    if (ev.diners[S.n - 1].choice !== ev.better) line++;
    const right = ev.diners.filter(q => q.tip === ev.better).length;
    if (right < S.n / 2 || (right === S.n / 2 && Math.random() < 0.5)) pooled++;
  }
  S.tally = { line, pooled };
  newEvening(false);
}

// ---------- taking your turn ----------
function newTurn() {
  clearTimeout(timer);
  const pos = 2 + Math.floor(Math.random() * Math.min(7, S.n - 2));   // you are diner 3 to 9
  const ev = evening(S.n, S.p);
  ev.diners[pos].you = true;
  S.turn = { ev, pos, mine: null, shown: pos };
  draw();
}

function pick(c) {
  const t = S.turn;
  if (!t || t.mine != null) return;
  clearTimeout(timer);
  const me = t.ev.diners[t.pos];
  t.mine = me.choice = c;
  t.sensible = decide(me.d, me.tip);
  seat(t.ev, t.pos + 1);   // everyone after you sees the rooms with you in them
  t.shown = t.pos + 1;
  S.score.played++;
  if (c === t.ev.better) S.score.better++;
  if (c === t.sensible) S.score.sensible++;
  draw();
  play(() => t.shown >= S.n, () => { if (S.turn === t) t.shown++; });
}

// why a sensible diner would pick what they pick
function why(d, tip) {
  const lead = d > 0 ? "Blue Door" : "Orange Tree", friend = place(tip);
  if (d === 0) return `The rooms are level, so the crowd tells you nothing: go where your friend says, <b>${friend}</b>.`;
  if (Math.sign(d) === tip) return `The rooms lean to ${lead}, and your friend agrees: <b>${friend}</b>.`;
  if (Math.abs(d) === 1) return `The diners so far reveal one tip for ${lead}; your friend's tip cancels it out. A tie, so follow your friend: <b>${friend}</b>.`;
  return `${lead} leads by at least two, which means at least two tips more for it than against. Your friend's one tip can't outweigh that: <b>${lead}</b>.`;
}

// ---------- controls ----------
function setMode(m) {
  clearTimeout(timer);
  S.mode = m;
  root.querySelectorAll(".mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === m)));
  buildControls();
  if (m === "turn") newTurn(); else newEvening(false);
}

function buildControls() {
  const c = root.querySelector(".controls");
  c.innerHTML = `<h2>${S.mode === "watch" ? "The street" : "Your turn"}</h2>`;
  const again = () => { S.tally = null; S.mode === "watch" ? newEvening(false) : newTurn(); };
  c.appendChild(slider({ label: "Diners tonight", min: 4, max: N_MAX, value: S.n, tour: "n",
    onInput: v => { S.n = v; again(); } }));
  c.appendChild(slider({ label: "A friend's tip is right", min: 0.55, max: 0.95, step: 0.01, value: S.p, tour: "p",
    format: v => `${Math.round(v * 100)}% of the time`, hint: "How good each diner's private information is.",
    onInput: v => { S.p = v; again(); } }));
  const row = document.createElement("div"); row.className = "btn-row";
  const add = (label, fn, tour, cls = "") => { row.appendChild(button(label, fn, cls)); row.lastChild.dataset.tour = tour; };
  if (S.mode === "watch") {
    add("Next evening", () => newEvening(true), "next", "primary");
    add("Run 1,000 evenings", thousand, "thousand");
  } else {
    add("Go to Blue Door", () => pick(1), "pick-blue", "primary");
    add("Go to Orange Tree", () => pick(-1), "pick-orange", "primary");
    add("Next evening", newTurn, "next");
  }
  c.appendChild(row);
  const note = document.createElement("p"); note.className = "note";
  note.innerHTML = S.mode === "watch"
    ? `Every diner is sensible: work out what the rooms reveal, add your friend's tip, go with the larger side (your friend's, on a tie). You see everyone's tip; the diners see only who is sitting where.`
    : `You see who is sitting where and your own friend's tip, nobody else's, just like the other diners. Once you choose, the rest of the evening plays out.`;
  c.appendChild(note);
}

// ---------- drawing ----------
function draw() {
  if (!root) return;
  drawStreet();
  drawReadouts();
  drawChart();
}

function person(svg, x, y, s, q, { solid, hidden, showTip }) {
  const g = svg.append("g").attr("transform", `translate(${x},${y})`);
  drawPerson(g, s);
  const col = colour(q.choice ?? q.tip);
  if (hidden) g.selectAll("path, circle").style("fill", "var(--line)");
  else if (solid) g.selectAll("path, circle").style("fill", col);
  else g.selectAll("path, circle").style("fill", "var(--card)").style("stroke", col).style("stroke-width", 2);
  if (showTip) g.append("circle").attr("cx", s * 0.34).attr("cy", -s * 0.86).attr("r", Math.max(3.5, s * 0.12))
    .attr("fill", colour(q.tip)).attr("stroke", "var(--ink)").attr("stroke-width", 1);
  return g;
}

function drawStreet() {
  const svg = d3.select(root.querySelector("svg.street"));
  svg.selectAll("*").remove();
  const turn = S.mode === "turn" ? S.turn : null;
  const ev = turn ? turn.ev : S.ev, n = ev.diners.length;
  const seated = turn ? (turn.mine == null ? turn.pos : turn.shown) : S.shown;
  const done = seated >= n;
  // in "take your turn" nobody else's tip shows until the evening is over
  const tipsShown = !turn || done;

  for (const r of ROOM) {
    const g = svg.append("g");
    g.append("rect").attr("x", r.x).attr("y", TOP).attr("width", RW).attr("height", AWN + 3 * RH + 34).attr("rx", 10)
      .attr("fill", "var(--card)").attr("stroke", "var(--ink)").attr("stroke-width", 2);
    g.append("rect").attr("x", r.x).attr("y", TOP).attr("width", RW).attr("height", AWN).attr("rx", 10).attr("fill", colour(r.c));
    g.selectAll(null).data(d3.range(13)).join("circle").attr("cx", i => r.x + 15 + i * 30).attr("cy", TOP + AWN).attr("r", 15).attr("fill", colour(r.c));
    g.append("text").attr("class", "hand").attr("x", r.x + RW / 2).attr("y", TOP + 29).attr("text-anchor", "middle").attr("font-size", 26)
      .style("fill", "#fff").text(place(r.c));
    if (done) svg.append("text").attr("class", "hand").attr("x", r.x + RW / 2).attr("y", TOP - 12).attr("text-anchor", "middle").attr("font-size", 21)
      .style("fill", r.c === ev.better ? "var(--ink)" : "var(--ink-soft)")
      .text(r.c === ev.better ? "★ the better restaurant" : "the worse one");
    // seat this room's diners in the order they came in
    ev.diners.slice(0, seated).filter(q => q.choice === r.c).forEach((q, k) => {
      const x = r.x + 15 + (k % COLS + 0.5) * CELL, y = TOP + AWN + 18 + (Math.floor(k / COLS) + 1) * RH;
      if (q.you) svg.append("rect").attr("x", x - 17).attr("y", y - 37).attr("width", 34).attr("height", 40).attr("rx", 8)
        .attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 3);
      person(svg, x, y, 32, q, { solid: !tipsShown || q.chose, showTip: tipsShown });
    });
  }

  svg.append("line").attr("x1", 10).attr("x2", W - 10).attr("y1", 258).attr("y2", 258)
    .attr("stroke", "var(--ink-soft)").attr("stroke-width", 2).attr("stroke-dasharray", "10 8");
  if (tipsShown && ev.cascadeAt != null && ev.cascadeAt < seated) svg.append("text").attr("class", "hand").attr("x", W / 2).attr("y", 286)
    .attr("text-anchor", "middle").attr("font-size", 20).style("fill", "var(--ink)")
    .text(`From diner ${ev.cascadeAt + 1} on, everyone follows the crowd`);

  // who is at the kerb: the next diner, or you
  const next = turn && turn.mine == null ? turn.pos : seated;
  if (next < n) {
    const q = ev.diners[next], isYou = turn && next === turn.pos;
    svg.append("text").attr("class", "hand").attr("x", KERB_X - 44).attr("y", KERB_Y - 10).attr("text-anchor", "end").attr("font-size", 22)
      .style("fill", isYou ? "var(--accent)" : "var(--ink-soft)").text(isYou ? "You" : `Diner ${next + 1}`);
    if (!isYou) svg.append("text").attr("x", KERB_X - 44).attr("y", KERB_Y + 8).attr("text-anchor", "end").attr("font-size", 13)
      .style("fill", "var(--ink-soft)").text(`of ${n}`);
    else svg.append("text").attr("x", KERB_X - 44).attr("y", KERB_Y + 8).attr("text-anchor", "end").attr("font-size", 13)
      .style("fill", "var(--ink-soft)").text(`diner ${next + 1}`);
    const g = svg.append("g").attr("transform", `translate(${KERB_X},${KERB_Y})`);
    drawPerson(g, 50);
    g.selectAll("path, circle").style("fill", isYou ? "var(--accent)" : "var(--series-0, #7d7a85)");
    // the friend's text
    const known = isYou || !turn, msg = known ? `“Try ${place(q.tip)}!”` : "“…”";
    // a speech bubble beside the head, its tail pointing at it
    const bx = KERB_X + 30, by = KERB_Y - 58, bw = known ? 220 : 60, line = known ? colour(q.tip) : "var(--line)";
    svg.append("path").attr("d", `M${bx + 2},${by + 12} L${KERB_X + 16},${KERB_Y - 36} L${bx + 2},${by + 28} Z`).attr("fill", "var(--card)")
      .attr("stroke", line).attr("stroke-width", 2);
    svg.append("rect").attr("x", bx).attr("y", by).attr("width", bw).attr("height", 40).attr("rx", 12).attr("fill", "var(--card)")
      .attr("stroke", line).attr("stroke-width", 2.5);
    svg.append("rect").attr("x", bx - 1).attr("y", by + 13).attr("width", 5).attr("height", 14).attr("fill", "var(--card)");
    svg.append("text").attr("class", "hand").attr("x", bx + bw / 2).attr("y", by + 28).attr("text-anchor", "middle").attr("font-size", 22)
      .style("fill", known ? colour(q.tip) : "var(--ink-soft)").text(msg);
    if (known) svg.append("text").attr("x", bx + bw + 10).attr("y", by + 26).attr("font-size", 13).style("fill", "var(--ink-soft)")
      .text("a friend's text");
  } else {
    svg.append("text").attr("class", "hand").attr("x", W / 2).attr("y", KERB_Y - 14).attr("text-anchor", "middle").attr("font-size", 24)
      .style("fill", "var(--ink-soft)").text("That's everyone for tonight.");
  }
  svg.append("text").attr("x", W / 2).attr("y", H - 4).attr("text-anchor", "middle").attr("font-size", 13).style("fill", "var(--ink-soft)")
    .text(tipsShown ? "filled = came on their friend's tip · outline = followed the crowd · small dot = what their friend said"
                    : "you can't see the others' tips: only who is sitting where");
}

function drawReadouts() {
  const rows = [];
  let note = "";
  if (S.mode === "watch") {
    const ev = S.ev, n = ev.diners.length, done = S.shown >= n, here = ev.diners.slice(0, S.shown);
    const ignored = here.filter(q => q.choice !== q.tip).length, told = here.filter(q => q.chose).length;
    rows.push(["", "The crowd formed at", ev.cascadeAt != null && ev.cascadeAt < S.shown ? `diner ${ev.cascadeAt + 1}` : done ? "never" : "not yet"]);
    rows.push(["crowd", "Went against their friend's tip", `${ignored} of ${S.shown}`]);
    rows.push(["", "Choices that revealed a tip", `${told} of ${S.shown}`]);
    if (done) {
      const right = ev.diners.filter(q => q.tip === ev.better).length, last = ev.diners[n - 1].choice;
      rows.push([right > n / 2 ? "truth" : "wrong", "Tips that named the better one", `${right} of ${n}`]);
      rows.push([last === ev.better ? "truth" : "wrong", "The last diner went to", `${place(last)} ${last === ev.better ? "✓" : "✗"}`]);
    }
    if (S.tally) {
      rows.push(["wrong", "Of 1,000 evenings, the last diner was in the worse one", fmt(S.tally.line)]);
      rows.push(["", "Of 1,000 evenings, pooling the tips was wrong", fmt(S.tally.pooled)]);
    }
  } else if (S.turn) {
    const t = S.turn, me = t.ev.diners[t.pos], done = t.shown >= S.n;
    rows.push(["", "When you arrive", `Blue ${me.counts[0]} · Orange ${me.counts[1]}`]);
    rows.push(["", "Your friend says", place(me.tip)]);
    if (t.mine != null) {
      rows.push([done ? (t.mine === t.ev.better ? "truth" : "wrong") : "", "You went to", `${place(t.mine)}${done ? (t.mine === t.ev.better ? " ✓" : " ✗") : ""}`]);
      rows.push(["crowd", "A sensible diner would go to", place(t.sensible)]);
      note = `${why(me.d, me.tip)}${t.mine !== t.sensible ? " Everyone after you read your choice as a sensible one." : ""}`;
    }
    rows.push(["", "Evenings you ate at the better one", `${S.score.better} of ${S.score.played}`]);
  }
  root.querySelector(".readouts").innerHTML = rows.map(([c, k, v]) =>
    `<div class="readout ${c}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
  const w = root.querySelector(".why");
  w.innerHTML = note; w.hidden = !note;
}

function drawChart() {
  const SEQ = "var(--accent)", POOL = "var(--series-3, #12966a)";
  root.querySelector(".chart-legend").innerHTML = `<span class="lead">${S.n} diners:</span>` +
    `<span class="key"><span class="swatch" style="background:${SEQ}"></span>choosing one after another (the last diner)</span>` +
    `<span class="key"><span class="swatch" style="background:${POOL}"></span>pooling all their tips (the majority)</span>`;
  const svg = d3.select(root.querySelector("svg.chart"));
  svg.selectAll("*").remove();
  const x = d3.scaleLinear([0.55, 0.95], [CM.l, CW - CM.r]), y = d3.scaleLinear([0, 0.5], [CH - CM.b, CM.t]);
  svg.append("g").attr("class", "grid").attr("transform", `translate(${CM.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(CW - CM.l - CM.r)).tickFormat("")).select(".domain").remove();
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${CH - CM.b})`).call(d3.axisBottom(x).ticks(8).tickFormat(d3.format(".0%")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${CM.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));
  svg.append("text").attr("x", CW - CM.r).attr("y", CH - 4).attr("text-anchor", "end").attr("font-size", 14).style("fill", "var(--ink-soft)")
    .text("how often a friend's tip is right");
  const ps = d3.range(0.55, 0.9501, 0.005);
  for (const [f, col] of [[p => lineWrong(S.n, p), SEQ], [p => pooledWrong(S.n, p), POOL]]) {
    svg.append("path").datum(ps).attr("fill", "none").attr("stroke", col).attr("stroke-width", 4).attr("stroke-linecap", "round")
      .attr("d", d3.line(p => x(p), p => y(f(p))));
    svg.append("circle").attr("cx", x(S.p)).attr("cy", y(f(S.p))).attr("r", 8).attr("fill", "var(--card)").attr("stroke", col).attr("stroke-width", 3);
  }
}

// ---------- guided story ----------
function setWatch(patch = {}) {
  clearTimeout(timer);
  Object.assign(S, { n: 20, p: 2 / 3, tally: null }, patch);
  if (S.mode !== "watch") setMode("watch"); else buildControls();
  newEvening(false);
}
const pct = v => (v < 0.001 ? "under 0.1%" : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`);
let evenings = 0;

export const story = [
  { setup: () => setWatch(),
    text: `<p><b>1992.</b> Abhijit Banerjee, and separately Sushil Bikhchandani, David Hirshleifer and Ivo Welch, asked why sensible people follow the crowd, even when their own information says otherwise.</p>
           <p>Banerjee's example: two restaurants side by side. You have heard good things about one, but the other is full. Where do you eat?</p>` },
  { target: ".stage-card", reveal: [".stage-card"], setup: () => { setWatch(); S.shown = 0; draw(); },
    text: `<p>Here is that street. One restaurant is better, but nobody knows which.</p>
           <p>Twenty diners arrive one at a time. Each gets a text from a friend, right two times in three. They can see who is sitting where, but not what anyone's friend said.</p>` },
  { target: '[data-tour="next"]', reveal: [".controls", '[data-tour="next"]'], place: "below",
    text: `<p>Click <b>Next evening</b> and watch the diners arrive.</p>`,
    waitFor: { event: "evening-over", target: '[data-tour="next"]', prompt: "Click Next evening, and wait for the last diner." } },
  { target: ".stage-card",
    text: () => { const c = S.ev.cascadeAt;
      return `<p>At first, diners go where their friend says. Then one restaurant gets two diners ahead${c != null ? ` (here, when diner ${c + 1} arrived)` : ""}.</p>
              <p>Now one friend's text can't outweigh the two that came before, so everyone joins the busier room, whatever their friend said. That is an <b>information cascade</b>.</p>`; } },
  { target: [".stage-card", ".readouts"], reveal: [".readouts"],
    text: () => { const ds = S.ev.diners, told = ds.filter(q => q.chose).length, ignored = ds.filter(q => q.choice !== q.tip).length;
      return `<p>Look at the outlined diners: they followed the crowd. ${ignored} of ${ds.length} went against their own friend's tip. None of them was being foolish; given what they could see, it was the sensible choice.</p>
              <p>Only ${told} of tonight's ${ds.length} choices revealed a friend's tip. The other ${ds.length - told} tell a newcomer nothing new: a full room can hold just a couple of tips' worth of information.</p>`; } },
  { target: '[data-tour="next"]', place: "below", setup: () => { evenings = 0; },
    text: `<p>Play a few more evenings. Sometimes the first two friends happen to be wrong, and the whole street follows them into the worse restaurant.</p>`,
    waitFor: { event: "click", target: '[data-tour="next"]', until: () => ++evenings >= 4, prompt: "Play four more evenings." } },
  { target: '[data-tour="thousand"]', reveal: ['[data-tour="thousand"]'], place: "below",
    text: `<p>Count it. <b>Run 1,000 evenings</b>, and compare with what the diners would have found if they had pooled all their tips.</p>`,
    waitFor: { event: "click", target: '[data-tour="thousand"]', prompt: "Click Run 1,000 evenings." } },
  { target: ".readouts",
    text: () => `<p>${S.tally ? `In ${fmt(S.tally.line)} evenings out of 1,000, the last diner ended up in the worse restaurant. Pooling the same tips would have got it wrong only ${fmt(S.tally.pooled)} times.` : ""}</p>
                 <p>The tips held the answer. Choosing one after another threw most of it away.</p>` },
  { target: ".chart-card", reveal: [".chart-card"],
    text: () => `<p>The exact numbers. With friends right two times in three, the last of ${S.n} diners is in the worse restaurant ${pct(lineWrong(S.n, S.p))} of the time (purple); pooled tips are wrong ${pct(pooledWrong(S.n, S.p))} of the time (green).</p>
                 <p>Pooling is <a href="#/condorcet">Condorcet's jury</a>: independent judgements, counted. A cascade is the same people, watching each other.</p>` },
  { target: '[data-tour="n"]', reveal: ['[data-tour="n"]'], place: "below",
    text: `<p>Would a busier street help? <b>Add diners.</b></p>`,
    waitFor: { event: "input", target: '[data-tour="n"] input', until: () => S.n >= 28, prompt: "Drag Diners tonight to 28 or more." } },
  { target: ".chart-card",
    text: () => `<p>No. Pooled tips keep improving with more diners (now wrong ${pct(pooledWrong(S.n, S.p))} of the time), but the last diner is still wrong ${pct(lineWrong(S.n, S.p))} of the time. The cascade forms among the first few diners, and everyone after adds nothing.</p>` },
  { target: '[data-tour="p"]', reveal: ['[data-tour="p"]'], place: "below",
    text: `<p>What if friends knew better? <b>Make their tips more reliable.</b></p>`,
    waitFor: { event: "input", target: '[data-tour="p"] input', until: () => S.p >= 0.8, prompt: "Drag A friend's tip is right to 80% or more." } },
  { target: ".chart-card",
    text: () => `<p>Wrong cascades get rarer (${pct(lineWrong(S.n, S.p))} now), but pooling is still far better (${pct(pooledWrong(S.n, S.p))}). Better information doesn't stop people from setting it aside.</p>
                 <p>Is this how people really behave? In 1997, Lisa Anderson and Charles Holt played this game with students, using urns and coloured balls instead of restaurants. Cascades formed in most of the rounds where they could.</p>` },
  { target: ".mode", reveal: [".mode"], place: "below",
    text: `<p>Now it's your turn to stand on the street.</p>`,
    waitFor: { event: "click", target: '.mode button[data-value="turn"]', prompt: "Click “Take your turn”." } },
  { target: [".stage-card", '[data-tour="pick-blue"]'], reveal: ['[data-tour="pick-blue"]', '[data-tour="pick-orange"]', '[data-tour="next"]'],
    text: `<p>You see who is sitting where, and your own friend's text, nobody else's. Where do you eat?</p>
           <p>Afterwards, you'll see where a sensible diner would have gone, and why.</p>`,
    waitFor: { event: "click", target: '[data-tour="pick-blue"], [data-tour="pick-orange"]', prompt: "Pick a restaurant." } },
  { text: `<p>That's an information cascade. Everyone reasons well, yet the street as a whole learns little: once people copy the crowd, their own information stops reaching anyone else.</p>
           <p>Compare <a href="#/lorenz">Lorenz's influence</a>, where people see the others' numbers rather than their choices, or go back to the start with <a href="#/galton">Galton's ox</a>.</p>` },
];
