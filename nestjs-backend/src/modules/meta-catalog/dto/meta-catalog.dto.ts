import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SYNC_INTERVAL_OPTIONS } from '../meta-catalog.fields';

export class UpdateMetaCatalogSettingDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  carouselListingIds?: string[];

  @IsOptional()
  @IsBoolean()
  allowContactExport?: boolean;

  @IsOptional()
  @IsObject()
  exportFieldFlags?: Record<string, boolean>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @IsIn([...SYNC_INTERVAL_OPTIONS])
  syncIntervalMinutes?: number;
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

export class MetaCatalogSyncDto {
  @IsOptional()
  @IsString()
  @IsIn(['full', 'delta', 'repair', 'refresh', 'clear-cache', 'regenerate', 'restart'])
  mode?: string;
}
