/** Odhad nákladů v CZK podle tokenů (konzervativní aproximace). */
export function estimateCostCzk(inputTokens: number, outputTokens: number, model: string): number {
  const m = model.toLowerCase();
  let inputPer1k = 0.05;
  let outputPer1k = 0.15;
  if (m.includes('gpt-4.1') && !m.includes('mini')) {
    inputPer1k = 0.5;
    outputPer1k = 1.5;
  } else if (m.includes('mini') || m.includes('nano')) {
    inputPer1k = 0.02;
    outputPer1k = 0.06;
  }
  const usd = (inputTokens / 1000) * inputPer1k + (outputTokens / 1000) * outputPer1k;
  return Math.round(usd * 24 * 100) / 100;
}
