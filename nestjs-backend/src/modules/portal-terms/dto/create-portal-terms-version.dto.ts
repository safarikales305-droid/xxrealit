import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePortalTermsVersionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(10)
  termsHtml!: string;

  @IsString()
  @MinLength(10)
  rulesHtml!: string;

  @IsString()
  @MinLength(5)
  operatorContact!: string;

  @IsOptional()
  @IsBoolean()
  publish?: boolean;

  @IsOptional()
  @IsBoolean()
  requireReacceptOnLogin?: boolean;
}
