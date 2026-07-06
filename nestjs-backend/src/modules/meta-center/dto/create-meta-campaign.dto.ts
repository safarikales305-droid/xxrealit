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
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsNumber()
  @Min(1)
  @Max(80)
  radiusKm!: number;

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
}
