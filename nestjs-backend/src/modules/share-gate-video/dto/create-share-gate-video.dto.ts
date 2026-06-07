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

export class CreateShareGateVideoDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  videoUrl!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  posterUrl?: string;

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
  activeFrom?: string;

  @IsOptional()
  @IsDateString()
  activeTo?: string;
}
