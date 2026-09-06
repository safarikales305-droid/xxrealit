import assert from 'node:assert/strict';
import {
  formatImageCaptureAttemptLog,
  shouldTripImageCaptureCircuitBreaker,
} from './sreality-image-capture.pipeline';

assert.match(
  formatImageCaptureAttemptLog({
    index: 1,
    total: 17,
    sourceUrl: 'https://d18-a.sdn.cz/example.jpg',
    directHttp: 'SKIPPED',
    directHttpStatus: 401,
    browserResponse: 'FAIL',
    browserContext: 'FAIL',
    browserContextStatus: 401,
    domImage: 'FAIL',
    elementScreenshot: 'PASS',
    storage: 'PASS',
    bytes: 442_000,
    galleryOpen: true,
    activeImageVisible: true,
    activeImageDimensions: '1600x1067',
  }),
  /ELEMENT_SCREENSHOT: PASS/,
);

assert.equal(
  shouldTripImageCaptureCircuitBreaker([
    {
      index: 1,
      total: 17,
      sourceUrl: 'a',
      directHttp: 'SKIPPED',
      browserResponse: 'FAIL',
      browserContext: 'FAIL',
      domImage: 'FAIL',
      elementScreenshot: 'FAIL',
      storage: 'FAIL',
    },
    {
      index: 2,
      total: 17,
      sourceUrl: 'b',
      directHttp: 'SKIPPED',
      browserResponse: 'FAIL',
      browserContext: 'FAIL',
      domImage: 'FAIL',
      elementScreenshot: 'FAIL',
      storage: 'FAIL',
    },
    {
      index: 3,
      total: 17,
      sourceUrl: 'c',
      directHttp: 'SKIPPED',
      browserResponse: 'FAIL',
      browserContext: 'FAIL',
      domImage: 'FAIL',
      elementScreenshot: 'FAIL',
      storage: 'FAIL',
    },
  ]),
  true,
);

console.log('sreality-image-capture.pipeline tests PASS');
