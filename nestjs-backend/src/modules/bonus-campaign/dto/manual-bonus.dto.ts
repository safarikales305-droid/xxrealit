import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ManualBonusGrantDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class ManualBonusRevokeDto {
  @IsString()
  claimId!: string;
}
