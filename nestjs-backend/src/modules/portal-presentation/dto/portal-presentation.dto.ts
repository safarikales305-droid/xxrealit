import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdatePresentationPageDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  metaKeywords?: string;

  @IsOptional()
  @IsString()
  ogImageUrl?: string;

  @IsOptional()
  @IsString()
  canonicalUrl?: string;

  @IsOptional()
  @IsString()
  heroTitle?: string;

  @IsOptional()
  @IsString()
  heroSubtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  heroBadgeText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  faqTitle?: string;

  @IsOptional()
  @IsString()
  heroCtaLabel?: string;

  @IsOptional()
  @IsString()
  heroCtaUrl?: string;

  @IsOptional()
  @IsString()
  heroSecondaryCtaLabel?: string;

  @IsOptional()
  @IsString()
  heroSecondaryCtaUrl?: string;

  @IsOptional()
  @IsString()
  heroImageUrl?: string;

  @IsOptional()
  @IsString()
  heroVideoUrl?: string;

  @IsOptional()
  @IsString()
  heroGradientFrom?: string;

  @IsOptional()
  @IsString()
  heroGradientTo?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  contactAddress?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpsertPresentationSectionDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  anchor!: string;

  @IsOptional()
  @IsString()
  sectionType?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsString()
  bodyHtml!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  galleryUrls?: string[];

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  youtubeUrl?: string;

  @IsOptional()
  @IsString()
  ctaLabel?: string;

  @IsOptional()
  @IsString()
  ctaUrl?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsString()
  bgStyle?: string;
}

export class ReorderSectionsDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}

export class UpsertFaqDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(3)
  question!: string;

  @IsString()
  answerHtml!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class TrackAnalyticsDto {
  @IsString()
  eventType!: string;

  @IsOptional()
  @IsString()
  visitorId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  referrer?: string;
}
