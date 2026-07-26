import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  defaultModel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  dailyRequestLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  monthlyBudgetCzk?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(16_000)
  maxOutputTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(5_000)
  @Max(300_000)
  timeoutMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  maxRetries?: number;

  @IsOptional()
  @IsBoolean()
  seoEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  listingDescriptionEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  socialPostEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  supportEnabled?: boolean;
}
