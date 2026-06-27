import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TrackPageviewDto {
  @IsString()
  @MaxLength(64)
  visitorId!: string;

  @IsString()
  @MaxLength(64)
  sessionId!: string;

  @IsString()
  @MaxLength(2048)
  url!: string;

  @IsString()
  @MaxLength(512)
  path!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referrer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  previousPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  utmSource?: string;

  @IsOptional()
  @IsString()
  utmMedium?: string;

  @IsOptional()
  @IsString()
  utmCampaign?: string;
}

export class UpdateAnalyticsSettingsDto {
  @IsOptional()
  anonymizeIp?: boolean;

  @IsOptional()
  excludeStaff?: boolean;

  @IsOptional()
  trackingEnabled?: boolean;
}
