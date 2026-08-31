/**
 * Axis ticks on round numbers — a data-derived domain gives ticks like "€472.1M".
 * Picks the 1/2/2.5/5 × 10ⁿ step that covers the data most tightly.
 */
const STEPS = [1, 2, 2.5, 5, 10];
const DIVISIONS = [4, 5, 6];
const HEADROOM = 1.02;

export function roundTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const target = max * HEADROOM;
  let best: { step: number; divisions: number } | null = null;

  for (const divisions of DIVISIONS) {
    const magnitude = 10 ** Math.floor(Math.log10(target / divisions));
    const step = STEPS.map((factor) => factor * magnitude).find(
      (candidate) => candidate * divisions >= target,
    );
    // Keep the combination whose top tick sits closest above the data.
    if (step && (best === null || step * divisions < best.step * best.divisions)) {
      best = { step, divisions };
    }
  }

  const { step, divisions } = best ?? { step: target / 4, divisions: 4 };
  return Array.from({ length: divisions + 1 }, (_, index) => index * step);
}

/** The domain matching `roundTicks`, so the top tick sits on the plot's edge. */
export function roundDomain(max: number): [number, number] {
  const ticks = roundTicks(max);
  return [0, ticks[ticks.length - 1]];
}
