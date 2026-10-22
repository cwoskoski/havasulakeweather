// Full-pool reference (elevation ft / live-storage capacity acre-ft) for a coarse "% full".
// Approximate published capacities — for the % readout only, not authoritative accounting.
// Shared by /api/water (water.js) and the /research lake charts (research.js, HLW-058).
export const POOL = {
  powell: { fullElevFt: 3700, capacityAf: 24322000 },
  mead:   { fullElevFt: 1229, capacityAf: 26120000 },
  mohave: { fullElevFt: 647,  capacityAf: 1810000 },
  havasu: { fullElevFt: 450,  capacityAf: 619000 },
};

export function pctFull(storageAf, capacityAf) {
  return storageAf != null && capacityAf ? Math.round((100 * storageAf) / capacityAf) : null;
}
