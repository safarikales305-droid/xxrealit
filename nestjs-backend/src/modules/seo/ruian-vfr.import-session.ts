export type RuianVfrLogEntry = {
  at: string;
  level: 'info' | 'warn' | 'error';
  step: string;
  message: string;
  progressPct: number;
  meta?: Record<string, unknown>;
};

export type RuianVfrImportPhase =
  | 'start'
  | 'discover'
  | 'verify'
  | 'download'
  | 'extract'
  | 'scan_xml'
  | 'parse_start'
  | 'parse_done'
  | 'parse_kraje'
  | 'parse_okresy'
  | 'parse_orp'
  | 'parse_obce'
  | 'parse_casti'
  | 'parse_katastry'
  | 'parse_ulice'
  | 'parse_adresy'
  | 'save_db'
  | 'done'
  | 'error';

const PHASE_PROGRESS: Record<RuianVfrImportPhase, number> = {
  start: 0,
  discover: 5,
  verify: 10,
  download: 15,
  extract: 20,
  scan_xml: 22,
  parse_start: 28,
  parse_done: 74,
  parse_kraje: 30,
  parse_okresy: 35,
  parse_orp: 40,
  parse_obce: 50,
  parse_casti: 60,
  parse_katastry: 65,
  parse_ulice: 70,
  parse_adresy: 75,
  save_db: 85,
  done: 100,
  error: 0,
};

const PHASE_LABELS: Record<RuianVfrImportPhase, string> = {
  start: 'START IMPORT',
  discover: 'Načítám stavový soubor...',
  verify: 'Soubor nalezen',
  download: 'Stahuji...',
  extract: 'Rozbaluji archiv...',
  scan_xml: 'Vyhledávám XML...',
  parse_start: 'Začínám parser...',
  parse_done: 'Parser dokončen',
  parse_kraje: 'Načítám kraje...',
  parse_okresy: 'Import okresů...',
  parse_orp: 'Načítám ORP a POÚ...',
  parse_obce: 'Import obcí...',
  parse_casti: 'Načítám části obcí...',
  parse_katastry: 'Načítám katastrální území...',
  parse_ulice: 'Import ulic...',
  parse_adresy: 'Načítám adresní místa...',
  save_db: 'Začínám ukládat do DB',
  done: 'Hotovo',
  error: 'Chyba importu',
};

export class RuianVfrImportSession {
  runId: string | null;
  readonly startedAt = new Date().toISOString();
  readonly entries: RuianVfrLogEntry[] = [];
  currentPhase: RuianVfrImportPhase = 'start';
  progressPct = 0;
  currentStep = PHASE_LABELS.start;

  constructor(runId: string | null = null) {
    this.runId = runId;
    this.log('start', 'START IMPORT');
  }

  log(
    phase: RuianVfrImportPhase,
    message?: string,
    level: RuianVfrLogEntry['level'] = 'info',
    meta?: Record<string, unknown>,
  ) {
    this.currentPhase = phase;
    this.progressPct = PHASE_PROGRESS[phase] ?? this.progressPct;
    this.currentStep = message ?? PHASE_LABELS[phase];
    const entry: RuianVfrLogEntry = {
      at: new Date().toISOString(),
      level,
      step: phase,
      message: this.currentStep,
      progressPct: this.progressPct,
      meta,
    };
    this.entries.push(entry);
    return entry;
  }

  setProgress(pct: number, message: string) {
    this.progressPct = Math.min(99, Math.max(this.progressPct, pct));
    this.currentStep = message;
    this.entries.push({
      at: new Date().toISOString(),
      level: 'info',
      step: this.currentPhase,
      message,
      progressPct: this.progressPct,
    });
  }

  logError(err: unknown, phase: RuianVfrImportPhase = 'error') {
    const msg = err instanceof Error ? err.message : String(err);
    return this.log(phase, msg, 'error');
  }

  toJson(extra?: Record<string, unknown>) {
    return {
      entries: this.entries,
      currentPhase: this.currentPhase,
      currentStep: this.currentStep,
      progressPct: this.progressPct,
      startedAt: this.startedAt,
      ...extra,
    };
  }

  snapshot() {
    return {
      runId: this.runId,
      currentPhase: this.currentPhase,
      currentStep: this.currentStep,
      progressPct: this.progressPct,
      entries: [...this.entries],
      startedAt: this.startedAt,
    };
  }
}

export function mapElementToPhase(elementType: string): RuianVfrImportPhase | null {
  switch (elementType) {
    case 'Vusc':
    case 'Kraj':
      return 'parse_kraje';
    case 'Okres':
      return 'parse_okresy';
    case 'Orp':
    case 'POU':
      return 'parse_orp';
    case 'Obec':
      return 'parse_obce';
    case 'CastObce':
    case 'Momc':
    case 'MestskaCast':
      return 'parse_casti';
    case 'KatastralniUzemi':
      return 'parse_katastry';
    case 'Ulice':
      return 'parse_ulice';
    case 'AdresniMisto':
      return 'parse_adresy';
    default:
      return null;
  }
}
