export const META_SUPPORTED_FACEBOOK_POSITIONS = ['feed', 'marketplace'] as const;
export const META_DEPRECATED_FACEBOOK_POSITIONS = ['video_feeds'] as const;
export const META_SUPPORTED_INSTAGRAM_POSITIONS = ['stream', 'story', 'reels'] as const;
export const META_SUPPORTED_PUBLISHER_PLATFORMS = ['facebook', 'instagram'] as const;

export const META_DEPRECATED_PLACEMENT_ERROR_SUBCODE = '2490562';

export type MetaFacebookPosition = (typeof META_SUPPORTED_FACEBOOK_POSITIONS)[number];
export type MetaInstagramPosition = (typeof META_SUPPORTED_INSTAGRAM_POSITIONS)[number];

export type MetaAdPlacementSettings = {
  facebook: Record<string, boolean>;
  instagram: Record<string, boolean>;
};

export type MetaPlacementCatalogEntry = {
  id: string;
  label: string;
  supported: boolean;
  deprecated?: boolean;
};

export const META_PLACEMENT_CATALOG: {
  facebook: MetaPlacementCatalogEntry[];
  instagram: MetaPlacementCatalogEntry[];
} = {
  facebook: [
    { id: 'feed', label: 'Facebook Feed', supported: true },
    { id: 'marketplace', label: 'Facebook Marketplace', supported: true },
    {
      id: 'video_feeds',
      label: 'Facebook Video Feeds (Meta již nepodporuje)',
      supported: false,
      deprecated: true,
    },
  ],
  instagram: [
    { id: 'stream', label: 'Instagram Feed', supported: true },
    { id: 'story', label: 'Instagram Stories', supported: true },
    { id: 'reels', label: 'Instagram Reels', supported: true },
  ],
};

export const DEFAULT_AD_PLACEMENT_SETTINGS: MetaAdPlacementSettings = {
  facebook: {
    feed: true,
    marketplace: true,
    video_feeds: false,
  },
  instagram: {
    stream: true,
    story: true,
    reels: true,
  },
};

const DEPRECATED_POSITIONS = new Set<string>([
  ...META_DEPRECATED_FACEBOOK_POSITIONS,
]);

export function normalizeAdPlacementSettings(raw: unknown): MetaAdPlacementSettings {
  const settings: MetaAdPlacementSettings = {
    facebook: { ...DEFAULT_AD_PLACEMENT_SETTINGS.facebook },
    instagram: { ...DEFAULT_AD_PLACEMENT_SETTINGS.instagram },
  };

  if (!raw || typeof raw !== 'object') {
    return settings;
  }

  const input = raw as Record<string, unknown>;
  for (const platform of ['facebook', 'instagram'] as const) {
    const source = input[platform];
    if (!source || typeof source !== 'object') continue;
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (typeof value !== 'boolean') continue;
      settings[platform][key] = value;
    }
  }

  for (const deprecated of DEPRECATED_POSITIONS) {
    settings.facebook[deprecated] = false;
  }

  return settings;
}

export function resolveEnabledPlacementPositions(
  settings: MetaAdPlacementSettings,
  mode: 'FACEBOOK_ONLY' | 'FACEBOOK_AND_INSTAGRAM',
): {
  facebookPositions: string[];
  instagramPositions: string[];
  publisherPlatforms: string[];
} {
  const facebookPositions = META_PLACEMENT_CATALOG.facebook
    .filter((entry) => entry.supported && settings.facebook[entry.id] === true)
    .map((entry) => entry.id);
  const instagramPositions =
    mode === 'FACEBOOK_AND_INSTAGRAM'
      ? META_PLACEMENT_CATALOG.instagram
          .filter((entry) => entry.supported && settings.instagram[entry.id] === true)
          .map((entry) => entry.id)
      : [];

  const safeFacebook =
    facebookPositions.length > 0
      ? facebookPositions
      : [...META_SUPPORTED_FACEBOOK_POSITIONS];
  const safeInstagram =
    mode === 'FACEBOOK_AND_INSTAGRAM'
      ? instagramPositions.length > 0
        ? instagramPositions
        : [...META_SUPPORTED_INSTAGRAM_POSITIONS]
      : [];

  return {
    facebookPositions: safeFacebook,
    instagramPositions: safeInstagram,
    publisherPlatforms:
      mode === 'FACEBOOK_AND_INSTAGRAM' && safeInstagram.length > 0
        ? ['facebook', 'instagram']
        : ['facebook'],
  };
}

export function isDeprecatedMetaPlacement(position: string): boolean {
  return DEPRECATED_POSITIONS.has(position);
}

export function isMetaDeprecatedPlacementGraphError(input: {
  errorCode?: string | null;
  errorSubcode?: string | null;
  message?: string | null;
  errorUserMsg?: string | null;
}): boolean {
  if (input.errorCode === '100' && input.errorSubcode === META_DEPRECATED_PLACEMENT_ERROR_SUBCODE) {
    return true;
  }
  const combined = `${input.message ?? ''} ${input.errorUserMsg ?? ''}`.toLowerCase();
  return (
    combined.includes('video feeds placement is no longer available') ||
    combined.includes('facebook video feeds placement')
  );
}

export function sanitizeTargetingPlacements(input: {
  targeting: Record<string, unknown>;
  placementSettings?: MetaAdPlacementSettings | null;
  placementMode?: 'FACEBOOK_ONLY' | 'FACEBOOK_AND_INSTAGRAM';
  onWarning?: (message: string) => void;
}): {
  targeting: Record<string, unknown>;
  removedPositions: string[];
  warnings: string[];
} {
  const settings = normalizeAdPlacementSettings(input.placementSettings);
  const mode = input.placementMode ?? 'FACEBOOK_ONLY';
  const enabled = resolveEnabledPlacementPositions(settings, mode);
  const copy = { ...input.targeting };
  const removedPositions: string[] = [];
  const warnings: string[] = [];

  const sanitizeList = (
    current: string[] | undefined,
    allowed: Set<string>,
    label: string,
  ): string[] => {
    const source = Array.isArray(current) ? current.filter((p): p is string => typeof p === 'string') : [];
    const next: string[] = [];
    for (const position of source) {
      if (isDeprecatedMetaPlacement(position) || !allowed.has(position)) {
        removedPositions.push(`${label}:${position}`);
        const warning = `Odstraněno nepodporované umístění ${label}/${position}.`;
        warnings.push(warning);
        input.onWarning?.(warning);
        continue;
      }
      next.push(position);
    }
    return next;
  };

  const allowedFacebook = new Set(enabled.facebookPositions);
  const allowedInstagram = new Set(enabled.instagramPositions);

  const facebookPositions = sanitizeList(
    Array.isArray(copy.facebook_positions)
      ? (copy.facebook_positions as string[])
      : undefined,
    allowedFacebook,
    'facebook',
  );
  const instagramPositions = sanitizeList(
    Array.isArray(copy.instagram_positions)
      ? (copy.instagram_positions as string[])
      : undefined,
    allowedInstagram,
    'instagram',
  );

  copy.publisher_platforms = [...enabled.publisherPlatforms];
  copy.facebook_positions =
    facebookPositions.length > 0 ? facebookPositions : [...enabled.facebookPositions];
  if (enabled.instagramPositions.length > 0) {
    copy.instagram_positions =
      instagramPositions.length > 0 ? instagramPositions : [...enabled.instagramPositions];
  } else {
    delete copy.instagram_positions;
  }

  return { targeting: copy, removedPositions, warnings };
}

export function applyTargetingToAdSetPayload(
  payload: Record<string, unknown>,
  targeting: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...payload,
    targeting: JSON.stringify(targeting),
  };
}
