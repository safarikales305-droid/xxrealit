import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { SocialPublishContentType, UserRole } from '@prisma/client';

export class UpdateFacebookAutopostDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

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
