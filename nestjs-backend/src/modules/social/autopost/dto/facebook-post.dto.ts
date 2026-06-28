import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { SocialPublishContentType } from '@prisma/client';

export class FacebookPostDto {
  /** Testovací příspěvek na stránku XXREALIT. */
  @IsOptional()
  @IsBoolean()
  test?: boolean;

  /** Hromadné / jednotlivé publikování inzerátů. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  propertyIds?: string[];

  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsBoolean()
  publishAsReel?: boolean;

  /** Ruční zařazení jednoho obsahu do fronty. */
  @IsOptional()
  @IsEnum(SocialPublishContentType)
  contentType?: SocialPublishContentType;

  @IsOptional()
  @IsString()
  contentId?: string;
}
