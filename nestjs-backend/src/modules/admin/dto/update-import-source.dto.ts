import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsObject, IsString, Min } from 'class-validator';

export class UpdateImportSourceDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  intervalMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limitPerRun?: number;

  @IsOptional()
  @IsString()
  endpointUrl?: string | null;

  @IsOptional()
  @IsObject()
  credentialsJson?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  settingsJson?: Record<string, unknown> | null;
}

