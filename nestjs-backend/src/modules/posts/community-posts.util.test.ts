import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UserRole } from '@prisma/client';
import {
  communityPostAuthorRoles,
  isCommunityPostAuthorVisibleUser,
  sortCommunityPostsWithFollowPriority,
} from './community-posts.util';

test('sortCommunityPostsWithFollowPriority puts followed authors first', () => {
  const followedId = 'followed-author';
  const rows = [
    { id: '1', userId: 'other', createdAt: new Date('2026-06-01'), publishedAt: null },
    { id: '2', userId: followedId, createdAt: new Date('2026-05-01'), publishedAt: null },
    { id: '3', userId: 'other-2', createdAt: new Date('2026-06-02'), publishedAt: null },
  ];
  const sorted = sortCommunityPostsWithFollowPriority(rows, new Set([followedId]));
  assert.equal(sorted[0]?.id, '2');
  assert.equal(sorted[1]?.id, '3');
  assert.equal(sorted[2]?.id, '1');
});

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
