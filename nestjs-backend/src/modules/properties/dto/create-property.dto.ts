import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
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

export class CreatePropertyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50_000)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  price!: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  /** Typ nabídky: prodej | pronájem */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  type!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  propertyType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  city!: string;

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
  @MaxLength(10_000)
  equipment?: string;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  parking?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  cellar?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(24)
  images?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  videoUrl?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  contactName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(40)
  contactPhone!: string;

  @IsEmail()
  @MaxLength(320)
  contactEmail!: string;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  isOwnerListing?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  ownerContactConsent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;
}
