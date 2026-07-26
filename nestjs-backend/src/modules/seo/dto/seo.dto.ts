import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSeoSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  defaultTitle?: string;

  @IsOptional()
  @IsString()
  defaultDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  defaultKeywords?: string[];

  @IsOptional()
  @IsString()
  defaultOgImageUrl?: string;

  @IsOptional()
  @IsBoolean()
  robotsIndex?: boolean;

  @IsOptional()
  @IsString()
  googleAnalyticsId?: string;

  @IsOptional()
  @IsString()
  googleTagManagerId?: string;

  @IsOptional()
  @IsString()
  googleSearchConsoleVerification?: string;

  @IsOptional()
  @IsString()
  metaPixelId?: string;

  @IsOptional()
  @IsString()
  seznamWebmasterVerification?: string;

  @IsOptional()
  @IsString()
  bingWebmasterVerification?: string;

  @IsOptional()
  @IsString()
  yandexVerification?: string;

  @IsOptional()
  @IsString()
  pinterestVerification?: string;

  @IsOptional()
  @IsString()
  tiktokPixelId?: string;

  @IsOptional()
  @IsString()
  linkedInInsightId?: string;

  @IsOptional()
  @IsBoolean()
  cookieConsentEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hreflangLocales?: string[];

  @IsOptional()
  @IsBoolean()
  googleIndexingApiEnabled?: boolean;

  @IsOptional()
  @IsString()
  googleIndexingServiceAccountJson?: string;

  @IsOptional()
  @IsBoolean()
  programmaticGenerateWithoutListings?: boolean;

  @IsOptional()
  @IsBoolean()
  programmaticAutoEnrichWithListings?: boolean;

  @IsOptional()
  @IsBoolean()
  programmaticAutoRegenerateOnDataChange?: boolean;

  @IsOptional()
  @IsBoolean()
  programmaticDuplicateContentCheck?: boolean;

  @IsOptional()
  @IsBoolean()
  programmaticSeoScoreCheck?: boolean;

  @IsOptional()
  @IsBoolean()
  programmaticIndexationCheck?: boolean;

  @IsOptional()
  programmaticIndexabilityMinScore?: number;

  @IsOptional()
  programmaticIndexabilityReviewScore?: number;

  @IsOptional()
  @IsBoolean()
  programmaticPreviewBeforePublish?: boolean;
}

export class UpdatePropertySeoDto {
  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  seoKeywords?: string[];

  @IsOptional()
  @IsString()
  slug?: string;
}
