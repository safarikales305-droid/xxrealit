/**
 * Konfigurovatelné body a odměny pro makléře (AGENT).
 * Pravidla lze v budoucnu přesunout do DB nebo admin UI.
 */
export const BROKER_REWARD_CONFIG = {
  /** Body za jednotlivé akce (idempotence přes dedupeKey v ledgeru). */
  pointsPerAction: {
    LISTING_CREATED_CLASSIC: 10,
    LISTING_CREATED_SHORTS: 15,
    VIDEO_POST: 20,
    /** Jednoduchý engagement — např. reakce na cizí příspěvek (volitelné rozšíření). */
    ENGAGEMENT_SAMPLE: 1,
  } as const,
  /** Po součtu bodů modulo prahu — přičíst free leady (kumulativní prahy). */
  rewardThresholdPoints: 100,
  freeLeadsPerThreshold: 3,
} as const;

export type BrokerRewardActionKey = keyof typeof BROKER_REWARD_CONFIG.pointsPerAction;
