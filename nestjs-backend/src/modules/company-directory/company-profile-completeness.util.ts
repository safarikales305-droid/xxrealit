type CompletenessInput = {
  aresSource?: boolean;
  email?: string | null;
  verifiedBusinessEmail?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  firstPostCreatedAt?: Date | null;
  photosCount?: number;
};

export function computeProfileCompletenessScore(input: CompletenessInput): number {
  let score = 0;
  if (input.aresSource) score += 20;
  if (input.verifiedBusinessEmail?.trim() || input.email?.trim()) score += 10;
  if (input.phone?.trim()) score += 10;
  if (input.logoUrl?.trim()) score += 10;
  if (input.description?.trim() && input.description.trim().length >= 40) score += 15;
  if ((input.photosCount ?? 0) > 0) score += 15;
  if (input.firstPostCreatedAt) score += 20;
  return Math.min(100, score);
}
