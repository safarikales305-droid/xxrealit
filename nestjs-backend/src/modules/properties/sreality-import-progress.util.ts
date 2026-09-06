export type SrealityImportJobStage =
  | 'QUEUED'
  | 'STARTING_BROWSER'
  | 'OPENING_PAGE'
  | 'PARSING_SOURCE'
  | 'READING_PROPERTY_DATA'
  | 'FINDING_AGENT'
  | 'OPENING_CONTACT'
  | 'FINDING_GALLERY'
  | 'LOADING_GALLERY'
  | 'CAPTURING_IMAGES'
  | 'UPLOADING_IMAGES'
  | 'PREPARING_PREVIEW'
  | 'DONE'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export type SrealityImportJobStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'LONG_RUNNING'
  | 'DONE'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export const STAGE_BASE_PROGRESS: Record<SrealityImportJobStage, number> = {
  QUEUED: 0,
  STARTING_BROWSER: 5,
  OPENING_PAGE: 10,
  PARSING_SOURCE: 20,
  READING_PROPERTY_DATA: 30,
  FINDING_AGENT: 40,
  OPENING_CONTACT: 50,
  FINDING_GALLERY: 60,
  LOADING_GALLERY: 65,
  CAPTURING_IMAGES: 70,
  UPLOADING_IMAGES: 90,
  PREPARING_PREVIEW: 97,
  DONE: 100,
  PARTIAL: 100,
  FAILED: 0,
  CANCELLED: 0,
};

export function imageCaptureProgress(processed: number, selected: number): number {
  if (selected <= 0) return STAGE_BASE_PROGRESS.CAPTURING_IMAGES;
  const ratio = Math.min(1, Math.max(0, processed / selected));
  return Math.round(70 + ratio * 20);
}

export function imageUploadProgress(imported: number, selected: number): number {
  if (selected <= 0) return STAGE_BASE_PROGRESS.UPLOADING_IMAGES;
  const ratio = Math.min(1, Math.max(0, imported / selected));
  return Math.round(90 + ratio * 6);
}

export function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    QUEUED: 'Ve frontě',
    STARTING_BROWSER: 'Spouštím browser',
    OPENING_PAGE: 'Otevírám stránku Sreality',
    PARSING_SOURCE: 'Parsuji zdroj',
    READING_PROPERTY_DATA: 'Načítám údaje inzerátu',
    FINDING_AGENT: 'Hledám makléře',
    OPENING_CONTACT: 'Otevírám kontakt',
    FINDING_GALLERY: 'Hledám galerii',
    LOADING_GALLERY: 'Načítám galerii',
    CAPTURING_IMAGES: 'Získávám fotografie',
    UPLOADING_IMAGES: 'Ukládám fotografie',
    PREPARING_PREVIEW: 'Připravuji náhled',
    DONE: 'Hotovo',
    PARTIAL: 'Dokončeno s upozorněním',
    FAILED: 'Selhalo',
    CANCELLED: 'Zrušeno',
  };
  return map[stage] ?? stage;
}

export function isTerminalStatus(status: string): boolean {
  return ['DONE', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(status);
}

export function isActiveStatus(status: string): boolean {
  return ['QUEUED', 'PROCESSING', 'LONG_RUNNING'].includes(status);
}

/** Stages that can be retried without full re-parse. */
export function retryStageResumePoint(stage: string): SrealityImportJobStage {
  if (stage === 'UPLOADING_IMAGES') return 'UPLOADING_IMAGES';
  if (['CAPTURING_IMAGES', 'LOADING_GALLERY', 'FINDING_GALLERY'].includes(stage)) {
    return 'CAPTURING_IMAGES';
  }
  return 'PARSING_SOURCE';
}
