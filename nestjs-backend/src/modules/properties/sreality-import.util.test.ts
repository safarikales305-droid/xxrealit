import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractSrealityBrokerFromRaw,
  formatImportedContactName,
  hasSrealityBrokerData,
} from './sreality-broker-extract.util';
import { extractListingIdFromUrl } from './sreality-listing-prefill.util';
import { buildAiReelListingTrackingUrl } from '../ai-influencer/ai-reel-listing-tracking.util';

describe('sreality import utilities', () => {
  it('extracts listing id from detail URL', () => {
    const id = extractListingIdFromUrl(
      'https://www.sreality.cz/detail/prodej/byt/3+kk/praha-liben/951038028',
    );
    assert.equal(id, '951038028');
  });

  it('extracts broker from nested raw payload', () => {
    const broker = extractSrealityBrokerFromRaw({
      broker: {
        name: 'Jan Novák',
        phone: '+420777123456',
        email: 'jan@rk.cz',
      },
      rk: { name: 'ABC Reality', id: 'rk-1' },
    });
    assert.equal(broker.agentName, 'Jan Novák');
    assert.equal(broker.companyName, 'ABC Reality');
    assert.equal(broker.phone, '+420777123456');
    assert.equal(broker.email, 'jan@rk.cz');
    assert.equal(hasSrealityBrokerData(broker), true);
    assert.match(formatImportedContactName(broker), /Jan Novák/);
  });

  it('extracts broker from premise object', () => {
    const broker = extractSrealityBrokerFromRaw({
      premise: { name: 'ABC Reality s.r.o.', id: 'prem-1', phone: '+420777111222' },
      broker: { name: 'Martin Doležel' },
    });
    assert.equal(broker.agentName, 'Martin Doležel');
    assert.equal(broker.companyName, 'ABC Reality s.r.o.');
    assert.equal(broker.phone, '+420777111222');
  });

  it('returns empty broker for missing data without throwing', () => {
    const broker = extractSrealityBrokerFromRaw(null);
    assert.equal(hasSrealityBrokerData(broker), false);
  });

  it('builds trackable listing URL for AI reel', () => {
    const url = buildAiReelListingTrackingUrl({
      origin: 'https://www.xxrealit.cz',
      propertyId: 'prop-1',
      jobId: 'job-1',
      platform: 'instagram',
    });
    assert.match(url, /utm_source=instagram/);
    assert.match(url, /listingId=prop-1/);
    assert.match(url, /aiReelId=job-1/);
  });
});
