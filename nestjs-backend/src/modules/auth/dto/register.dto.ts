import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  Matches,
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

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'Telefon musí být ve formátu +420123456789.',
  })
  phone!: string;

  /** Free-form label or slug; mapped to Prisma UserRole in AuthService. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  role?: string;
}
