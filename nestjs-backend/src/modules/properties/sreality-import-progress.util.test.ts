import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  imageCaptureProgress,
  imageUploadProgress,
  STAGE_BASE_PROGRESS,
} from './sreality-import-progress.util';

describe('sreality-import-progress.util', () => {
  it('maps capture progress between 70 and 90', () => {
    assert.equal(imageCaptureProgress(0, 17), 70);
    assert.equal(imageCaptureProgress(8, 17), 79);
    assert.equal(imageCaptureProgress(17, 17), 90);
  });

  it('maps upload progress between 90 and 96', () => {
    assert.equal(imageUploadProgress(0, 17), 90);
    assert.equal(imageUploadProgress(10, 17), 94);
    assert.equal(imageUploadProgress(17, 17), 96);
  });

  it('has monotonic stage base progress', () => {
    assert.ok(STAGE_BASE_PROGRESS.OPENING_PAGE > STAGE_BASE_PROGRESS.STARTING_BROWSER);
    assert.ok(STAGE_BASE_PROGRESS.CAPTURING_IMAGES > STAGE_BASE_PROGRESS.LOADING_GALLERY);
    assert.equal(STAGE_BASE_PROGRESS.DONE, 100);
  });
});
