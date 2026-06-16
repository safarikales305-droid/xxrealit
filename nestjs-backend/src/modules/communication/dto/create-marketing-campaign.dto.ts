import { MarketingCampaignAudience, MarketingCampaignChannel } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateMarketingCampaignDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  title!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20000)
  body!: string;

  @IsEnum(MarketingCampaignChannel)
  channel!: MarketingCampaignChannel;

  @IsEnum(MarketingCampaignAudience)
  audience!: MarketingCampaignAudience;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  audienceRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  audienceCity?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}
