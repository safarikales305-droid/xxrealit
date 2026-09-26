import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RenovationPricingService } from './renovation-pricing.service';

describe('RenovationPricingService', () => {
  const svc = new RenovationPricingService();

  it('returns a range with line items for interior', () => {
    const snap = svc.computeDeterministicEstimate({
      propertyType: 'bathroom',
      areaSqm: 12,
      renovationLevel: 'RENOVATION',
      materialTier: 'STANDARD',
      scopePartial: false,
      region: 'Pardubice',
    });
    assert.ok(snap.lineItems.length > 3);
    assert.ok(snap.estimateMin < snap.estimateMax);
    assert.equal(snap.pricingVersion, svc.version);
    assert.ok(snap.totalMinWithReserve != null && snap.totalMinWithReserve > snap.estimateMin);
  });

  it('partial scope lowers totals vs full', () => {
    const full = svc.computeDeterministicEstimate({
      propertyType: 'kitchen',
      areaSqm: 14,
      renovationLevel: 'RENOVATION',
      materialTier: 'STANDARD',
      scopePartial: false,
      region: 'CZ',
    });
    const partial = svc.computeDeterministicEstimate({
      propertyType: 'kitchen',
      areaSqm: 14,
      renovationLevel: 'RENOVATION',
      materialTier: 'STANDARD',
      scopePartial: true,
      region: 'CZ',
    });
    assert.ok(partial.estimateMax < full.estimateMax);
  });
});
