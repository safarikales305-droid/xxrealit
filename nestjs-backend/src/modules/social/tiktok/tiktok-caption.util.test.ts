import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildTikTokCaption,
  buildTikTokHashtags,
  buildTikTokPostText,
} from './tiktok-caption.util';

test('buildTikTokCaption formats sale house in Brno', () => {
  assert.equal(
    buildTikTokCaption({ offerType: 'prodej', propertyType: 'dům', city: 'Brno' }),
    'Prodej domu – Brno | XXREALIT',
  );
});

test('buildTikTokHashtags adds rental and flat tags', () => {
  const tags = buildTikTokHashtags({ offerType: 'pronájem', propertyType: 'byt' });
  assert.match(tags, /#pronajem/);
  assert.match(tags, /#byt/);
  assert.match(tags, /#xxrealit/);
});

test('buildTikTokPostText joins caption and hashtags', () => {
  const text = buildTikTokPostText('Prodej bytu – Praha | XXREALIT', '#xxrealit #byt');
  assert.match(text, /XXREALIT/);
  assert.match(text, /#byt/);
});
