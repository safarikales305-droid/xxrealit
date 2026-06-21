import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateTestAccountDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  paidCredit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bonusCredit?: number;

  @IsOptional()
  @IsString()
  testPhone?: string;

  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  profileApproved?: boolean;

  @IsOptional()
  @IsBoolean()
  publicProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  publicVisible?: boolean;
}
