import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateMetaCenterSettingDto {
  @IsOptional() @IsString() @MaxLength(128) facebookAppId?: string;
  @IsOptional() @IsString() @MaxLength(256) facebookAppSecret?: string;
  @IsOptional() @IsString() @MaxLength(128) facebookPagesAppId?: string;
  @IsOptional() @IsString() @MaxLength(256) facebookPagesSecret?: string;
  @IsOptional() @IsString() @MaxLength(128) businessManagerId?: string;
  @IsOptional() @IsString() @MaxLength(128) commerceManagerId?: string;
  @IsOptional() @IsString() @MaxLength(128) catalogId?: string;
  @IsOptional() @IsString() @MaxLength(128) datasetId?: string;
  @IsOptional() @IsString() @MaxLength(128) pixelId?: string;
  @IsOptional() @IsString() @MaxLength(256) pixelName?: string;
  @IsOptional() @IsString() @MaxLength(512) conversionsApiToken?: string;
  @IsOptional() @IsString() @MaxLength(256) webhookVerifyToken?: string;
  @IsOptional() @IsString() @MaxLength(256) webhookSecret?: string;
  @IsOptional() @IsString() @MaxLength(512) frontendUrl?: string;
  @IsOptional() @IsString() @MaxLength(512) backendUrl?: string;
  @IsOptional() @IsString() @MaxLength(512) redirectUri?: string;
  @IsOptional() @IsString() @MaxLength(512) callbackUrl?: string;
  @IsOptional() @IsString() @MaxLength(256) encryptionKey?: string;
  @IsOptional() @IsString() @MaxLength(32) graphApiVersion?: string;
  @IsOptional() @IsString() @MaxLength(512) domainVerification?: string;
  @IsOptional() @IsBoolean() catalogFeedEnabled?: boolean;
  @IsOptional() @IsBoolean() campaignsLiveEnabled?: boolean;
  @IsOptional() @IsBoolean() campaignsDebugMode?: boolean;
  @IsOptional() @IsObject() capiEventToggles?: Record<string, boolean>;
  @IsOptional() @IsObject() pixelMapping?: Record<string, string>;
  @IsOptional() @IsObject() remarketingAudiences?: unknown;
  @IsOptional() @IsObject() autoCampaignRules?: unknown;
  @IsOptional() @IsObject() adFormatFlags?: Record<string, boolean>;
}

export class MetaCenterPixelTestDto {
  @IsString() @MaxLength(64) eventType!: string;
  @IsOptional() @IsString() listingId?: string;
}

export class MetaCenterLogsQueryDto {
  @IsOptional() @IsString() eventType?: string;
  @IsOptional() @IsString() source?: string;
}
