import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
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

export class SubmitFinancialAdvisorRequestDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(200)
  brandName?: string;

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
  @ValidateIf((o: SubmitFinancialAdvisorRequestDto) => Boolean(o.ico && String(o.ico).trim()))
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

  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  specializations!: string[];

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(2000)
  avatarUrl?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(2000)
  logoUrl?: string;
}
