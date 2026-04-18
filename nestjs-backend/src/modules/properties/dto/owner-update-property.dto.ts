import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function toBool(v: unknown): boolean {
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  return false;
}

export class OwnerUpdatePropertyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  propertyType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  area?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  landArea?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  floor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  totalFloors?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  condition?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  construction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownership?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  energyLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  equipment?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(24)
  images?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  videoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  contactEmail?: string;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  parking?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  cellar?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  isOwnerListing?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  ownerContactConsent?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
