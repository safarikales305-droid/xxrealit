export type MetaPlacementMode = 'FACEBOOK_AND_INSTAGRAM' | 'FACEBOOK_ONLY';

export const META_FACEBOOK_PLACEMENT_POSITIONS = ['feed', 'marketplace', 'video_feeds'] as const;
export const META_INSTAGRAM_PLACEMENT_POSITIONS = ['stream', 'story', 'reels'] as const;

export const META_INSTAGRAM_IDENTITY_ERROR_SUBCODE = '1772103';

export const META_INSTAGRAM_PLACEMENT_VALIDATION_MESSAGE_CS =
  'Kampaň obsahuje umístění na Instagramu, ale není připojen Instagram Business účet. Připojte Instagram nebo zvolte pouze Facebook.';

export type MetaPlacementDiagnostics = {
  placementMode: MetaPlacementMode;
  publisherPlatforms: string[];
  facebookPositions: string[];
  instagramPositions: string[];
  facebookPageId: string | null;
  instagramBusinessId: string | null;
};

export function resolvePlacementMode(
  instagramBusinessId: string | null | undefined,
  preference?: 'FACEBOOK_ONLY' | 'FACEBOOK_AND_INSTAGRAM' | 'AUTO' | null,
): MetaPlacementMode {
  if (preference === 'FACEBOOK_ONLY') return 'FACEBOOK_ONLY';
  if (preference === 'FACEBOOK_AND_INSTAGRAM' && instagramBusinessId?.trim()) {
    return 'FACEBOOK_AND_INSTAGRAM';
  }
  return instagramBusinessId?.trim() ? 'FACEBOOK_AND_INSTAGRAM' : 'FACEBOOK_ONLY';
}

export function parseTargetingRecord(
  targeting: Record<string, unknown> | string | null | undefined,
): Record<string, unknown> {
  if (!targeting) return {};
  if (typeof targeting === 'string') {
    try {
      const parsed = JSON.parse(targeting) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return { ...targeting };
}

export function readTargetingPlacements(targeting: Record<string, unknown>): {
  publisherPlatforms: string[];
  facebookPositions: string[];
  instagramPositions: string[];
} {
  const publisherPlatforms = Array.isArray(targeting.publisher_platforms)
    ? targeting.publisher_platforms.filter((p): p is string => typeof p === 'string')
    : [];
  const facebookPositions = Array.isArray(targeting.facebook_positions)
    ? targeting.facebook_positions.filter((p): p is string => typeof p === 'string')
    : [];
  const instagramPositions = Array.isArray(targeting.instagram_positions)
    ? targeting.instagram_positions.filter((p): p is string => typeof p === 'string')
    : [];
  return { publisherPlatforms, facebookPositions, instagramPositions };
}

export function targetingIncludesInstagramPlacement(targeting: Record<string, unknown>): boolean {
  const { publisherPlatforms, instagramPositions } = readTargetingPlacements(targeting);
  if (publisherPlatforms.includes('instagram')) return true;
  if (instagramPositions.length > 0) return true;
  if (publisherPlatforms.length === 0 && instagramPositions.length === 0) {
    return !targeting.facebook_positions;
  }
  return false;
}

export function applyPlacementModeToTargeting(
  targeting: Record<string, unknown>,
  mode: MetaPlacementMode,
): Record<string, unknown> {
  const copy = { ...targeting };
  if (mode === 'FACEBOOK_ONLY') {
    copy.publisher_platforms = ['facebook'];
    copy.facebook_positions = [...META_FACEBOOK_PLACEMENT_POSITIONS];
    delete copy.instagram_positions;
    return copy;
  }
  copy.publisher_platforms = ['facebook', 'instagram'];
  copy.facebook_positions = [...META_FACEBOOK_PLACEMENT_POSITIONS];
  copy.instagram_positions = [...META_INSTAGRAM_PLACEMENT_POSITIONS];
  return copy;
}

export function validatePlacementInstagramIdentity(input: {
  targeting: Record<string, unknown>;
  instagramBusinessId: string | null | undefined;
}): void {
  const instagramBusinessId = input.instagramBusinessId?.trim() || null;
  const { publisherPlatforms } = readTargetingPlacements(input.targeting);
  const includesInstagram =
    publisherPlatforms.includes('instagram') ||
    targetingIncludesInstagramPlacement(input.targeting);
  if (includesInstagram && !instagramBusinessId) {
    throw new Error(
      'Instagram placement requires a connected Instagram Business account. Connect Instagram or use Facebook-only placements.',
    );
  }
}

export function buildPlacementDiagnostics(input: {
  targeting: Record<string, unknown>;
  placementMode: MetaPlacementMode;
  facebookPageId: string | null;
  instagramBusinessId: string | null;
}): MetaPlacementDiagnostics {
  const applied = applyPlacementModeToTargeting(input.targeting, input.placementMode);
  const placements = readTargetingPlacements(applied);
  return {
    placementMode: input.placementMode,
    publisherPlatforms: placements.publisherPlatforms,
    facebookPositions: placements.facebookPositions,
    instagramPositions: placements.instagramPositions,
    facebookPageId: input.facebookPageId,
    instagramBusinessId: input.instagramBusinessId,
  };
}

export function parseObjectStorySpecInstagramUserId(
  objectStorySpec: unknown,
): string | null {
  let spec: Record<string, unknown> | null = null;
  if (typeof objectStorySpec === 'string') {
    try {
      spec = JSON.parse(objectStorySpec) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (objectStorySpec && typeof objectStorySpec === 'object') {
    spec = objectStorySpec as Record<string, unknown>;
  }
  if (!spec) return null;
  const userId = spec.instagram_user_id ?? spec.instagram_actor_id;
  return typeof userId === 'string' && userId.trim() ? userId.trim() : null;
}

export function creativeHasInstagramIdentity(creativeBody: Record<string, unknown>): boolean {
  return parseObjectStorySpecInstagramUserId(creativeBody.object_story_spec) != null;
}

export function isMetaInstagramIdentityError(input: {
  errorSubcode?: string | null;
  errorCode?: string | null;
  errorUserMsg?: string | null;
}): boolean {
  if (input.errorSubcode === META_INSTAGRAM_IDENTITY_ERROR_SUBCODE) return true;
  const msg = (input.errorUserMsg ?? '').toLowerCase();
  return msg.includes('instagram') && msg.includes('účet');
}

export function shouldRecreateCreativeForPlacement(input: {
  placementMode: MetaPlacementMode;
  instagramBusinessId: string | null;
  creativeBody: Record<string, unknown> | null | undefined;
}): boolean {
  if (input.placementMode !== 'FACEBOOK_AND_INSTAGRAM') return false;
  if (!input.instagramBusinessId?.trim()) return false;
  if (!input.creativeBody) return true;
  const existingId = parseObjectStorySpecInstagramUserId(input.creativeBody.object_story_spec);
  return existingId !== input.instagramBusinessId.trim();
}

export function shouldUpdateAdSetForFacebookOnly(input: {
  placementMode: MetaPlacementMode;
  adSetTargeting: Record<string, unknown>;
}): boolean {
  return (
    input.placementMode === 'FACEBOOK_ONLY' &&
    targetingIncludesInstagramPlacement(input.adSetTargeting)
  );
}
