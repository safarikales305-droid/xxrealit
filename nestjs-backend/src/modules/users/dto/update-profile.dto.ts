import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

const BIO_MAX = 500;

export class UpdateProfileDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'Telefon musí být ve formátu +420123456789.',
  })
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @ValidateIf((_, v) => v !== undefined)
  @IsBoolean()
  phonePublic?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined) return undefined;
    if (value === null) return null;
    return typeof value === 'string' ? value.trim() : value;
  })
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(BIO_MAX, {
    message: `Bio může mít maximálně ${BIO_MAX} znaků.`,
  })
  bio?: string | null;
}
