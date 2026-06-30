import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PortalWorkerStatus, UserRole } from '@prisma/client';
import {
  canUserPublishPosts,
  isCommunityPostAuthorVisible,
  isUserPublicProfilePageVisible,
  shouldShowUserInProfessionals,
} from './public-visibility.util';
import {
  isProfessionalDirectoryPublic,
  isProfessionalDirectoryVerified,
  professionalDirectoryFilterReasons,
} from '../modules/brokers/professional-directory.util';
import { PROFESSIONAL_SIDEBAR_ROLES } from '../modules/brokers/professional-verification.util';

const approvedWorker = {
  id: 'w1',
  name: 'Worker',
  avatar: null,
  bio: null,
  brokerProfileSlug: null,
  brokerOfficeName: '',
  brokerRegionLabel: '',
  brokerReviewAverage: 0,
  brokerReviewCount: 0,
  allowBrokerReviews: false,
  brokerPhonePublic: '',
  brokerEmailPublic: '',
  isTestAccount: false,
  testAccountPublicVisible: false,
  role: UserRole.PORTAL_WORKER,
  publicProfile: true,
  canPublishPosts: true,
  showInProfessionals: true,
  accountLimited: false,
  portalWorkerStatus: PortalWorkerStatus.APPROVED,
  publicProfessionalProfile: true,
  isPublicBrokerProfile: true,
  professionalVerified: false,
  professionalVerificationStatus: 'NONE' as const,
};

test('approved portal worker with public profile is visible in professionals', () => {
  assert.equal(shouldShowUserInProfessionals(approvedWorker), true);
  assert.equal(isProfessionalDirectoryPublic(approvedWorker), true);
  assert.equal(isProfessionalDirectoryVerified(approvedWorker), true);
  const reasons = professionalDirectoryFilterReasons(
    approvedWorker as Parameters<typeof professionalDirectoryFilterReasons>[0],
    new Set(PROFESSIONAL_SIDEBAR_ROLES),
  );
  assert.deepEqual(reasons, []);
});

test('portal worker without approval is hidden from professionals and feed', () => {
  const pending = {
    ...approvedWorker,
    portalWorkerStatus: PortalWorkerStatus.PENDING_APPROVAL,
  };
  assert.equal(shouldShowUserInProfessionals(pending), false);
  assert.equal(isUserPublicProfilePageVisible(pending), false);
  assert.equal(canUserPublishPosts(pending), false);
});

test('portal worker explicitly hidden via showInProfessionals=false', () => {
  const worker = {
    ...approvedWorker,
    showInProfessionals: false,
  };
  assert.equal(shouldShowUserInProfessionals(worker), false);
});

test('community post author visible with publicProfile even without canPublishPosts', () => {
  const worker = { ...approvedWorker, canPublishPosts: false };
  assert.equal(isCommunityPostAuthorVisible(worker), true);
  assert.equal(canUserPublishPosts(worker), false);
});

test('property seeker never appears in professionals even with flags', () => {
  const seeker = {
    role: UserRole.PROPERTY_SEEKER,
    publicProfile: true,
    canPublishPosts: true,
    showInProfessionals: true,
    accountLimited: false,
    portalWorkerStatus: null,
    publicProfessionalProfile: true,
    isPublicBrokerProfile: true,
  };
  assert.equal(shouldShowUserInProfessionals(seeker), false);
});

test('limited account is hidden everywhere', () => {
  const limited = { ...approvedWorker, accountLimited: true };
  assert.equal(isUserPublicProfilePageVisible(limited), false);
  assert.equal(canUserPublishPosts(limited), false);
  assert.equal(shouldShowUserInProfessionals(limited), false);
});
