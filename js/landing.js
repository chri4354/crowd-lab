// The landing page: two ways in besides the plain list. "What's going wrong?" starts from a
// symptom a person or organisation might recognise; "What are you trying to do?" starts from
// the situation. Both are a question or two, ending in one experiment to try (and sometimes a
// second). DRAFT: the wording is for discussion.

// one line per experiment: what it shows, in plain words
const TAKE = {
  galton: "Averaging cancels errors that point in different directions. A bias everyone shares doesn't cancel, however many people you ask.",
  condorcet: "A majority of independent voters, each a little better than chance, is almost always right. If they copy each other, or are worse than chance, it fails.",
  page: "A crowd's average beats its average member by exactly how much its members disagree. People who think alike add little.",
  incentives: "Pay people for their own accuracy and they all lean on the shared source. Pay them for the group's accuracy and they learn to keep their own information.",
  estimates: "Paid for the group's error, people learn to rely more on their own information, and the larger the group, the more they should.",
  lorenz: "Seeing each other's numbers makes a group more alike and more confident, but not necessarily more right. It can push the truth outside every guess.",
  becker: "Influence shrinks disagreement in any network. With many small circles, and accurate people holding firm, the group improves; with one voice at the centre, the group becomes that voice.",
  cascades: "When people see what others chose but not why, a few early choices can carry everyone after them, whatever their own information says.",
  hiddenprofile: "Points everyone knows get said more, so they count more. What only one person knows rarely comes up, and the group can miss the better option.",
  commons: "Open to everyone, a shared resource tends to run down. Rules people can watch and enforce, with clear boundaries, can make it last.",
  twoheads: "Going with the surer person helps when you are about equally good. When one of you is much less reliable, their confidence gives them too much say.",
};

// ideas with no experiment yet
const SOON = {
  trust: { title: "Trust without feedback", take: "How do you learn whose advice is good when no one tells you who was right? By how often they agree with you when you are sure (Pescetelli & Yeung, 2021).", },
  options: { title: "More than two options", take: "With three or more options, majority voting can go round in circles, and no voting rule is fair in every way (Condorcet's paradox, Arrow's theorem).", },
};

// a node is a question { q, answers: [{ label, hint?, to }] } or a result { go, also? } or { soon }
const SYMPTOMS = {
  q: "Which of these sounds like your group?",
  answers: [
    { label: "We agree too quickly.", hint: "and then turn out to be wrong together",
      to: { q: "What are you agreeing on?", answers: [
        { label: "A number", hint: "a forecast, a budget, a deadline", to: { go: "lorenz", also: "becker" } },
        { label: "A choice, made one after another", hint: "which tool to adopt, which candidate to back", to: { go: "cascades" } },
      ] } },
    { label: "Our meetings go over what everyone already knows.", hint: "and the one useful fact never comes up",
      to: { go: "hiddenprofile" } },
    { label: "The most confident person always wins.", hint: "whether or not they are right",
      to: { go: "twoheads" } },
    { label: "We all make the same mistake.", hint: "asking more people doesn't help",
      to: { q: "How do you put views together?", answers: [
        { label: "We average numbers", hint: "estimates, forecasts, scores", to: { go: "galton", also: "page" } },
        { label: "We vote", hint: "yes or no, this or that", to: { go: "condorcet" } },
        { label: "We hire people who think alike", hint: "same training, same sources", to: { go: "page", also: "galton" } },
      ] } },
    { label: "One person's view spreads to everyone.", hint: "a boss, a pundit, a group chat",
      to: { go: "becker", also: "lorenz" } },
    { label: "Everyone follows the same source.", hint: "the same report, the same headline",
      to: { q: "Is the answer a choice or a number?", answers: [
        { label: "A choice", hint: "true or false, buy or sell", to: { go: "incentives", also: "estimates" } },
        { label: "A number", hint: "a price, a forecast", to: { go: "estimates", also: "incentives" } },
      ] } },
    { label: "Our shared budget keeps running out.", hint: "time, money, attention, a shared resource",
      to: { go: "commons" } },
    { label: "We don't know whose advice to trust.", hint: "and nobody tells us who was right", to: { soon: "trust" } },
    { label: "We can't agree among several options.", hint: "every vote gives a different winner", to: { soon: "options" } },
  ],
};

const SITUATIONS = {
  q: "What does your group need to produce?",
  answers: [
    { label: "A number", hint: "a forecast, a price, a budget",
      to: { q: "How do the numbers come together?", answers: [
        { label: "Everyone guesses alone, then we average", to: { go: "galton", also: "page" } },
        { label: "People see each other's numbers first", to: { go: "lorenz", also: "becker" } },
        { label: "People are paid for being right", to: { go: "estimates", also: "incentives" } },
      ] } },
    { label: "A choice", hint: "launch or not, hire or not, this supplier or that",
      to: { q: "How does the choice get made?", answers: [
        { label: "A vote", to: { go: "condorcet" } },
        { label: "One after another, each seeing what the others chose", to: { go: "cascades" } },
        { label: "A meeting where people discuss", to: { go: "hiddenprofile" } },
        { label: "Me and one advisor or colleague", to: { go: "twoheads" } },
        { label: "People are paid for being right", to: { go: "incentives", also: "estimates" } },
        { label: "Among more than two options", to: { soon: "options" } },
      ] } },
    { label: "Fair use of something shared", hint: "a budget, people's time, a common resource",
      to: { go: "commons" } },
  ],
};

let el, TABS, mode = "symptoms", trail = [];

export function landing(stage, tabs) {
  el = stage; TABS = tabs; trail = [];
  try { mode = sessionStorage.getItem("crowdlab-entry") || "symptoms"; } catch { /* private mode */ }
  render();
}

const tab = id => { const i = TABS.findIndex(t => t.id === id); return { ...TABS[i], n: i + 1 }; };
const root = () => (mode === "symptoms" ? SYMPTOMS : SITUATIONS);
const node = () => trail.reduce((n, i) => n.answers[i].to, root());

function setMode(m) {
  mode = m; trail = [];
  try { sessionStorage.setItem("crowdlab-entry", m); } catch { /* private mode */ }
  render();
}

function render() {
  el.innerHTML = `
    <header class="tab-head">
      <h1>When is a crowd wise?</h1>
      <p class="question">Groups get things right, and wrong, in ways you can predict. Start from what's bothering you, and we'll point you to an experiment you can play with.</p>
    </header>
    <div class="entry seg" role="group" aria-label="How to start">
      ${[["symptoms", "What's going wrong?"], ["situations", "What are you trying to do?"], ["all", "All experiments"]]
        .map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${mode === v}">${l}</button>`).join("")}
    </div>
    <div class="entry-body"></div>`;
  el.querySelectorAll(".entry button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.v)));
  const body = el.querySelector(".entry-body");
  if (mode === "all") { body.innerHTML = allGrid(); return; }
  body.innerHTML = crumbs() + step(node());
  body.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => { trail.push(Number(b.dataset.a)); render(); scrollToBody(); }));
  body.querySelectorAll("[data-back]").forEach(b => b.addEventListener("click", () => { trail = trail.slice(0, Number(b.dataset.back)); render(); }));
}

function scrollToBody() {
  const b = el.querySelector(".entry-body"), r = b.getBoundingClientRect();
  if (r.top < 0 || r.top > innerHeight * 0.6) b.scrollIntoView({ block: "start", behavior: "smooth" });
}

// what the visitor has said so far, each step clickable to go back to it
function crumbs() {
  if (!trail.length) return "";
  let n = root();
  const bits = trail.map((i, k) => {
    const a = n.answers[i]; n = a.to;
    return `<button type="button" class="crumb" data-back="${k}" title="Change this answer">${a.label.replace(/\.$/, "")}</button>`;
  });
  return `<div class="trail"><span>You said</span>${bits.join(`<span aria-hidden="true">→</span>`)}
    <button type="button" class="crumb restart" data-back="0">Start again</button></div>`;
}

function step(n) {
  if (n.answers) {
    const many = n.answers.length > 4;
    return `<h2 class="ask">${n.q}</h2>
      <div class="answers-list ${many ? "many" : ""} ${trail.length ? "" : "first"}">
        ${n.answers.map((a, i) => `
          <button type="button" class="pick${a.to.soon ? " soon" : ""}" data-a="${i}">
            <span class="say">${a.label}</span>${a.hint ? `<span class="hint">${a.hint}</span>` : ""}
            ${a.to.soon ? `<span class="tag">not built yet</span>` : ""}
          </button>`).join("")}
      </div>`;
  }
  if (n.soon) {
    const s = SOON[n.soon];
    return `<div class="card result soon"><p class="kicker">An idea for a future experiment</p>
      <h2>${s.title}</h2><p class="take">${s.take}</p>
      <p class="hint">Nothing to play here yet. In the meantime, <a href="#/twoheads">Two heads</a> is the closest.</p></div>`;
  }
  const t = tab(n.go), o = n.also && tab(n.also);
  return `<div class="card result">
      <p class="kicker">Try this</p>
      <h2>${t.n} · ${t.title}</h2>
      <p class="sub">${t.subtitle}</p>
      <p class="take">${TAKE[t.id]}</p>
      <a class="play" href="#/${t.id}">Play it ▶</a>
    </div>
    ${o ? `<p class="also">Then try <a href="#/${o.id}">${o.n} · ${o.title}</a>: ${TAKE[o.id]}</p>` : ""}
    <p class="note">These are simplified models of what the research found, not a diagnosis. They show why a problem like yours can happen, and what changes it.</p>`;
}

function allGrid() {
  return `<div class="home-grid">
    ${TABS.map((t, i) => `
      <a href="#/${t.id}"><div class="card">
        <h2>${i + 1} · ${t.title}</h2><p style="margin:0">${t.subtitle}</p>
      </div></a>`).join("")}
  </div>`;
}
