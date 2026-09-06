import type { SrealityImageCaptureMethod } from './sreality-browser-media.util';

export type ImageCaptureStepStatus = 'PASS' | 'FAIL' | 'NOT_REACHED' | 'SKIPPED';

export type SrealityImageCaptureAttempt = {
  index: number;
  total: number;
  sourceUrl: string;
  directHttp: ImageCaptureStepStatus;
  directHttpStatus?: number | null;
  gallery?: ImageCaptureStepStatus;
  activeImageVisible?: boolean;
  activeImageDimensions?: string | null;
  browserResponse: ImageCaptureStepStatus;
  browserContext: ImageCaptureStepStatus;
  browserContextStatus?: number | null;
  domImage: ImageCaptureStepStatus;
  domNaturalSize?: string | null;
  elementScreenshot: ImageCaptureStepStatus;
  sharp?: ImageCaptureStepStatus;
  storage: ImageCaptureStepStatus;
  captureMethod?: SrealityImageCaptureMethod;
  errorCode?: string | null;
  errorMessage?: string | null;
  bytes?: number | null;
  galleryOpen?: boolean;
};

export function formatImageCaptureAttemptLog(attempt: SrealityImageCaptureAttempt): string {
  const lines = [
    `IMAGE ${attempt.index}/${attempt.total}`,
    `DIRECT_HTTP: ${attempt.directHttpStatus ?? '—'} (${attempt.directHttp})`,
    `GALLERY: ${attempt.gallery ?? (attempt.galleryOpen ? 'OPEN' : 'FAIL')}`,
    `ACTIVE_IMAGE: ${attempt.activeImageVisible ? 'VISIBLE' : 'HIDDEN'}`,
    `NATURAL_SIZE: ${attempt.activeImageDimensions ?? attempt.domNaturalSize ?? '—'}`,
    `BROWSER_RESPONSE: ${attempt.browserResponse}`,
    `BROWSER_CONTEXT: ${attempt.browserContextStatus ?? '—'} (${attempt.browserContext})`,
    `DOM_CAPTURE: ${attempt.domImage}`,
    `ELEMENT_SCREENSHOT: ${attempt.elementScreenshot}${attempt.bytes ? ` ${Math.round(attempt.bytes / 1024)}KB` : ''}`,
    `SHARP: ${attempt.sharp ?? (attempt.storage === 'PASS' ? 'PASS' : 'NOT_REACHED')}`,
    `STORAGE: ${attempt.storage}`,
  ];
  if (attempt.errorCode) {
    lines.push(`ERROR: ${attempt.errorCode}${attempt.errorMessage ? ` — ${attempt.errorMessage}` : ''}`);
  }
  return lines.join('\n');
}

export function shouldTripImageCaptureCircuitBreaker(
  attempts: SrealityImageCaptureAttempt[],
  threshold = 3,
): boolean {
  if (attempts.length < threshold) return false;
  const recent = attempts.slice(-threshold);
  return recent.every(
    (a) =>
      a.storage !== 'PASS' &&
      a.elementScreenshot !== 'PASS' &&
      a.browserResponse !== 'PASS' &&
      a.browserContext !== 'PASS' &&
      a.domImage !== 'PASS',
  );
}

export const IMAGE_CAPTURE_ERROR_CODES = {
  DIRECT_HTTP_UNAUTHORIZED: 'IMAGE_DIRECT_HTTP_UNAUTHORIZED',
  BROWSER_RESPONSE_NOT_FOUND: 'IMAGE_BROWSER_RESPONSE_NOT_FOUND',
  BROWSER_CONTEXT_FAILED: 'IMAGE_BROWSER_CONTEXT_FAILED',
  DOM_NOT_LOADED: 'IMAGE_DOM_NOT_LOADED',
  ELEMENT_SCREENSHOT_FAILED: 'IMAGE_ELEMENT_SCREENSHOT_FAILED',
  GALLERY_NOT_OPEN: 'IMAGE_GALLERY_NOT_OPEN',
  GALLERY_NAVIGATION_FAILED: 'IMAGE_GALLERY_NAVIGATION_FAILED',
  CAPTURE_SYSTEM_FAILURE: 'IMAGE_CAPTURE_SYSTEM_FAILURE',
  STORAGE_UPLOAD_FAILED: 'IMAGE_STORAGE_UPLOAD_FAILED',
} as const;
