import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /** Free-form label or slug; mapped to Prisma UserRole in AuthService. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  role?: string;
}
