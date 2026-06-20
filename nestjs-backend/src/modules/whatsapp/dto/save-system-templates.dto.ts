import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveSystemTemplatesDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  whatsappVerifyMetaTemplateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  whatsappVerifyTemplateName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsappVerifyTemplateLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  whatsappVerifyUrlButtonParameter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  welcomeMetaTemplateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  welcomeTemplateName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  welcomeTemplateLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  welcomeUrlButtonParameter?: string;

  @IsOptional()
  @IsBoolean()
  welcomeEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  postUploadedAuthorMetaTemplateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  postUploadedTemplateName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postUploadedTemplateLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  postUploadedUrlButtonParameter?: string;

  @IsOptional()
  @IsBoolean()
  postNotifyAuthorEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  newPostNotificationMetaTemplateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  newPostTemplateName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  newPostTemplateLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  newPostUrlButtonParameter?: string;

  @IsOptional()
  @IsBoolean()
  postNotifyFollowersEnabled?: boolean;
}
