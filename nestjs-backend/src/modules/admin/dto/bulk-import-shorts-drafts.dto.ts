import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Hromadná tvorba shorts konceptů z importovaných klasických inzerátů (admin). */
export class BulkImportShortsDraftsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourcePortalKey?: string;

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
