export type CreditBucket = 'REAL' | 'BONUS' | 'PENDING';

export type CreditLedgerPurpose =
  | 'LISTING_CONTACT_UNLOCK'
  | 'TIP_CONTACT_UNLOCK'
  | 'TOP_UP_PENDING'
  | 'TOP_UP_CONFIRMED'
  | 'TOP_UP_REVERSED'
  | 'TOP_UP_EXPIRED'
  | 'BONUS_GRANTED'
  | 'BONUS'
  | 'FACEBOOK_CONNECT'
  | 'INVITE_EMAIL'
  | 'INVITE_WHATSAPP'
  | 'FIRST_AD'
  | 'FIRST_VIDEO_AD'
  | 'FIRST_POST'
  | 'PROFILE_COMPLETE'
  | 'PROFILE_VERIFIED'
  | 'CUSTOM'
  | 'OWNER_CONTACT_LEAD'
  | 'LEAD_UNLOCK'
  | 'LEAD_CHARGE'
  | 'CONTACT_UNLOCK_TIPSTER'
  | 'TIPSTER_EARNING'
  | 'ADMIN_ADJUSTMENT';

export type ContactUnlockSourceType = 'LISTING' | 'TIP' | 'TIP_SHORTS';

export type UserCreditBalances = {
  realCreditBalance: number;
  bonusCreditBalance: number;
  pendingCreditBalance: number;
  creditBalance: number;
};

export type ContactUnlockSpendBreakdown = {
  realUsed: number;
  bonusUsed: number;
  pendingUsed: number;
};
