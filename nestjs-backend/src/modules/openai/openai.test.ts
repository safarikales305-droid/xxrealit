import test from 'node:test';
import assert from 'node:assert/strict';
import { maskApiKey, redactSecrets } from './openai-mask.util';
import { estimateCostCzk } from './openai-cost.util';
import { validateSeoAiOutput, parseSeoAiJson } from './seo-ai-output.validator';

test('maskApiKey never exposes full key', () => {
  const masked = maskApiKey('sk-proj-abcdefghijklmnopqrstuvwxyz123456');
  assert.ok(masked);
  assert.ok(masked!.includes('...'));
  assert.ok(!masked!.includes('uvwxyz123456'));
  assert.equal(maskApiKey(null), null);
});

test('redactSecrets removes API keys from logs', () => {
  const text = 'Error with sk-proj-abcdefghijklmnopqrstuvwxyz123456 in Bearer sk-secretkey123456';
  const redacted = redactSecrets(text);
  assert.ok(!redacted.includes('sk-proj-abcdefghijklmnopqrstuvwxyz123456'));
  assert.ok(redacted.includes('[REDACTED]'));
});

test('validateSeoAiOutput accepts valid structured output', () => {
  const result = validateSeoAiOutput({
    metaTitle: 'Prodej bytů Praha – aktuální nabídky | XXREALIT',
    metaDescription:
      'Prohlédněte si byty na prodej v Praze. Porovnejte ceny, lokality, dispozice a nabídky majitelů, makléřů a realitních kanceláří na XXREALIT portálu.',
    h1: 'Prodej bytů v Praze',
    introText:
      'Na této stránce najdete přehledné informace o prodeji bytů v Praze. Text je určen pro návštěvníky portálu XXREALIT, kteří hledají spolehlivý zdroj informací.',
    mainContent:
      'Praha nabízí širokou škálu bytů v různých lokalitách. Při výběru je vhodné sledovat dispozici, stav nemovitosti a dostupnou infrastrukturu. Portál XXREALIT umožňuje filtrovat nabídky podle vašich preferencí a kontaktovat inzerenty přímo. Před podpisem smlouvy doporučujeme ověřit právní stav nemovitosti a náklady spojené s převodem. Tento průvodce shrnuje obecné kroky při hledání bytu bez slibů konkrétní ceny nebo garance prodeje.',
    faq: [
      { question: 'Jak najdu byt na prodej v Praze?', answer: 'Použijte filtry na portálu XXREALIT.' },
      { question: 'Mohu kontaktovat majitele přímo?', answer: 'Ano, u každého inzerátu je kontakt.' },
      { question: 'Jak vložit vlastní inzerát?', answer: 'Registrujte se a vložte nemovitost v sekci Moje inzeráty.' },
    ],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.h1, 'Prodej bytů v Praze');
    assert.equal(result.data.faq.length, 3);
  }
});

test('validateSeoAiOutput rejects unsafe content', () => {
  const result = validateSeoAiOutput({
    metaTitle: 'Test javascript:alert(1) v titulku',
    metaDescription:
      'Popis s dostatečnou délkou pro validaci meta description pole v češtině na portálu XXREALIT bez nebezpečného obsahu.',
    h1: 'H1',
    introText: 'Úvodní text s dostatečnou délkou pro splnění minimálních požadavků validátoru obsahu.',
    mainContent:
      'Hlavní obsah musí mít alespoň dvě stě znaků, proto doplňujeme obecné informace o realitním trhu, výběru nemovitosti a práci s portálem XXREALIT bez slibů konkrétních cen nebo garancí prodeje či pronájmu.',
    faq: [
      { question: 'Q1?', answer: 'A1' },
      { question: 'Q2?', answer: 'A2' },
      { question: 'Q3?', answer: 'A3' },
    ],
  });
  assert.equal(result.ok, false);
});

test('parseSeoAiJson extracts JSON from markdown block', () => {
  const parsed = parseSeoAiJson('```json\n{"metaTitle":"A"}\n```') as { metaTitle: string };
  assert.equal(parsed.metaTitle, 'A');
});

test('estimateCostCzk returns positive number', () => {
  const cost = estimateCostCzk(1000, 500, 'gpt-4.1-mini');
  assert.ok(cost > 0);
});
