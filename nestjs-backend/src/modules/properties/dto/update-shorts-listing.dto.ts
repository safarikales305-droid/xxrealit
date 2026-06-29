import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Transform, Type } from 'class-transformer';

function toBool(v: unknown): boolean | undefined {
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  if (v === false || v === 'false' || v === 0 || v === '0') return false;
  return undefined;
}

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

  @IsOptional()
  @IsString()
  @MaxLength(80)
  overlayText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  overlayStyle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  overlayFont?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  overlayColor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  overlayFontSize?: number;

  @IsOptional()
  @IsIn(['left', 'center', 'right'])
  overlayPosition?: string;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  showLogo?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  showOverlayText?: boolean;
}
