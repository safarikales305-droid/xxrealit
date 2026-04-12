import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class SubmitAgentRequestDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  companyName!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(5)
  @MaxLength(40)
  phone!: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(20)
  @ValidateIf((o: SubmitAgentRequestDto) => Boolean(o.ico && String(o.ico).trim()))
  @Matches(/^\d{8}$/, { message: 'IČO musí mít 8 číslic' })
  ico?: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  bio!: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'string') return undefined;
    const t = value.trim();
    return t.length ? t.slice(0, 2000) : undefined;
  })
  @IsString()
  @MaxLength(2000)
  avatarUrl?: string;
}
