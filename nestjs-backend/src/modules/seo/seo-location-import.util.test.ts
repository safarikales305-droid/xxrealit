import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSafeRemoteUrl,
  detectFieldMapping,
  sanitizeXmlInput,
  assertAllowedUpload,
} from './seo-location-import.util';
import { parseCsvBuffer, parseJsonBuffer } from './seo-location-import.parser';

test('assertSafeRemoteUrl blocks localhost', () => {
  assert.throws(() => assertSafeRemoteUrl('http://localhost/data.csv'), /zakázaný/);
  assert.throws(() => assertSafeRemoteUrl('http://127.0.0.1/data.csv'), /zakázaný/);
});

test('assertSafeRemoteUrl blocks private IP', () => {
  assert.throws(() => assertSafeRemoteUrl('http://192.168.1.1/data.csv'), /Privátní/);
});

test('assertSafeRemoteUrl allows public https', () => {
  const url = assertSafeRemoteUrl('https://www.cuzk.cz/vymenny_format/csv/obce.csv');
  assert.equal(url.hostname, 'www.cuzk.cz');
});

test('detectFieldMapping maps CSU columns', () => {
  const mapping = detectFieldMapping(['KOD_OBCE', 'NAZEV_OBCE', 'KOD_OKRESU', 'POCET_OBYVATEL']);
  assert.equal(mapping['KOD_OBCE'], 'officialCode');
  assert.equal(mapping['NAZEV_OBCE'], 'name');
  assert.equal(mapping['POCET_OBYVATEL'], 'population');
});

test('sanitizeXmlInput strips DOCTYPE and ENTITY', () => {
  const out = sanitizeXmlInput('<!DOCTYPE foo [<!ENTITY xxe "hack">]><root/>');
  assert.ok(!out.includes('<!DOCTYPE'));
  assert.ok(!out.includes('<!ENTITY'));
});

test('parseCsvBuffer reads semicolon CSV', () => {
  const buf = Buffer.from('KOD_OBCE;NAZEV_OBCE\n500011;Praha 1\n', 'utf-8');
  const parsed = parseCsvBuffer(buf, 'utf-8', ';');
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]!['KOD_OBCE'], '500011');
});

test('parseJsonBuffer reads array', () => {
  const buf = Buffer.from(JSON.stringify([{ officialCode: '1', name: 'Test' }]), 'utf-8');
  const parsed = parseJsonBuffer(buf);
  assert.equal(parsed.rows.length, 1);
});

test('assertAllowedUpload rejects exe', () => {
  assert.throws(() => assertAllowedUpload('virus.exe', 'application/octet-stream', 100), /přípona/);
});

test('assertAllowedUpload accepts csv', () => {
  assert.doesNotThrow(() => assertAllowedUpload('obce.csv', 'text/csv', 1000));
});
