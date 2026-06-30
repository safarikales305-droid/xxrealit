import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UserRole } from '@prisma/client';
import {
  communityPostAuthorRoles,
  isCommunityPostAuthorVisibleUser,
} from './community-posts.util';

test('community feed author roles include portal worker', () => {
  const roles = communityPostAuthorRoles();
  assert.ok(roles.includes(UserRole.PORTAL_WORKER));
  assert.ok(roles.includes(UserRole.AGENT));
});

test('isCommunityPostAuthorVisibleUser accepts approved portal worker with public profile', () => {
  assert.equal(
    isCommunityPostAuthorVisibleUser({
      role: UserRole.PORTAL_WORKER,
      publicProfile: true,
      accountLimited: false,
      portalWorkerStatus: 'APPROVED',
    }),
    true,
  );
});

test('isCommunityPostAuthorVisibleUser rejects portal worker without public profile', () => {
  assert.equal(
    isCommunityPostAuthorVisibleUser({
      role: UserRole.PORTAL_WORKER,
      publicProfile: false,
      accountLimited: false,
      portalWorkerStatus: 'APPROVED',
    }),
    false,
  );
});
