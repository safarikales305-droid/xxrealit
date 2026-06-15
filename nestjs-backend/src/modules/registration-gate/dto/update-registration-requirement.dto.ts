import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateRegistrationRequirementDto {
  @IsOptional()
  @IsBoolean()
  requireFirstListing?: boolean;

  @IsOptional()
  @IsBoolean()
  requireFirstPost?: boolean;

  @IsOptional()
  @IsBoolean()
  requireFacebookPage?: boolean;

  @IsOptional()
  @IsBoolean()
  requireProfileComplete?: boolean;

  @IsOptional()
  @IsBoolean()
  requirePhoneVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  requireEmailVerified?: boolean;
}
