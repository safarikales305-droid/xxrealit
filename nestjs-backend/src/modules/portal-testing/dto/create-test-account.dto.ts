import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

const ROLES = [
  'USER',
  'AGENT',
  'COMPANY',
  'AGENCY',
  'DEVELOPER',
  'PRIVATE_SELLER',
  'CRAFTSMAN',
  'TIPSTER',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
] as const;

export class CreateTestAccountDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsIn([...ROLES])
  role!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsInt()
  @Min(0)
  paidCredit!: number;

  @IsInt()
  @Min(0)
  bonusCredit!: number;

  @IsOptional()
  @IsString()
  testPhone?: string;

  @IsBoolean()
  emailVerified!: boolean;

  @IsBoolean()
  whatsappVerified!: boolean;

  @IsBoolean()
  profileApproved!: boolean;

  @IsBoolean()
  publicProfile!: boolean;

  @IsOptional()
  @IsBoolean()
  publicVisible?: boolean;
}
