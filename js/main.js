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

// PSi's mark, as on hellopsi.co.uk
const PSI_MARK = `<svg class="psi-mark" viewBox="0 0 101 89" aria-hidden="true"><path d="M5.23953 67.4264C7.96996 76.8826 15.8877 88.2296 15.8877 88.2296C15.0683 83.9072 19.7084 74.9893 21.8969 73.0998C27.9062 67.9093 43.9123 69.858 65.8716 69.858C86.3537 69.858 100.014 53.1055 100.014 32.301C100.014 13.896 86.0841 0.689209 52.7614 0.689209C22.9339 0.689209 9.059 8.25342 2.77746 26.0866C-3.50408 43.9184 2.50911 57.9701 5.23953 67.4264Z" fill="#8e59ff"></path><path d="M54.1419 36.3632C63.3909 37.3936 65.1144 33.6688 64.8343 27.2895C64.5138 19.3634 48.5377 20.5123 44.4538 26.1793C40.3699 31.8463 42.0126 36.4431 44.7352 38.5824C46.8025 40.07 48.8608 41.6065 48.8608 41.6065C45.5754 40.8119 43.1589 40.3418 39.8358 41.3477C36.5126 42.3523 34.6251 48.2164 37.788 50.7923C39.9113 52.2889 45.268 53.5009 47.8707 53.3644C50.4735 53.2278 52.9538 52.2219 54.9052 50.5115C58.9084 46.5485 53.342 41.0798 51.1392 36.8784C50.6585 35.9279 50.0996 34.5408 49.7401 33.589C50.1739 34.3849 50.807 35.0572 51.5769 35.5428C52.3481 36.0284 53.23 36.3104 54.1419 36.3632Z" fill="#ffffff"></path><path d="M68.8386 32.194C67.9658 35.1087 67.2702 36.8449 66.0014 40.115C64.7325 43.3852 61.8067 45.1844 61.7273 48.3129C61.6465 51.4414 63.4064 54.0559 68.44 53.2239C73.4749 52.3919 75.8314 41.3424 75.1123 35.678C74.3932 30.0148 69.7101 29.2781 68.8386 32.194Z" fill="#ffffff"></path><path d="M66.7837 28.2011C67.2201 29.7106 68.4837 31.5215 68.4837 31.5215C68.3534 30.8311 69.0934 29.4079 69.4425 29.1065C70.4026 28.2784 72.9571 28.5888 76.4613 28.5888C79.7311 28.5888 81.9118 25.915 81.9118 22.5933C81.9118 19.6554 79.6881 17.5483 74.3692 17.5483C69.6079 17.5483 67.3934 18.7552 66.3916 21.6016C65.3885 24.448 66.3486 26.6916 66.7837 28.2011Z" fill="#ffffff"></path><path d="M41.4064 30.2803C41.4064 20.5677 24.7594 20.3707 21.59 23.2647C16.0535 28.338 17.8994 43.0839 20.9881 48.7523C24.0768 54.4206 28.0864 51.6863 28.0864 51.6863C33.3818 47.7219 30.0535 40.1899 30.0535 40.1899C30.0535 40.1899 41.4468 44.8278 41.4064 30.2803Z" fill="#ffffff"></path></svg>`;

// the same small foot on every page: who makes Crowd Lab, and where its code lives
const siteFoot = () => stage.insertAdjacentHTML("beforeend", `
  <footer class="site-foot">
    <a class="made-by" href="https://hellopsi.co.uk" target="_blank" rel="noopener" aria-label="Produced by PSi: hellopsi.co.uk, opens in a new tab">
      <span>Produced by</span>${PSI_MARK}<b>PSi</b></a>
    <p>Crowd Lab is open source, and contributions are welcome:
      <a href="https://github.com/chri4354/crowd-lab" target="_blank" rel="noopener">github.com/chri4354/crowd-lab</a></p>
  </footer>`);

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
  if (!tab) { home(); siteFoot(); document.title = "Crowd Lab"; trackTab("home", "Home"); return; }
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
  siteFoot();
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
