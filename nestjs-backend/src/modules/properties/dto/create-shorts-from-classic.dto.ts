import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Volitelné při generování videa z fotek (žádné video v klasickém inzerátu). */
export class CreateShortsFromClassicDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  musicKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  musicTrackId?: string;

  /** Náhodná aktivní skladba z knihovny (ignoruje `musicKey`, pokud není `musicTrackId`). */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  pickRandomLibraryTrack?: boolean;
}
