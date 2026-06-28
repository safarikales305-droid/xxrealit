import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { SocialPublishContentType, SocialPublishRepeatType, UserRole } from '@prisma/client';

export class SelectFacebookAutopostPageDto {
  @IsString()
  pageId!: string;
}

export class UpdateFacebookAutopostDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Alias pro `enabled` — frontend může posílat facebookEnabled. */
  @IsOptional()
  @IsBoolean()
  facebookEnabled?: boolean;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  pageName?: string;

  @IsOptional()
  @IsString()
  pageAccessToken?: string;

  @IsOptional()
  @IsString()
  tokenExpiresAt?: string | null;

  @IsOptional()
  @IsBoolean()
  publishPosts?: boolean;

  @IsOptional()
  @IsBoolean()
  publishProperties?: boolean;

  @IsOptional()
  @IsBoolean()
  publishShorts?: boolean;

  @IsOptional()
  @IsBoolean()
  publishShortsAsReels?: boolean;

  @IsOptional()
  @IsBoolean()
  reelsFallbackToVideoPost?: boolean;

  @IsOptional()
  @IsBoolean()
  reelsFallbackToPhotoPost?: boolean;

  @IsOptional()
  @IsBoolean()
  approvedOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  publicPostsOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  professionalsOnly?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  allowedRoles?: UserRole[];
}

export class ManualSocialEnqueueDto {
  @IsEnum(SocialPublishContentType)
  contentType!: SocialPublishContentType;

  @IsString()
  contentId!: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class SocialQueueQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}

export class PropertyIdsDto {
  @IsArray()
  @IsString({ each: true })
  propertyIds!: string[];
}

export class PropertyPublishNowDto extends PropertyIdsDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsBoolean()
  publishAsReel?: boolean;
}

export class PropertyScheduleDto extends PropertyIdsDto {
  @IsString()
  firstRunAt!: string;

  @IsEnum(SocialPublishRepeatType)
  repeatType!: SocialPublishRepeatType;

  @IsOptional()
  @IsInt()
  @Min(1)
  repeatIntervalDays?: number;

  @IsOptional()
  @IsString()
  repeatUntil?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRuns?: number;

  @IsOptional()
  @IsBoolean()
  requireActive?: boolean;

  @IsOptional()
  @IsBoolean()
  requireApproved?: boolean;

  @IsOptional()
  @IsBoolean()
  shortsPublishAsReel?: boolean | null;
}

export class PropertyFacebookStatusQueryDto {
  @IsString()
  ids!: string;
}
