import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsUrl,
  Min,
  ValidateIf,
} from 'class-validator';

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

  /** Prázdné / null smaže URL; neprázdný řetězec musí být platná http(s) URL. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUrl({ require_protocol: true, require_tld: true })
  endpointUrl?: string | null;

  @IsOptional()
  @IsObject()
  credentialsJson?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  settingsJson?: Record<string, unknown> | null;
}

