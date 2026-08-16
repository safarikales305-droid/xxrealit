import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractEmails,
  isTerminalDiscoveryState,
  scoreEmail,
} from './company-contact-discovery.helpers';

describe('company-contact-discovery helpers', () => {
  it('extracts emails from html', () => {
    const html = '<a href="mailto:info@firma.cz">Kontakt</a> tel: obchod@firma.cz';
    const emails = extractEmails(html);
    assert.ok(emails.includes('info@firma.cz'));
    assert.ok(emails.includes('obchod@firma.cz'));
  });

  it('scores domain-matching info@ higher', () => {
    const high = scoreEmail('info@abcstavby.cz', 'https://www.abcstavby.cz');
    const low = scoreEmail('random@gmail.com', 'https://www.abcstavby.cz');
    assert.ok(high > low);
    assert.ok(high >= 0.9);
  });

  it('detects terminal discovery states', () => {
    assert.equal(isTerminalDiscoveryState('QUEUED'), false);
    assert.equal(isTerminalDiscoveryState('SEARCHING'), false);
    assert.equal(isTerminalDiscoveryState('NOT_FOUND'), true);
    assert.equal(isTerminalDiscoveryState('FOUND'), true);
    assert.equal(isTerminalDiscoveryState('FAILED'), true);
  });
});
