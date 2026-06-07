import { ShareGateTargetType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateShareGateVideoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  videoUrl?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  posterUrl?: string | null;

  @IsOptional()
  @IsEnum(ShareGateTargetType)
  targetType?: ShareGateTargetType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  minWatchSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  buttonText?: string;

  @IsOptional()
  @IsDateString()
  activeFrom?: string | null;

  @IsOptional()
  @IsDateString()
  activeTo?: string | null;
}
