// The list of tabs in the side menu, in order.
//
// To add a tab: create js/tabs/<id>.js exporting `mount(el)` (and optionally
// `unmount()` and `onKey(key)`), then add one entry here. Nothing else changes.
// `refs` are listed as numbered sources at the foot of the tab: `cite` is HTML,
// `url` is where the link goes (a doi.org link where there is one).
export const TABS = [
  {
    id: "galton",
    title: "Galton's ox",
    subtitle: "Noise, and the size of the crowd",
    load: () => import("./galton.js"),
    refs: [
      { cite: "Galton, F. (1907). Vox populi. <i>Nature</i>, 75, 450–451.", url: "https://doi.org/10.1038/075450a0" },
    ],
  },
  {
    id: "condorcet",
    title: "Condorcet's jury",
    subtitle: "Majorities, and competence",
    load: () => import("./condorcet.js"),
    refs: [
      { cite: "Condorcet, M. de (1785). <i>Essai sur l'application de l'analyse à la probabilité des décisions rendues à la pluralité des voix</i>. Paris: Imprimerie royale.", url: "https://archive.org/details/essaisurlapplica00cond" },
      { cite: "Grofman, B., Owen, G., &amp; Feld, S. L. (1983). Thirteen theorems in search of the truth. <i>Theory and Decision</i>, 15(3), 261–278.", url: "https://doi.org/10.1007/BF00125672" },
      { cite: "Ladha, K. K. (1992). The Condorcet jury theorem, free speech, and correlated votes. <i>American Journal of Political Science</i>, 36(3), 617–634.", url: "https://doi.org/10.2307/2111584" },
    ],
  },
  {
    id: "page",
    title: "Page's difference",
    subtitle: "Diversity, and bracketing the truth",
    load: () => import("./page.js"),
    refs: [
      { cite: "Page, S. E. (2007). Making the difference: Applying a logic of diversity. <i>Academy of Management Perspectives</i>, 21(4), 6–20.", url: "https://doi.org/10.5465/amp.2007.27895335" },
    ],
  },
  {
    id: "incentives",
    title: "Collective incentives",
    subtitle: "Paid for me, or for the group?",
    load: () => import("./incentives.js"),
    refs: [
      { cite: "Kao, A. B., Miller, N., Torney, C., Hartnett, A., &amp; Couzin, I. D. (2014). Collective learning and optimal consensus decisions in social animal groups. <i>PLoS Computational Biology</i>, 10(8), e1003762. The model this tab is built on.", url: "https://doi.org/10.1371/journal.pcbi.1003762" },
      { cite: "Pescetelli, N., Rutherford, A., Rahwan, I., &amp; Kao, A. B. (2025). Collective incentives improve group accuracy by reducing reliance on shared news sources. <i>Collective Intelligence</i>, 4(3).", url: "https://doi.org/10.1177/26339137251372605" },
    ],
  },
];
