import { IsBoolean, IsNumber, IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrefillListingFromUrlDto } from '../../properties/dto/prefill-listing-from-url.dto';

export class SrealityImportPreviewDto extends PrefillListingFromUrlDto {}

export class SrealityImportPublishSettingsDto {
  @IsOptional()
  @IsBoolean()
  createAiReel?: boolean;

  @IsOptional()
  @IsBoolean()
  publishFacebook?: boolean;

  @IsOptional()
  @IsBoolean()
  publishInstagram?: boolean;

  @IsOptional()
  @IsBoolean()
  publishYoutube?: boolean;

  @IsOptional()
  @IsBoolean()
  publishShorts?: boolean;
}

export class SrealityImportImageDto {
  @IsString()
  @MaxLength(2000)
  storedUrl!: string;

  @IsOptional()
  @IsString()
  watermarkedUrl?: string | null;

  @IsNumber()
  sortOrder!: number;

  @IsBoolean()
  isMain!: boolean;
}

export class SrealityImportPublishDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsString()
  @MaxLength(50_000)
  description!: string;

  @IsString()
  offerType!: string;

  @IsString()
  propertyType!: string;

  @IsOptional()
  @IsString()
  subType?: string;

  @IsOptional()
  @IsNumber()
  price?: number | null;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsString()
  city!: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  area?: number | null;

  @IsOptional()
  @IsNumber()
  landArea?: number | null;

  @IsOptional()
  @IsNumber()
  floor?: number | null;

  @IsOptional()
  @IsNumber()
  totalFloors?: number | null;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsString()
  construction?: string;

  @IsOptional()
  @IsString()
  ownership?: string;

  @IsOptional()
  @IsString()
  energyLabel?: string;

  @IsOptional()
  @IsString()
  equipment?: string;

  @IsOptional()
  @IsBoolean()
  parking?: boolean;

  @IsOptional()
  @IsBoolean()
  cellar?: boolean;

  @IsString()
  contactName!: string;

  @IsString()
  contactPhone!: string;

  @IsString()
  contactEmail!: string;

  @ValidateNested({ each: true })
  @Type(() => SrealityImportImageDto)
  images!: SrealityImportImageDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SrealityImportPublishSettingsDto)
  settings?: SrealityImportPublishSettingsDto;
}

export class SrealityImportRefreshDto {
  @IsString()
  propertyId!: string;

  @IsString()
  @MaxLength(2000)
  @IsUrl({ require_protocol: true })
  sourceUrl!: string;
}
