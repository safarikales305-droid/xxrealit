import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

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

  @IsOptional()
  @IsString()
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
