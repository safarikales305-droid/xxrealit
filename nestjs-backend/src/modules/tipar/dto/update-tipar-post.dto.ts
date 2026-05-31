import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateTiparPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60_000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  videoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  propertyPrice?: number;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  ownerNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactEmail?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  contactUnlockPrice?: number;

  @IsOptional()
  @IsBoolean()
  isShorts?: boolean;
}
