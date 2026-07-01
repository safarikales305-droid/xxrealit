import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SocialIntroPropertyType } from '@prisma/client';
import { resolveSocialIntroPropertyType } from './social-intro-property-type.util';

test('resolveSocialIntroPropertyType maps rental offer', () => {
  assert.equal(
    resolveSocialIntroPropertyType({ propertyTypeKey: 'byt', offerType: 'pronájem' }),
    SocialIntroPropertyType.PRONAJEM,
  );
});

test('resolveSocialIntroPropertyType maps house', () => {
  assert.equal(
    resolveSocialIntroPropertyType({ propertyTypeKey: 'dum', offerType: 'prodej' }),
    SocialIntroPropertyType.DUM,
  );
});
