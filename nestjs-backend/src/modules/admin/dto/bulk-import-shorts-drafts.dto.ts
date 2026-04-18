import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Hromadná tvorba shorts konceptů z importovaných klasických inzerátů (admin). */
export class BulkImportShortsDraftsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourcePortalKey?: string;

  /** Klíč kategorie importní větve (např. byty, domy). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  importCategoryKey?: string;

  /** Část názvu města (case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  /** Jen inzeráty importované v posledních 48 h (nové importy). */
  @IsOptional()
  @IsBoolean()
  onlyNewImports?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  propertyIds?: string[];
}
