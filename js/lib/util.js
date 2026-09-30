// Shared helpers: random numbers, statistics, controls and drawing.

// ---------- random ----------
export function normal() {
  // Box–Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function sample(arr, n) {
  // n items without replacement (partial Fisher–Yates)
  const a = arr.slice();
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

// ---------- statistics ----------
export const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
export function median(xs) {
  const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------- controls ----------
// slider({ label, min, max, step, value, format, hint, onInput }) -> element with .set(v)
export function slider({ label, min, max, step = 1, value, format = v => v, hint = "", onInput }) {
  const el = document.createElement("div");
  el.className = "control";
  const id = "s" + Math.random().toString(36).slice(2, 8);
  el.innerHTML = `
    <label for="${id}"><span>${label}</span><output for="${id}"></output></label>
    <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
    ${hint ? `<p class="hint">${hint}</p>` : ""}`;
  const input = el.querySelector("input"), out = el.querySelector("output");
  const update = () => { out.textContent = format(Number(input.value)); };
  input.addEventListener("input", () => { update(); onInput(Number(input.value)); });
  update();
  el.set = v => { input.value = v; update(); };
  el.value = () => Number(input.value);
  return el;
}

export function button(label, onClick, cls = "") {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = label; if (cls) b.className = cls;
  b.addEventListener("click", onClick);
  return b;
}

// segmented toggle: seg(["A","B"], active, onChange)
export function seg(options, active, onChange) {
  const el = document.createElement("div");
  el.className = "seg"; el.setAttribute("role", "group");
  options.forEach(o => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = o.label; b.dataset.value = o.value;
    b.setAttribute("aria-pressed", String(o.value === active));
    b.addEventListener("click", () => {
      el.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      onChange(o.value);
    });
    el.appendChild(b);
  });
  return el;
}

// ---------- drawing ----------
// A little person, feet at (0,0), height ~s. `g` is a d3 selection.
export function drawPerson(g, s) {
  g.append("path").attr("class", "person-body")
    .attr("d", `M${-s * 0.3},0 Q${-s * 0.3},${-s * 0.5} 0,${-s * 0.5} Q${s * 0.3},${-s * 0.5} ${s * 0.3},0 Z`);
  g.append("circle").attr("class", "person-head").attr("cy", -s * 0.72).attr("r", s * 0.2);
  return g;
}

// Stack values into a dot plot: returns [{v, x, level}] with columns of width `bin` px.
export function stackDots(values, x, bin) {
  const cols = new Map();
  return values.slice().sort((a, b) => a - b).map(v => {
    const px = x(v), c = Math.round(px / bin);
    const level = cols.get(c) || 0; cols.set(c, level + 1);
    return { v, x: c * bin, level };
  });
}

export const fmt = (v, d = 0) => Number(v).toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d });
