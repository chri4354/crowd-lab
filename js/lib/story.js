// Guided stories: a step-by-step walk through a tab, one idea at a time.
//
// A tab opts in by exporting `story`: an array of steps. Each step may have
//   target   CSS selector (inside the tab), or a list of them, to point at; the
//            highlight covers all of them. Omit for a centred card
//   text     HTML, or a function returning HTML (evaluated when the step opens)
//   reveal   selectors to show from this step on; anything any step reveals is
//            hidden until then, so the page builds up as the story goes
//   setup    function run when the step opens (e.g. set the crowd to one person)
//   waitFor  { event, target, until?, prompt? }: Next stays disabled until the user
//            fires `event` (e.g. "input", "click") on `target`, and `until()` is true
//   place    "right" | "left" | "below" | "above" (default: wherever fits)
//
// The page stays fully usable during a story: the dimming is only visual. The card
// is placed so it never covers what the reader is asked to use (the waitFor target),
// and the reader can drag it away by its top bar.

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
  let i = -1, done = false, satisfied = false, manual = false, detach = () => {};

  const applyReveal = () => {
    for (const sel of hidden) root.querySelectorAll(sel).forEach(n => n.classList.toggle("story-hidden", !revealed.has(sel)));
  };
  // tabs rebuild parts of the page; keep newly built nodes hidden or shown as they should be
  const mo = new MutationObserver(() => { if (!done) applyReveal(); });
  mo.observe(root, { childList: true, subtree: true });

  function go(k) {
    detach();
    i = Math.max(0, Math.min(steps.length - 1, k));
    manual = false;
    const s = steps[i];
    revealed.clear();
    steps.slice(0, i + 1).forEach(t => (t.reveal || []).forEach(sel => revealed.add(sel)));
    applyReveal();
    s.setup?.();
    satisfied = !s.waitFor;
    render();
    // scroll only if needed; what the reader must use comes first, then what they should look at
    const t = s.target && root.querySelector([].concat(s.target)[0]);
    const u = s.waitFor && root.querySelector(s.waitFor.target);
    const offscreen = n => { const r = n.getBoundingClientRect(); return r.top < 0 || r.bottom > innerHeight; };
    const focus = u && offscreen(u) ? u : t;
    if (focus) focus.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
      ${s.waitFor && !satisfied ? `<p class="story-try">${(typeof s.waitFor.prompt === "function" ? s.waitFor.prompt() : s.waitFor.prompt) || "Try it, then press Next."}</p>` : ""}
      <div class="story-nav">
        ${i > 0 ? `<button type="button" class="story-back">Back</button>` : "<span></span>"}
        <button type="button" class="story-next primary"${satisfied ? "" : " disabled"}>${last ? "Done" : "Next"}</button>
      </div>`;
    card.querySelector(".story-x").onclick = () => end();
    card.querySelector(".story-back")?.addEventListener("click", () => go(i - 1));
    card.querySelector(".story-next").onclick = () => (last ? end() : go(i + 1));
    card.querySelector(".story-top").addEventListener("pointerdown", grab);
    position();
  }

  // drag the card by its top bar, out of the way of whatever is underneath
  function grab(e) {
    if (e.target.closest("button")) return;
    e.preventDefault();
    const r = card.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = ev => {
      manual = true;
      card.style.left = `${Math.max(0, Math.min(innerWidth - r.width, ev.clientX - dx))}px`;
      card.style.top = `${Math.max(0, Math.min(innerHeight - r.height, ev.clientY - dy))}px`;
    };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }

  // the bounding box of everything matching one selector or a list of them
  function rectOf(sel) {
    if (!sel) return null;
    const rs = [].concat(sel).flatMap(x => [...root.querySelectorAll(x)]).map(n => n.getBoundingClientRect()).filter(r => r.width || r.height);
    if (!rs.length) return null;
    const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top));
    const r = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom));
    return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
  }

  function position() {
    if (done) return;
    const s = steps[i], pad = 8, gap = 14, m = 6;
    const r = rectOf(s.target), use = rectOf(s.waitFor?.target);
    const vw = innerWidth, vh = innerHeight;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    dim.classList.toggle("full", !r);
    if (r) placeHole(r, pad); else Object.assign(dim.style, { left: "0", top: "0", width: "100vw", height: "100vh" });
    if (manual) return;
    // phones: a sheet along the bottom, or the top if the reader has to use the lower half
    card.classList.toggle("sheet", vw < 760);
    card.classList.toggle("sheet-top", vw < 760 && !!use && (use.top + use.bottom) / 2 > vh / 2);
    if (vw < 760) { Object.assign(card.style, { left: "", top: "" }); return; }
    if (!r) { Object.assign(card.style, { left: `${(vw - cw) / 2}px`, top: `${(vh - ch) / 2}px` }); return; }

    const clampBox = (x, y) => {
      const l = Math.max(8, Math.min(vw - cw - 8, x)), t = Math.max(8, Math.min(vh - ch - 8, y));
      return { left: l, top: t, right: l + cw, bottom: t + ch };
    };
    const at = {
      right: () => clampBox(r.right + gap, r.top + r.height / 2 - ch / 2),
      left: () => clampBox(r.left - gap - cw, r.top + r.height / 2 - ch / 2),
      below: () => clampBox(r.left + r.width / 2 - cw / 2, r.bottom + gap),
      above: () => clampBox(r.left + r.width / 2 - cw / 2, r.top - gap - ch),
    };
    const sides = [...new Set([s.place, "right", "left", "below", "above"].filter(Boolean))].map(k => at[k]());
    const corners = [[vw, vh], [vw, 0], [0, vh], [0, 0]].map(([x, y]) => clampBox(x ? vw : 0, y ? vh : 0));
    const hits = (a, b) => b && a.left < b.right + m && a.right > b.left - m && a.top < b.bottom + m && a.bottom > b.top - m;
    // best: clear of both the highlight and what the reader must use; then clear of what they must use
    const box = sides.find(c => !hits(c, r) && !hits(c, use))
      || [...sides, ...corners].find(c => !hits(c, use))
      || sides[0];
    card.style.left = `${box.left}px`;
    card.style.top = `${box.top}px`;
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
