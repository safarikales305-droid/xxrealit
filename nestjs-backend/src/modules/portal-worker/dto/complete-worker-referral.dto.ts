import { IsOptional, IsString, MinLength } from 'class-validator';

export class CompleteWorkerReferralDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
