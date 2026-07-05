import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateRegistrationGamificationDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  gameType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  audience?: string;

  @IsOptional()
  @IsBoolean()
  showOnHome?: boolean;

  @IsOptional()
  @IsBoolean()
  showOnShorts?: boolean;

  @IsOptional()
  @IsBoolean()
  showOnClassic?: boolean;

  @IsOptional()
  @IsBoolean()
  showOnPosts?: boolean;

  @IsOptional()
  @IsBoolean()
  showOnProfessionalProfile?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  triggerType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  triggerShortsViews?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(600)
  triggerSecondsOnSite?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  triggerPagesVisited?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  frequency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(15)
  decisionsCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  offerIntervalSec?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  bonusCredits?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bonusDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  onCloseAction?: string;

  @IsOptional()
  @IsBoolean()
  closeModalPromoEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoEmailMarketing?: boolean;

  @IsOptional()
  @IsBoolean()
  autoWhatsAppCampaign?: boolean;

  @IsOptional()
  @IsBoolean()
  autoCrm?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class SubmitGamificationLeadDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  visitorType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  score!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600)
  gameDurationSec?: number;

  @IsOptional()
  @IsArray()
  decisions?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsObject()
  gameResult?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  gameSessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  visitorKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  landingPage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  visitSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmContent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmTerm?: string;
}

export class CheckGamificationEmailDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;
}

export class RecordGamificationEventDto {
  @IsString()
  @MaxLength(64)
  eventType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  visitorKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pagePath?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
