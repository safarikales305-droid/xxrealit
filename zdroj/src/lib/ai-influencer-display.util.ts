/** Minimální tvar jobu pro bezpečné zobrazení názvu (legacy + property jobs). */
export type AiInfluencerJobTitleSource = {
  captionTitle?: string | null;
  selectedHook?: string | null;
  article?: { title?: string | null } | null;
  property?: { title?: string | null } | null;
};

export function resolveAiInfluencerJobTitle(
  job: AiInfluencerJobTitleSource,
  fallback = 'Bez názvu',
): string {
  const title =
    job.article?.title?.trim() ||
    job.property?.title?.trim() ||
    job.captionTitle?.trim() ||
    job.selectedHook?.trim();
  return title || fallback;
}

export function resolveAiInfluencerJobSubtitle(job: AiInfluencerJobTitleSource): string | null {
  if (job.article) return null;
  if (job.property) return 'Inzerát';
  return 'Zdrojový článek již není dostupný';
}
