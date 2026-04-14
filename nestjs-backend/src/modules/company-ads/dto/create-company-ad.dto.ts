import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCompanyAdDto {
  @IsString()
  @MaxLength(500)
  imageUrl!: string;

  @IsString()
  @MaxLength(80)
  title!: string;

  @IsString()
  @MaxLength(400)
  description!: string;

  @IsString()
  @MaxLength(64)
  ctaText!: string;

  @IsString()
  @MaxLength(500)
  targetUrl!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(48, { each: true })
  categories!: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fallbackContactUrl?: string;
}
