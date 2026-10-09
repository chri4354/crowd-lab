# Crowd Lab

Small interactive explorables on the wisdom — and madness — of crowds, for teaching.

- **Galton's ox** — Galton's 1907 data, then "what if": crowd size, noise, shared bias, and correlation between guesses. Shows the √n fall in error and the floor that bias and copying put under it.
- **Condorcet's jury** — voter competence × jury size, plus voters who differ in competence and voters who copy an opinion leader, with the exact probability that the majority is right.
- **Page's difference** — drag people along a number line and watch the diversity prediction theorem hold: crowd's error = average error − diversity.
- **Collective incentives** — everyone reads the same headline and gets a private tip. People learn which to trust, paid either for their own answer or for the group's. Only group pay teaches them to lean on the independent tip, which is what makes the majority wiser than the headline.

Live at <https://crowdlab.hellopsi.co.uk>. Everything runs in the browser. No build step, no server.

Visits are counted in the hellopsi.co.uk Google Analytics property (G-8FJ78GCLJC), only after the visitor allows analytics cookies. Each tab switch is sent as a `tab_view` event with `tab_id` and `tab_title`.

## Run locally

Any static server from the repo root, e.g.

```bash
python3 -m http.server 8000
```

then open <http://localhost:8000>. (Opening `index.html` directly from disk will not work: ES modules need a server.)

## Add a tab

1. Create `js/tabs/<id>.js` exporting `mount(el)`. Optionally export `unmount()` and `onKey(key)` (`R` is "new crowd" by convention).
2. Add one entry to `js/tabs/registry.js`, with its `refs`: they are listed as numbered sources at the foot of the tab.

Shared helpers (sliders, buttons, the little person figure, statistics) are in `js/lib/util.js`. Colours and type are CSS variables in `css/style.css`.

## Sources

- Galton, F. (1907). Vox populi. *Nature*, 75, 450–451. doi:10.1038/075450a0 — the 787 guesses are rebuilt from the percentiles in the article (see `data/galton1907.js`; the extreme tails are extrapolated).
- Page, S. E. (2007). Making the difference: Applying a logic of diversity. *Academy of Management Perspectives*, 21(4), 6–20.
- Kao, A. B., Miller, N., Torney, C., Hartnett, A., & Couzin, I. D. (2014). Collective learning and optimal consensus decisions in social animal groups. *PLoS Computational Biology*, 10(8), e1003762. doi:10.1371/journal.pcbi.1003762 — the model behind the incentives tab (two cues, majority rule, Rescorla–Wagner learning).
- Pescetelli, N., Rutherford, A., Rahwan, I., & Kao, A. B. (2025). Collective incentives improve group accuracy by reducing reliance on shared news sources. *Collective Intelligence*, 4(3). doi:10.1177/26339137251372605
- Condorcet, M. de (1785). *Essai sur l'application de l'analyse à la probabilité des décisions rendues à la pluralité des voix*. <https://archive.org/details/essaisurlapplica00cond>
- Grofman, B., Owen, G., & Feld, S. L. (1983). Thirteen theorems in search of the truth. *Theory and Decision*, 15(3), 261–278. doi:10.1007/BF00125672
- Ladha, K. K. (1992). The Condorcet jury theorem, free speech, and correlated votes. *American Journal of Political Science*, 36(3), 617–634. doi:10.2307/2111584

Style inspired by Nicky Case's explorables.
