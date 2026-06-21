import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  Matches,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
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

  @IsOptional()
  @IsString()
  @MaxLength(32)
  referralCode?: string;

  @IsOptional()
  @IsBoolean()
  wantsPortalWorker?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsBoolean()
  portalWorkerCooperationConsent?: boolean;
}
