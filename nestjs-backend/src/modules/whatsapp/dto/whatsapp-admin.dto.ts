import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UserRole, WhatsAppMarketingCampaignType } from '@prisma/client';

export class UpdateWhatsAppIntegrationSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  accessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  webhookVerifyToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  testPhone?: string;

  @IsOptional()
  @IsBoolean()
  welcomeEnabled?: boolean;

  @IsOptional()
  welcomeTemplates?: Record<string, string>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  batchSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(10000)
  batchDelayMs?: number;
}

export class WhatsAppTestSendDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20)
  toPhone?: string;
}

export class CreateWhatsAppMarketingCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsEnum(WhatsAppMarketingCampaignType)
  campaignType!: WhatsAppMarketingCampaignType;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  messageTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  waMetaTemplateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  waTemplateName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  waTemplateLanguage?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  waTemplateVariables?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(UserRole, { each: true })
  targetRoles?: UserRole[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  targetRegions?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  targetCities?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  manualPhones?: string[];
}

export class PreviewWhatsAppCampaignDto extends CreateWhatsAppMarketingCampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sampleName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  sampleRole?: UserRole;
}

export class WhatsAppCampaignTestDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20)
  toPhone?: string;
}

export class WhatsAppHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsString()
  campaignId?: string;
}
