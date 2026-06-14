import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateFacebookUrlImportDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined) return null;
    if (value === null) return null;
    return typeof value === 'string' ? value.trim() : value;
  })
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @MaxLength(500)
  facebookUrl?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @ValidateIf((_, v) => v !== undefined)
  @IsBoolean()
  facebookImportEnabled?: boolean;
}
