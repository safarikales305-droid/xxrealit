import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateMetaCampaignDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  objective!: string;

  @IsOptional()
  @IsString()
  propertyType?: string;

  @IsString()
  cityName!: string;

  @IsOptional()
  @IsString()
  metaGeoKey?: string;

  @IsOptional()
  @IsString()
  metaGeoCountry?: string;

  @IsOptional()
  @IsString()
  metaGeoRegion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(80)
  radiusKm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  dailyBudgetCzk!: number;

  @IsString()
  startDate!: string;

  @IsString()
  endDate!: string;

  @IsArray()
  @IsString({ each: true })
  selectedProductIds!: string[];

  @IsOptional()
  @IsString()
  creativeType?: string;

  @IsOptional()
  @IsString()
  targetingMode?: string;

  @IsOptional()
  @IsString()
  audienceId?: string;

  @IsOptional()
  creativePayload?: Record<string, unknown>;

  /** Meta Lead Form ID — promoted_object pouze pokud je vyplněno. */
  @IsOptional()
  @IsString()
  leadFormId?: string;

  /** city = celé město (Meta Geo key bez radius), radius = okruh přes custom_locations */
  @IsOptional()
  @IsString()
  locationTargetingMode?: string;

  /** FACEBOOK_ONLY vynutí pouze Facebook placements bez Instagramu */
  @IsOptional()
  @IsString()
  placementPreference?: string;
}
