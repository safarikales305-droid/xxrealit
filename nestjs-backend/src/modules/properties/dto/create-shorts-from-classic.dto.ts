import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
