import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateCreditSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  bankCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  minAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  maxAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentMessage?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  confirmDeadlineDays?: number;
}
