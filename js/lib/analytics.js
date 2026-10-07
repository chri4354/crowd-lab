// Google Analytics helpers. The tag itself is in index.html, with Consent Mode
// defaulting to "denied": nothing is stored until the visitor clicks Allow.
const KEY = "crowdlab-analytics";
const gtag = (...args) => window.gtag?.(...args);

function stored() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function remember(choice) {
  try { localStorage.setItem(KEY, choice); } catch { /* private mode: ask again next time */ }
}

// Tab switches don't load a new page, so report each one as an event.
export function trackTab(id, title) {
  gtag("event", "tab_view", { tab_id: id, tab_title: title });
}

function showBanner() {
  if (document.querySelector(".consent")) return;
  const el = document.createElement("div");
  el.className = "consent card";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Analytics cookies");
  el.innerHTML = `
    <p>Crowd Lab can use Google Analytics cookies to count visits. Nothing is stored unless you allow it.</p>
    <div class="btn-row"><button type="button" class="primary" data-c="granted">Allow</button>
    <button type="button" data-c="denied">No thanks</button></div>`;
  el.addEventListener("click", e => {
    const c = e.target.closest("button")?.dataset.c;
    if (!c) return;
    remember(c);
    gtag("consent", "update", { analytics_storage: c });
    el.remove();
  });
  document.body.appendChild(el);
}

export function initConsent() {
  if (!stored()) showBanner();
  document.getElementById("analytics-settings")?.addEventListener("click", e => { e.preventDefault(); showBanner(); });
}
