import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePublicPortalStatDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsNumber()
  realValue?: number;

  @IsOptional()
  @IsNumber()
  multiplier?: number;

  @IsOptional()
  @IsNumber()
  manualValue?: number | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsString()
  valueSource?: 'manual' | 'database' | 'api';
}

export class UpdatePublicPortalStatsDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePublicPortalStatDto)
  stats?: UpdatePublicPortalStatDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertPublicPortalMonthlyStatDto)
  monthly?: UpsertPublicPortalMonthlyStatDto[];
}

export class UpsertPublicPortalMonthlyStatDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  month!: string;

  @IsOptional()
  @IsNumber()
  visits?: number;

  @IsOptional()
  @IsNumber()
  views?: number;

  @IsOptional()
  @IsNumber()
  socialReach?: number;

  @IsOptional()
  @IsNumber()
  leads?: number;

  @IsOptional()
  @IsNumber()
  multiplier?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CreateLeadPriceDto {
  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsInt()
  @Min(0)
  priceCzk!: number;

  @IsInt()
  @Min(0)
  priceCredits!: number;

  @IsString()
  appliesToRoles!: string;

  @IsOptional()
  @IsString()
  billedToLabel?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateLeadPriceDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCzk?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCredits?: number;

  @IsOptional()
  @IsString()
  appliesToRoles?: string;

  @IsOptional()
  @IsString()
  billedToLabel?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}
