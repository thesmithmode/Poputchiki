const COEFFICIENTS: [number, number, number][] = [
  [7, 9, 1.4],
  [9, 11, 1.15],
  [11, 15, 1.0],
  [15, 17, 1.15],
  [17, 19, 1.35],
  [19, 22, 1.0],
  [22, 24, 0.9],
  [0, 6, 0.9],
  [6, 7, 1.0],
];

function getCoefficient(hour: number): number {
  for (const [from, to, coeff] of COEFFICIENTS) {
    if (hour >= from && hour < to) return coeff;
  }
  return 1.0;
}

export function estimateEta(
  baseDurationS: number,
  departureHour: number,
): { minS: number; maxS: number } {
  const coeff = getCoefficient(departureHour);
  const adjusted = baseDurationS * coeff;
  return {
    minS: Math.round(adjusted * 0.9),
    maxS: Math.round(adjusted * 1.1),
  };
}

export function formatEtaRange(minS: number, maxS: number): string {
  const minMin = Math.ceil(minS / 60);
  const maxMin = Math.ceil(maxS / 60);
  if (minMin === maxMin) return `~${minMin} мин`;
  return `~${minMin}-${maxMin} мин`;
}
