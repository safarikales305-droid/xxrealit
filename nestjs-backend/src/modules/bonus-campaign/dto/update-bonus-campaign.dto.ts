export class UpdateBonusCampaignDto {
  title?: string;
  ctaText?: string;
  bonusText?: string;
  amount?: number;
  appliesTo?: 'LISTING' | 'TIP' | 'BOTH';
  isActive?: boolean;
  activeFrom?: string | null;
  activeTo?: string | null;
  oncePerUser?: boolean;
}
