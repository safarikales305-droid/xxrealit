import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateRegistrationGateDto {
  @IsOptional()
  @IsBoolean()
  requireFirstContent?: boolean;

  @IsOptional()
  @IsBoolean()
  shortsGateEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  shortsGateAfterViews?: number;

  @IsOptional()
  @IsString()
  @IsIn(['BANNER', 'VIDEO'])
  gateType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  buttonText?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string | null;

  @IsOptional()
  @IsString()
  bannerImageUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  skipAfterSeconds?: number;
}
