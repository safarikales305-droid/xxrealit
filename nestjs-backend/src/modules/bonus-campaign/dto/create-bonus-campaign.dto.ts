import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const ACTION_TYPES = [
  'FACEBOOK_CONNECT',
  'INVITE_EMAIL',
  'INVITE_WHATSAPP',
  'FIRST_AD',
  'FIRST_VIDEO_AD',
  'FIRST_POST',
  'PROFILE_COMPLETE',
  'PROFILE_VERIFIED',
  'CUSTOM',
  'LEGACY_LISTING_TIP',
] as const;

const APPLIES_TO = ['LISTING', 'TIP', 'BOTH'] as const;

const ROLES = [
  'USER',
  'AGENT',
  'AGENCY',
  'COMPANY',
  'CRAFTSMAN',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
] as const;

export class CreateBonusCampaignDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ctaText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bonusText?: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsIn(APPLIES_TO)
  appliesTo?: (typeof APPLIES_TO)[number];

  @IsOptional()
  @IsIn(ACTION_TYPES)
  actionType?: (typeof ACTION_TYPES)[number];

  @IsOptional()
  @IsArray()
  @IsIn(ROLES, { each: true })
  roles?: (typeof ROLES)[number][];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  activeFrom?: string | null;

  @IsOptional()
  @IsString()
  activeTo?: string | null;

  @IsOptional()
  @IsBoolean()
  oncePerUser?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTotalClaims?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxClaimsPerUser?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  conditionMinCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customConditionText?: string;
}
