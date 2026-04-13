import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class SubmitAgencyRequestDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  agencyName!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  contactFullName!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(5)
  @MaxLength(40)
  phone!: string;

  @Transform(({ value }) => trimString(value))
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(20)
  @ValidateIf((o: SubmitAgencyRequestDto) => Boolean(o.ico && String(o.ico).trim()))
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
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  agentCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  branchCities?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'string') return undefined;
    const t = value.trim();
    return t.length ? t.slice(0, 2000) : undefined;
  })
  @IsString()
  @MaxLength(2000)
  logoUrl?: string;
}
