import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractSrealityBrokerFromHtml,
  normalizeEmail,
  normalizePhone,
} from './sreality-contact-extract.util';

describe('sreality-contact-extract', () => {
  it('extracts tel and mailto from HTML', () => {
    const html =
      '<a href="tel:+420777123456">call</a><a href="mailto:jan@rk.cz">mail</a><span data-e2e="detail-contact-name">Jan Novák</span>';
    const broker = extractSrealityBrokerFromHtml(html);
    assert.equal(broker.phone, '+420777123456');
    assert.equal(broker.email, 'jan@rk.cz');
    assert.equal(broker.agentName, 'Jan Novák');
  });

  it('normalizes Czech phone without prefix', () => {
    assert.equal(normalizePhone('777 123 456'), '+420777123456');
  });

  it('normalizes valid email', () => {
    assert.equal(normalizeEmail('  Test@RK.CZ '), 'test@rk.cz');
  });
});
