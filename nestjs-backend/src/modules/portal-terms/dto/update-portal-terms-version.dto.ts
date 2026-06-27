import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePortalTermsVersionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  termsHtml?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  rulesHtml?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  operatorContact?: string;

  @IsOptional()
  @IsBoolean()
  requireReacceptOnLogin?: boolean;
}
