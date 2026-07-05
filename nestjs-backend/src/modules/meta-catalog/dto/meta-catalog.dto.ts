import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateMetaCatalogSettingDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  carouselListingIds?: string[];
}

export class MetaCatalogCarouselQueryDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  propertyType?: string;

  @IsOptional()
  @IsString()
  priceMin?: string;

  @IsOptional()
  @IsString()
  priceMax?: string;
}
