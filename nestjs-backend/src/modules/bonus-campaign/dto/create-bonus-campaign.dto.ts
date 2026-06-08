import { BonusAppliesTo } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateBonusCampaignDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(200)
  ctaText!: string;

  @IsString()
  @MaxLength(300)
  bonusText!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsEnum(BonusAppliesTo)
  appliesTo!: BonusAppliesTo;

  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsString()
  activeFrom?: string | null;

  @IsOptional()
  @IsString()
  activeTo?: string | null;

  @IsBoolean()
  oncePerUser!: boolean;
}
