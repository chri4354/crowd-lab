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
    title: "Group rewards I",
    subtitle: "Should you reward correct people or groups?",
    load: () => import("./incentives.js"),
    refs: [
      { cite: "Kao, A. B., Miller, N., Torney, C., Hartnett, A., &amp; Couzin, I. D. (2014). Collective learning and optimal consensus decisions in social animal groups. <i>PLoS Computational Biology</i>, 10(8), e1003762. The model this tab is built on.", url: "https://doi.org/10.1371/journal.pcbi.1003762" },
      { cite: "Pescetelli, N., Rutherford, A., Rahwan, I., &amp; Kao, A. B. (2025). Collective incentives improve group accuracy by reducing reliance on shared news sources. <i>Collective Intelligence</i>, 4(3).", url: "https://doi.org/10.1177/26339137251372605" },
    ],
  },
  {
    id: "estimates",
    title: "Group rewards II",
    subtitle: "The same, with numbers not choices",
    load: () => import("./estimates.js"),
    refs: [
      { cite: "Pescetelli, N. (2026). Collective incentives that promote collective intelligence. Submitted. The continuous model this tab is built on." },
      { cite: "Pescetelli, N., Rutherford, A., Rahwan, I., &amp; Kao, A. B. (2025). Collective incentives improve group accuracy by reducing reliance on shared news sources. <i>Collective Intelligence</i>, 4(3). The question this tab asks.", url: "https://doi.org/10.1177/26339137251372605" },
      { cite: "Morris, S., &amp; Shin, H. S. (2002). Social value of public information. <i>American Economic Review</i>, 92(5), 1521–1534. The weight on private information that is best for the average.", url: "https://doi.org/10.1257/000282802762024610" },
    ],
  },
  {
    id: "lorenz",
    title: "Lorenz's influence",
    subtitle: "Seeing the others' guesses",
    load: () => import("./lorenz.js"),
    refs: [
      { cite: "Lorenz, J., Rauhut, H., Schweitzer, F., &amp; Helbing, D. (2011). How social influence can undermine the wisdom of crowd effect. <i>Proceedings of the National Academy of Sciences</i>, 108(22), 9020–9025. The data are the paper's Dataset S1.", url: "https://doi.org/10.1073/pnas.1008636108" },
    ],
  },
  {
    id: "becker",
    title: "Becker's networks",
    subtitle: "Who listens to whom",
    load: () => import("./becker.js"),
    refs: [
      { cite: "Becker, J., Brackbill, D., &amp; Centola, D. (2017). Network dynamics of social influence in the wisdom of crowds. <i>Proceedings of the National Academy of Sciences</i>, 114(26), E5070–E5076. The data are the paper's Dataset S1; the network ties are recovered from it.", url: "https://doi.org/10.1073/pnas.1615978114" },
      { cite: "Golub, B., &amp; Jackson, M. O. (2010). Naïve learning in social networks and the wisdom of crowds. <i>American Economic Journal: Microeconomics</i>, 2(1), 112–149. Why the average ends up weighted by who is listened to.", url: "https://doi.org/10.1257/mic.2.1.112" },
    ],
  },
  {
    id: "cascades",
    title: "Information cascades",
    subtitle: "Following the crowd into a restaurant",
    load: () => import("./cascades.js"),
    refs: [
      { cite: "Bikhchandani, S., Hirshleifer, D., &amp; Welch, I. (1992). A theory of fads, fashion, custom, and cultural change as informational cascades. <i>Journal of Political Economy</i>, 100(5), 992–1026. The model this tab is built on.", url: "https://doi.org/10.1086/261849" },
      { cite: "Banerjee, A. V. (1992). A simple model of herd behavior. <i>Quarterly Journal of Economics</i>, 107(3), 797–817. The two restaurants, and the same result, found independently.", url: "https://doi.org/10.2307/2118364" },
      { cite: "Anderson, L. R., &amp; Holt, C. A. (1997). Information cascades in the laboratory. <i>American Economic Review</i>, 87(5), 847–862. The game, played with students.", url: "https://ideas.repec.org/a/aea/aecrev/v87y1997i5p847-62.html" },
    ],
  },
];
