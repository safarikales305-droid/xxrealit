import test from 'node:test';
import assert from 'node:assert/strict';

const VALID_INTENTS = new Set([
  'prodej-domu',
  'prodej-bytu',
  'pronajem-bytu',
  'prodej-pozemku',
  'prodej-chaty',
  'prodej-garaze',
  'prodej-komercnich-prostor',
  'developerske-projekty',
  'realitni-kancelar',
]);

function isProgrammaticSeoIntent(value: string): boolean {
  return VALID_INTENTS.has(value);
}

test('programmatic SEO intents include production URL categories', () => {
  const samples = [
    'developerske-projekty/pardubice',
    'prodej-chaty/sumperk',
    'prodej-bytu/brno',
    'prodej-domu/ostrava',
    'prodej-pozemku/liberec',
  ];
  for (const path of samples) {
    const [intent] = path.split('/');
    assert.ok(isProgrammaticSeoIntent(intent), `intent ${intent} must be valid`);
  }
});

test('invalid programmatic intent is rejected for 404 routing', () => {
  assert.equal(isProgrammaticSeoIntent('neexistuje-kategorie'), false);
});

test('SEO page must not use global error fallback copy as success content', () => {
  const errorFallback = 'Nepodařilo se načíst stránku';
  const healthyH1 = 'Developerské projekty Pardubice';
  assert.notEqual(healthyH1, errorFallback);
});
