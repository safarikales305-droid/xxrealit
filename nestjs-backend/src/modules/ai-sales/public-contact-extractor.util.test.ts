import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractEmailsFromHtml,
  extractPhonesFromHtml,
  normalizeCzechPhone,
  normalizeEmail,
} from './public-contact-extractor.util';

test('normalizeEmail rejects noreply and example.com', () => {
  assert.equal(normalizeEmail('info@example.com'), null);
  assert.equal(normalizeEmail('noreply@firma.cz'), null);
  assert.equal(normalizeEmail('info@firma.cz'), 'info@firma.cz');
});

test('extractEmailsFromHtml finds mailto on kontakt page', () => {
  const html = `<html><body><a href="mailto:info@realitypardubice.cz">Kontakt</a></body></html>`;
  const found = extractEmailsFromHtml(html, 'https://realitypardubice.cz/kontakt', 'realitypardubice.cz');
  assert.equal(found.length, 1);
  assert.equal(found[0].normalizedValue, 'info@realitypardubice.cz');
});

test('normalizeCzechPhone formats mobile number', () => {
  const p = normalizeCzechPhone('+420 601 234 567');
  assert.ok(p);
  assert.equal(p.normalized, '+420 601 234 567');
  assert.equal(p.kind, 'MOBILE');
});

test('extractPhonesFromHtml finds tel link', () => {
  const html = `<a href="tel:+420601234567">Volejte</a>`;
  const found = extractPhonesFromHtml(html, 'https://firma.cz/kontakt');
  assert.ok(found.length >= 1);
  assert.match(found[0].value, /\+420 601 234 567/);
});
