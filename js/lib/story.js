// Guided stories: a step-by-step walk through a tab, one idea at a time.
//
// A tab opts in by exporting `story`: an array of steps. Each step may have
//   target   CSS selector (inside the tab) to point at; omit for a centred card
//   text     HTML, or a function returning HTML (evaluated when the step opens)
//   reveal   selectors to show from this step on; anything any step reveals is
//            hidden until then, so the page builds up as the story goes
//   setup    function run when the step opens (e.g. set the crowd to one person)
//   waitFor  { event, target, until?, prompt? }: Next stays disabled until the user
//            fires `event` (e.g. "input", "click") on `target`, and `until()` is true
//   place    "right" | "left" | "below" | "above" (default: wherever fits)
//
// The page stays fully usable during a story: the dimming is only visual.

const KEY = "crowdlab-guided";

// On unless the visitor turned it off; ?guide=0 / ?guide=1 overrides for this visit.
export function guidedOn() {
  const q = new URLSearchParams(location.search).get("guide");
  if (q === "0" || q === "1") return q === "1";
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setGuided(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode: just this visit */ }
}

export function startStory(root, steps, { onEnd } = {}) {
  const hidden = [...new Set(steps.flatMap(s => s.reveal || []))];
  const revealed = new Set();
  const dim = el("div", "story-dim");
  const card = el("div", "story-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-live", "polite");
  document.body.append(dim, card);
  let i = -1, done = false, satisfied = false, detach = () => {};

  const applyReveal = () => {
    for (const sel of hidden) root.querySelectorAll(sel).forEach(n => n.classList.toggle("story-hidden", !revealed.has(sel)));
  };
  // tabs rebuild parts of the page; keep newly built nodes hidden or shown as they should be
  const mo = new MutationObserver(() => { if (!done) applyReveal(); });
  mo.observe(root, { childList: true, subtree: true });

  function go(k) {
    detach();
    i = Math.max(0, Math.min(steps.length - 1, k));
    const s = steps[i];
    revealed.clear();
    steps.slice(0, i + 1).forEach(t => (t.reveal || []).forEach(sel => revealed.add(sel)));
    applyReveal();
    s.setup?.();
    satisfied = !s.waitFor;
    render();
    const t = s.target && root.querySelector(s.target);
    if (t) t.scrollIntoView({ block: "nearest", behavior: "smooth" });   // scroll only if it is out of view
    if (s.waitFor) {
      const w = s.waitFor;
      // check after the tab has handled the event, so `until` sees the new state
      const handler = e => {
        if (!e.target.closest?.(w.target)) return;
        setTimeout(() => {
          if (done || steps[i] !== s || satisfied) return;
          if (w.until && !w.until()) return;
          satisfied = true;
          render();
        }, 0);
      };
      root.addEventListener(w.event, handler);
      detach = () => root.removeEventListener(w.event, handler);
    } else detach = () => {};
    requestAnimationFrame(position);
  }

  function render() {
    const s = steps[i], last = i === steps.length - 1;
    const text = typeof s.text === "function" ? s.text() : s.text;
    card.innerHTML = `
      <div class="story-top"><span class="story-count">${i + 1} / ${steps.length}</span>
        <button type="button" class="story-x" aria-label="Close the story">×</button></div>
      <div class="story-text">${text}</div>
      ${s.waitFor && !satisfied ? `<p class="story-try">${s.waitFor.prompt || "Try it, then press Next."}</p>` : ""}
      <div class="story-nav">
        ${i > 0 ? `<button type="button" class="story-back">Back</button>` : "<span></span>"}
        <button type="button" class="story-next primary"${satisfied ? "" : " disabled"}>${last ? "Done" : "Next"}</button>
      </div>`;
    card.querySelector(".story-x").onclick = () => end();
    card.querySelector(".story-back")?.addEventListener("click", () => go(i - 1));
    card.querySelector(".story-next").onclick = () => (last ? end() : go(i + 1));
    position();
  }

  function position() {
    if (done) return;
    const s = steps[i], pad = 8, gap = 14;
    const t = s.target && root.querySelector(s.target);
    const vw = innerWidth, vh = innerHeight;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    if (!t || vw < 760) {
      dim.classList.toggle("full", !t);
      if (t) placeHole(t.getBoundingClientRect(), pad); else Object.assign(dim.style, { left: "0", top: "0", width: "100vw", height: "100vh" });
      card.classList.toggle("sheet", vw < 760);
      if (vw >= 760) Object.assign(card.style, { left: `${(vw - cw) / 2}px`, top: `${(vh - ch) / 2}px` });
      else Object.assign(card.style, { left: "", top: "" });
      return;
    }
    card.classList.remove("sheet");
    dim.classList.remove("full");
    const r = t.getBoundingClientRect();
    placeHole(r, pad);
    const room = { right: vw - r.right, left: r.left, below: vh - r.bottom, above: r.top };
    const side = s.place && room[s.place] > (s.place === "right" || s.place === "left" ? cw : ch) + gap ? s.place
      : room.right > cw + gap ? "right" : room.left > cw + gap ? "left" : room.below > ch + gap ? "below" : "above";
    let x, y;
    if (side === "right") { x = r.right + gap; y = r.top + r.height / 2 - ch / 2; }
    if (side === "left") { x = r.left - gap - cw; y = r.top + r.height / 2 - ch / 2; }
    if (side === "below") { x = r.left + r.width / 2 - cw / 2; y = r.bottom + gap; }
    if (side === "above") { x = r.left + r.width / 2 - cw / 2; y = r.top - gap - ch; }
    card.style.left = `${Math.max(8, Math.min(vw - cw - 8, x))}px`;
    card.style.top = `${Math.max(8, Math.min(vh - ch - 8, y))}px`;
  }

  function placeHole(r, pad) {
    Object.assign(dim.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
  }

  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); end(); }
  }

  function end() {
    if (done) return;
    done = true;
    detach();
    mo.disconnect();
    ro.disconnect();
    root.querySelectorAll(".story-hidden").forEach(n => n.classList.remove("story-hidden"));
    dim.remove(); card.remove();
    removeEventListener("scroll", position, true);
    removeEventListener("resize", position);
    removeEventListener("keydown", onKey, true);
    onEnd?.();
  }

  const ro = new ResizeObserver(() => position());
  ro.observe(document.documentElement);
  addEventListener("scroll", position, true);
  addEventListener("resize", position);
  addEventListener("keydown", onKey, true);
  go(0);
  return { stop: end };
}

function el(tag, cls) { const n = document.createElement(tag); n.className = cls; return n; }
