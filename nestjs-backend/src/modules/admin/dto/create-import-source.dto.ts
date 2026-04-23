import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateIf,
} from 'class-validator';
import { ListingImportMethod, ListingImportPortal } from '@prisma/client';

export class CreateImportSourceDto {
  @IsEnum(ListingImportPortal)
  portal!: ListingImportPortal;

  @IsEnum(ListingImportMethod)
  method!: ListingImportMethod;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  portalKey?: string;

  @IsOptional()
  @IsString()
  portalLabel?: string;

  @IsOptional()
  @IsString()
  categoryKey?: string;

  @IsOptional()
  @IsString()
  categoryLabel?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUrl({ require_protocol: true, require_tld: false })
  endpointUrl?: string | null;

  @IsOptional()
  @IsString()
  actorId?: string | null;

  @IsOptional()
  @IsString()
  actorTaskId?: string | null;

  @IsOptional()
  @IsString()
  datasetId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUrl({ require_protocol: true, require_tld: false })
  startUrl?: string | null;

  @IsOptional()
  @IsString()
  sourcePortal?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

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
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  settingsJson?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  credentialsJson?: Record<string, unknown> | null;
}
