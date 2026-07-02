export function computeDisplayedValue(input: {
  realValue: number;
  multiplier: number;
  manualValue: number | null;
}): number {
  if (input.manualValue != null && Number.isFinite(input.manualValue)) {
    return Math.round(input.manualValue);
  }
  return Math.round(input.realValue * input.multiplier);
}
