# Crowd Lab

Small interactive explorables on the wisdom — and madness — of crowds, for teaching.

- **Galton's ox** — Galton's 1907 data, then "what if": crowd size, noise, shared bias, and correlation between guesses. Shows the √n fall in error and the floor that bias and copying put under it.
- **Condorcet's jury** — voter competence × jury size, plus voters who differ in competence and voters who copy an opinion leader, with the exact probability that the majority is right.
- **Page's difference** — drag people along a number line and watch the diversity prediction theorem hold: crowd's error = average error − diversity.

Everything runs in the browser. No build step, no server.

## Run locally

Any static server from the repo root, e.g.

```bash
python3 -m http.server 8000
```

then open <http://localhost:8000>. (Opening `index.html` directly from disk will not work: ES modules need a server.)

## Add a tab

1. Create `js/tabs/<id>.js` exporting `mount(el)`. Optionally export `unmount()` and `onKey(key)` (`R` is "new crowd" by convention).
2. Add one entry to `js/tabs/registry.js`.

Shared helpers (sliders, buttons, the little person figure, statistics) are in `js/lib/util.js`. Colours and type are CSS variables in `css/style.css`.

## Sources

- Galton, F. (1907). Vox populi. *Nature*, 75, 450–451. doi:10.1038/075450a0 — the 787 guesses are rebuilt from the percentiles in the article (see `data/galton1907.js`; the extreme tails are extrapolated).
- Page, S. E. (2007). Making the difference: Applying a logic of diversity. *Academy of Management Perspectives*, 21(4), 6–20.
- Condorcet, M. de (1785). *Essai sur l'application de l'analyse à la probabilité des décisions rendues à la pluralité des voix*.

Style inspired by Nicky Case's explorables.
