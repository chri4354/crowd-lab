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
    subtitle: "Should you reward correct people or correct groups?",
    load: () => import("./incentives.js"),
    refs: [
      { cite: "Kao, A. B., Miller, N., Torney, C., Hartnett, A., &amp; Couzin, I. D. (2014). Collective learning and optimal consensus decisions in social animal groups. <i>PLoS Computational Biology</i>, 10(8), e1003762. The model this tab is built on.", url: "https://doi.org/10.1371/journal.pcbi.1003762" },
      { cite: "Pescetelli, N., Rutherford, A., Rahwan, I., &amp; Kao, A. B. (2025). Collective incentives improve group accuracy by reducing reliance on shared news sources. <i>Collective Intelligence</i>, 4(3).", url: "https://doi.org/10.1177/26339137251372605" },
    ],
  },
  {
    id: "estimates",
    title: "Group rewards II",
    subtitle: "Should you reward correct people or correct groups?",
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
  {
    id: "hiddenprofile",
    title: "Hidden profiles",
    subtitle: "What gets said in a meeting",
    load: () => import("./hiddenprofile.js"),
    refs: [
      { cite: "Stasser, G., &amp; Titus, W. (1985). Pooling of unshared information in group decision making: Biased information sampling during discussion. <i>Journal of Personality and Social Psychology</i>, 48(6), 1467–1478.", url: "https://doi.org/10.1037/0022-3514.48.6.1467" },
      { cite: "Stasser, G., &amp; Titus, W. (1987). Effects of information load and percentage of shared information on the dissemination of unshared information during group discussion. <i>Journal of Personality and Social Psychology</i>, 53(1), 81–93. The sampling rule this tab is built on.", url: "https://doi.org/10.1037/0022-3514.53.1.81" },
      { cite: "Stasser, G., &amp; Titus, W. (2003). Hidden profiles: A brief history. <i>Psychological Inquiry</i>, 14(3–4), 304–313.", url: "https://doi.org/10.1080/1047840X.2003.9682897" },
    ],
  },
  {
    id: "commons",
    title: "The commons",
    subtitle: "Hardin's tragedy, Ostrom's rules",
    load: () => import("./commons.js"),
    refs: [
      { cite: "Hardin, G. (1968). The tragedy of the commons. <i>Science</i>, 162(3859), 1243–1248.", url: "https://doi.org/10.1126/science.162.3859.1243" },
      { cite: "Gordon, H. S. (1954). The economic theory of a common-property resource: The fishery. <i>Journal of Political Economy</i>, 62(2), 124–142. Open access, and the stock where the profit is gone.", url: "https://doi.org/10.1086/257497" },
      { cite: "Schaefer, M. B. (1954). Some aspects of the dynamics of populations important to the management of the commercial marine fisheries. <i>Bulletin of the Inter-American Tropical Tuna Commission</i>, 1(2), 27–56. Reprinted in <i>Bulletin of Mathematical Biology</i>, 53(1–2), 253–279 (1991); the link is to the reprint.", url: "https://doi.org/10.1007/BF02464432" },
      { cite: "Sethi, R., &amp; Somanathan, E. (1996). The evolution of social norms in common property resource use. <i>American Economic Review</i>, 86(4), 766–788. The model this tab simplifies: the boats here are a simplified model in the spirit of this paper, not its equations.", url: "https://ideas.repec.org/a/aea/aecrev/v86y1996i4p766-88.html" },
      { cite: "Ostrom, E. (1990). <i>Governing the Commons: The Evolution of Institutions for Collective Action</i>. Cambridge University Press. The design principles.", url: "https://doi.org/10.1017/CBO9780511807763" },
      { cite: "Ostrom, E., Gardner, R., &amp; Walker, J. (1994). <i>Rules, Games, and Common-Pool Resources</i>. University of Michigan Press.", url: "https://doi.org/10.3998/mpub.9739" },
    ],
  },
  {
    id: "twoheads",
    title: "Two heads",
    subtitle: "When confidence counts",
    load: () => import("./twoheads.js"),
    refs: [
      { cite: "Bahrami, B., Olsen, K., Latham, P. E., Roepstorff, A., Rees, G., &amp; Frith, C. D. (2010). Optimally interacting minds. <i>Science</i>, 329(5995), 1081–1085. The four models, and the real pairs' fitted line.", url: "https://doi.org/10.1126/science.1185718" },
      { cite: "Ernst, M. O., &amp; Banks, M. S. (2002). Humans integrate visual and haptic information in a statistically optimal fashion. <i>Nature</i>, 415(6870), 429–433. Bayes inside one head.", url: "https://doi.org/10.1038/415429a" },
      { cite: "Mahmoodi, A., Bang, D., Olsen, K., Zhao, Y. A., Shi, Z., Broberg, K., … Bahrami, B. (2015). Equality bias impairs collective decision-making across cultures. <i>PNAS</i>, 112(12), 3835–3840.", url: "https://doi.org/10.1073/pnas.1421692112" },
      { cite: "Pescetelli, N., &amp; Yeung, N. (2021). The role of decision confidence in advice-taking and trust formation. <i>Journal of Experimental Psychology: General</i>, 150(3), 507–526. The dots task, and learning whom to trust without feedback.", url: "https://doi.org/10.1037/xge0000960" },
    ],
  },
];
