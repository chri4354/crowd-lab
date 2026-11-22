# Crowd Lab

Small interactive explorables on the wisdom — and madness — of crowds, for teaching.

- **Galton's ox** — Galton's 1907 data, then "what if": crowd size, noise, shared bias, and correlation between guesses. Shows the √n fall in error and the floor that bias and copying put under it.
- **Condorcet's jury** — voter competence × jury size, plus voters who differ in competence and voters who copy an opinion leader, with the exact probability that the majority is right.
- **Page's difference** — drag people along a number line and watch the diversity prediction theorem hold: crowd's error = average error − diversity.
- **Group rewards I** — everyone reads the same headline and gets a private tip. People learn which to trust, paid either for their own answer or for the group's. Only group pay teaches them to lean on the independent tip, which is what makes the majority wiser than the headline.
- **Group rewards II** — the same question with numbers instead of choices: the crowd averages, and people learn their weight on the tip by the delta rule. The crowd's error falls to its optimum while each person's rises.
- **Lorenz's influence** — replays Lorenz et al.'s Zurich experiment (groups of 12, five guesses, seeing nothing, the average or every guess) on a log scale, then "what if" simulations. Seeing others shrinks the spread, pushes the truth to the edge of the guesses and raises confidence.
- **Becker's networks** — replays Becker et al.'s experiment (groups of 40 seeing the average of four random neighbours, of one hub, or of nobody), with the real networks, then "what if" simulations. With neighbours and accurate people revising less, the group's average improves; with a hub, it follows the hub.
- **Information cascades** — Banerjee's two restaurants on Bikhchandani, Hirshleifer & Welch's model: diners arrive one by one with a friend's tip, seeing who sits where but not the tips. Once one room leads by two, everyone follows the crowd, and the evening ends in the worse restaurant far more often than pooling the tips would. Watch the street, run 1,000 evenings, or take your own turn.
- **Hidden profiles** — a toy hidden profile on Stasser & Titus's sampling rule: four members, two candidates. Best has more good points, but they are split between members, while Okay's are known to all. Each holder mentions a point with chance p, so shared points come up more often, and in short meetings the group picks Okay. Run one meeting or 1,000, against the case where everyone knows everything.
- **The commons** — an agent-based fishing lake: Gordon–Schaefer fish, and boats that cooperate, defect or enforce, in a simplified model in the spirit of Sethi & Somanathan (1996). Under open access the stock falls to c/(p·q), where the profit is gone (Hardin). With monitoring, fines and clear boundaries, either enough enforcers make defecting unprofitable and the norm holds, or defection spreads and the stock collapses, depending on the starting mix and the cost of fining (Ostrom). The sliders cover three of Ostrom's eight design principles.

Live at <https://crowdlab.hellopsi.co.uk>. Everything runs in the browser. No build step, no server.

Visits are counted in the hellopsi.co.uk Google Analytics property (G-8FJ78GCLJC), only after the visitor allows analytics cookies. Each tab switch is sent as a `tab_view` event with `tab_id` and `tab_title`.

## Run locally

Any static server from the repo root, e.g.

```bash
python3 -m http.server 8000
```

then open <http://localhost:8000>. (Opening `index.html` directly from disk will not work: ES modules need a server.)

## Data

`data/lorenz2011.js` and `data/becker2017.js` are built from the papers' supplementary datasets by `data/prep_influence.py` (see its docstring for where to download them). Becker et al.'s dataset gives each person's neighbour averages but not the network; the script recovers the ties from those averages.

## Add a tab

1. Create `js/tabs/<id>.js` exporting `mount(el)`. Optionally export `unmount()` and `onKey(key)` (`R` is "new crowd" by convention).
2. Add one entry to `js/tabs/registry.js`, with its `refs`: they are listed as numbered sources at the foot of the tab.

3. Optionally export `story`, a guided walk-through: an array of steps, each pointing at part of the page, revealing panels as it goes, and optionally waiting for the reader to try something before moving on. The format is documented at the top of `js/lib/story.js`; `js/tabs/galton.js` has a full example. Stories start automatically unless the reader turns off "Guided stories" in the sidebar (or opens the page with `?guide=0`), and every tab with a story has a "Walk me through it" button.

Shared helpers (sliders, buttons, the little person figure, statistics) are in `js/lib/util.js`. Colours and type are CSS variables in `css/style.css`.

## Sources

- Galton, F. (1907). Vox populi. *Nature*, 75, 450–451. doi:10.1038/075450a0 — the 787 guesses are rebuilt from the percentiles in the article (see `data/galton1907.js`; the extreme tails are extrapolated).
- Page, S. E. (2007). Making the difference: Applying a logic of diversity. *Academy of Management Perspectives*, 21(4), 6–20.
- Kao, A. B., Miller, N., Torney, C., Hartnett, A., & Couzin, I. D. (2014). Collective learning and optimal consensus decisions in social animal groups. *PLoS Computational Biology*, 10(8), e1003762. doi:10.1371/journal.pcbi.1003762 — the model behind Group rewards I (two cues, majority rule, Rescorla–Wagner learning).
- Pescetelli, N., Rutherford, A., Rahwan, I., & Kao, A. B. (2025). Collective incentives improve group accuracy by reducing reliance on shared news sources. *Collective Intelligence*, 4(3). doi:10.1177/26339137251372605
- Lorenz, J., Rauhut, H., Schweitzer, F., & Helbing, D. (2011). How social influence can undermine the wisdom of crowd effect. *PNAS*, 108(22), 9020–9025. doi:10.1073/pnas.1008636108 — Dataset S1.
- Becker, J., Brackbill, D., & Centola, D. (2017). Network dynamics of social influence in the wisdom of crowds. *PNAS*, 114(26), E5070–E5076. doi:10.1073/pnas.1615978114 — Dataset S1.
- Golub, B., & Jackson, M. O. (2010). Naïve learning in social networks and the wisdom of crowds. *American Economic Journal: Microeconomics*, 2(1), 112–149. doi:10.1257/mic.2.1.112
- Bikhchandani, S., Hirshleifer, D., & Welch, I. (1992). A theory of fads, fashion, custom, and cultural change as informational cascades. *Journal of Political Economy*, 100(5), 992–1026. doi:10.1086/261849 — the model behind the cascades tab.
- Banerjee, A. V. (1992). A simple model of herd behavior. *Quarterly Journal of Economics*, 107(3), 797–817. doi:10.2307/2118364
- Anderson, L. R., & Holt, C. A. (1997). Information cascades in the laboratory. *American Economic Review*, 87(5), 847–862. — the game, played with students.
- Stasser, G., & Titus, W. (1985). Pooling of unshared information in group decision making: Biased information sampling during discussion. *Journal of Personality and Social Psychology*, 48(6), 1467–1478. doi:10.1037/0022-3514.48.6.1467
- Stasser, G., & Titus, W. (1987). Effects of information load and percentage of shared information on the dissemination of unshared information during group discussion. *Journal of Personality and Social Psychology*, 53(1), 81–93. doi:10.1037/0022-3514.53.1.81 — the sampling rule behind the hidden profiles tab (the toy model itself is ours).
- Stasser, G., & Titus, W. (2003). Hidden profiles: A brief history. *Psychological Inquiry*, 14(3–4), 304–313. doi:10.1080/1047840X.2003.9682897
- Hardin, G. (1968). The tragedy of the commons. *Science*, 162(3859), 1243–1248. doi:10.1126/science.162.3859.1243
- Gordon, H. S. (1954). The economic theory of a common-property resource: The fishery. *Journal of Political Economy*, 62(2), 124–142. doi:10.1086/257497
- Schaefer, M. B. (1954). Some aspects of the dynamics of populations important to the management of the commercial marine fisheries. *Bulletin of the Inter-American Tropical Tuna Commission*, 1(2), 27–56. Reprinted in *Bulletin of Mathematical Biology*, 53(1–2), 253–279 (1991), doi:10.1007/BF02464432
- Sethi, R., & Somanathan, E. (1996). The evolution of social norms in common property resource use. *American Economic Review*, 86(4), 766–788. — the commons tab is a simplified model in the spirit of this paper, not its equations.
- Ostrom, E. (1990). *Governing the Commons*. Cambridge University Press. doi:10.1017/CBO9780511807763 — the design principles.
- Ostrom, E., Gardner, R., & Walker, J. (1994). *Rules, Games, and Common-Pool Resources*. University of Michigan Press. doi:10.3998/mpub.9739
- Condorcet, M. de (1785). *Essai sur l'application de l'analyse à la probabilité des décisions rendues à la pluralité des voix*. <https://archive.org/details/essaisurlapplica00cond>
- Grofman, B., Owen, G., & Feld, S. L. (1983). Thirteen theorems in search of the truth. *Theory and Decision*, 15(3), 261–278. doi:10.1007/BF00125672
- Ladha, K. K. (1992). The Condorcet jury theorem, free speech, and correlated votes. *American Journal of Political Science*, 36(3), 617–634. doi:10.2307/2111584

Style inspired by Nicky Case's explorables.

## License

The code is open source under the MIT license (see `LICENSE`); contributions are welcome. The datasets in `data/` are rebuilt from the published sources cited above and remain those authors' work.
