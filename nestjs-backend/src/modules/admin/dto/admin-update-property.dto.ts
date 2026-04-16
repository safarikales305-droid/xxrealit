import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  city?: string;

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
