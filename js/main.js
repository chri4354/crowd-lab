import { TABS } from "./tabs/registry.js";
import { initConsent, trackTab } from "./lib/analytics.js";
import { guidedOn, setGuided, startStory } from "./lib/story.js";

const nav = document.getElementById("tab-nav");
const stage = document.getElementById("stage");
let current = null; // { id, module }
let story = null;   // the running guided story, if any

nav.innerHTML = TABS.map((t, i) => `
  <a href="#/${t.id}" data-id="${t.id}">
    <span class="num">${i + 1}</span><span class="t">${t.title}</span><span class="s">${t.subtitle}</span>
  </a>`).join("");

function home() {
  stage.innerHTML = `
    <header class="tab-head">
      <h1>When is a crowd wise?</h1>
      <p class="question">Small interactive experiments on how groups get things right — and wrong. Pick one.</p>
    </header>
    <div class="home-grid">
      ${TABS.map((t, i) => `
        <a href="#/${t.id}"><div class="card">
          <h2>${i + 1} · ${t.title}</h2><p style="margin:0">${t.subtitle}</p>
        </div></a>`).join("")}
    </div>`;
}

// "https://doi.org/10.x/y" -> "doi:10.x/y"; anything else loses its scheme
const refLabel = url => url.startsWith("https://doi.org/") ? `doi:${url.slice(16)}` : url.replace(/^https?:\/\//, "");

async function route() {
  const id = location.hash.replace(/^#\/?/, "");
  const tab = TABS.find(t => t.id === id);
  story?.stop();
  if (current?.module?.unmount) current.module.unmount();
  current = null;
  nav.querySelectorAll("a").forEach(a => a.toggleAttribute("aria-current", a.dataset.id === id));
  nav.querySelectorAll("a[aria-current]").forEach(a => a.setAttribute("aria-current", "page"));
  if (!tab) { home(); document.title = "Crowd Lab"; trackTab("home", "Home"); return; }
  stage.innerHTML = "";
  const module = await tab.load();
  current = { id, module };
  document.title = `${tab.title} · Crowd Lab`;
  trackTab(tab.id, tab.title);
  module.mount(stage);
  if (tab.refs?.length) stage.insertAdjacentHTML("beforeend", `
    <footer class="refs">
      <h2>Sources</h2>
      <ol>${tab.refs.map(r => `<li>${r.cite}${r.url ? ` <a href="${r.url}" target="_blank" rel="noopener">${refLabel(r.url)}</a>` : ""}</li>`).join("")}</ol>
    </footer>`);
  if (module.story) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "story-btn"; b.textContent = "▶ Walk me through it";
    b.addEventListener("click", runStory);
    stage.querySelector(".tab-head")?.appendChild(b);
    if (guidedOn()) runStory();
  }
  stage.focus({ preventScroll: true });
}

function runStory() {
  story?.stop();
  if (current?.module?.story) story = startStory(stage, current.module.story, { onEnd: () => { story = null; } });
}

const toggle = document.getElementById("guided");
toggle.checked = guidedOn();
toggle.addEventListener("change", () => {
  setGuided(toggle.checked);
  if (toggle.checked) { if (!story) runStory(); } else story?.stop();
});

window.addEventListener("hashchange", route);
window.addEventListener("keydown", e => {
  if (e.target.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= TABS.length) { location.hash = `#/${TABS[n - 1].id}`; return; }
  current?.module?.onKey?.(e.key.toLowerCase(), e);
});
initConsent();
route();
