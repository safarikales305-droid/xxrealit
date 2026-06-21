import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProfileIco,
  isIcoUniqueRole,
  ICO_UNIQUE_ROLES,
} from './account-uniqueness.constants';
import { UserRole } from '@prisma/client';

test('normalizeProfileIco returns null for empty values', () => {
  assert.equal(normalizeProfileIco(''), null);
  assert.equal(normalizeProfileIco('   '), null);
  assert.equal(normalizeProfileIco(null), null);
  assert.equal(normalizeProfileIco(undefined), null);
});

test('normalizeProfileIco trims valid ICO', () => {
  assert.equal(normalizeProfileIco(' 12345678 '), '12345678');
});

test('isIcoUniqueRole covers professional roles', () => {
  for (const role of ICO_UNIQUE_ROLES) {
    assert.equal(isIcoUniqueRole(role), true);
  }
  assert.equal(isIcoUniqueRole(UserRole.USER), false);
  assert.equal(isIcoUniqueRole(UserRole.ADMIN), false);
});
