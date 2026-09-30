// Galton, F. (1907). Vox populi. Nature, 75, 450–451. doi:10.1038/075450a0
//
// Galton published the 787 estimates of the dressed weight of an ox as
// percentiles (5th to 95th), not as raw guesses. The table below is copied
// from the article. Note: the 90th percentile is printed as 1267 lb but its
// deviation as +52; 1267 − 1207 = 60, so the deviation is the misprint and
// 1267 is used here.
//
// The 0th and 100th points are NOT Galton's: they extend the tails by the
// same slope as the outermost published intervals, so that the reconstructed
// crowd has plausible extremes. The tails are clearly marked in the app.

export const TRUE_WEIGHT = 1198; // lb, "the dressed weight proved to be 1198 lbs."
export const N_ESTIMATES = 787;

export const PERCENTILES = [
  [5, 1074], [10, 1109], [15, 1126], [20, 1148], [25, 1162], [30, 1174],
  [35, 1181], [40, 1188], [45, 1197], [50, 1207], [55, 1214], [60, 1219],
  [65, 1225], [70, 1230], [75, 1236], [80, 1243], [85, 1254], [90, 1267],
  [95, 1293],
];

// Extrapolated tails (not in Galton): 0th and 100th.
const LO = [0, 1074 - (1109 - 1074)];   // 1039
const HI = [100, 1293 + (1293 - 1267)]; // 1319

// A reconstructed crowd of 787 guesses: guess i sits at the quantile
// (i + 0.5) / 787 of the piecewise-linear distribution through the points.
export function reconstructCrowd() {
  const pts = [LO, ...PERCENTILES, HI];
  const out = [];
  for (let i = 0; i < N_ESTIMATES; i++) {
    const q = ((i + 0.5) / N_ESTIMATES) * 100;
    let k = 0;
    while (k < pts.length - 2 && pts[k + 1][0] < q) k++;
    const [q0, v0] = pts[k], [q1, v1] = pts[k + 1];
    out.push(Math.round(v0 + ((q - q0) / (q1 - q0)) * (v1 - v0)));
  }
  return out;
}
