export type CreditBucket = 'REAL' | 'BONUS' | 'PENDING';

export type CreditLedgerPurpose =
  | 'LISTING_CONTACT_UNLOCK'
  | 'TIP_CONTACT_UNLOCK'
  | 'TOP_UP_PENDING'
  | 'TOP_UP_CONFIRMED'
  | 'TOP_UP_REVERSED'
  | 'TOP_UP_EXPIRED'
  | 'BONUS_GRANTED'
  | 'OWNER_CONTACT_LEAD'
  | 'CONTACT_UNLOCK_TIPSTER'
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
