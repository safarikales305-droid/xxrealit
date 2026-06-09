import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTiparPostDto {
  @IsString()
  @MaxLength(400)
  title!: string;

  @IsString()
  @MaxLength(60_000)
  description!: string;

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

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  contactName!: string;

  @IsString()
  @MinLength(9)
  @MaxLength(40)
  contactPhone!: string;

  @IsEmail()
  @MaxLength(320)
  contactEmail!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  contactUnlockPrice?: number;

  @IsOptional()
  @IsBoolean()
  isShorts?: boolean;
}
