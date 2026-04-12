import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

const BIO_MAX = 500;

export class UpdateProfileDto {
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
