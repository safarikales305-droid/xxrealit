import { BonusAppliesTo } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateBonusCampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ctaText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  bonusText?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsEnum(BonusAppliesTo)
  appliesTo?: BonusAppliesTo;

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
}
