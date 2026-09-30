// The list of tabs in the side menu, in order.
//
// To add a tab: create js/tabs/<id>.js exporting `mount(el)` (and optionally
// `unmount()` and `onKey(key)`), then add one entry here. Nothing else changes.
export const TABS = [
  {
    id: "galton",
    title: "Galton's ox",
    subtitle: "Noise, and the size of the crowd",
    load: () => import("./galton.js"),
  },
  {
    id: "condorcet",
    title: "Condorcet's jury",
    subtitle: "Majorities, and competence",
    load: () => import("./condorcet.js"),
  },
  {
    id: "page",
    title: "Page's crowd",
    subtitle: "Diversity, and bracketing the truth",
    load: () => import("./page.js"),
  },
];
