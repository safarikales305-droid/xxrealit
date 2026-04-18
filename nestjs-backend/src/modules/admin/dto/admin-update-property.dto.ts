import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ArrayMaxSize,
  IsUrl,
} from 'class-validator';

export class AdminUpdatePropertyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['SHORTS', 'CLASSIC'])
  listingType?: string;

  /** ISO datum/čas nebo prázdný řetězec pro null */
  @IsOptional()
  @IsString()
  activeFrom?: string | null;

  @IsOptional()
  @IsString()
  activeUntil?: string | null;

  @IsOptional()
  @IsBoolean()
  restore?: boolean;

  @IsOptional()
  @IsBoolean()
  importDisabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @IsUrl({ require_tld: false }, { each: true })
  images?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  viewsCount?: number;

  @IsOptional()
  @IsBoolean()
  autoViewsEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  autoViewsIncrement?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  autoViewsIntervalMinutes?: number;
}
