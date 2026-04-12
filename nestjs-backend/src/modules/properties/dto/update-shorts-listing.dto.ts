import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateShortsListingDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @IsOptional()
  @IsIn(['draft', 'ready'])
  status?: 'draft' | 'ready';

  /** null / prázdný řetězec = bez skladby z knihovny (použije se vestavěná / bez hudby). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(80)
  musicTrackId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  musicUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  musicBuiltinKey?: string;
}
