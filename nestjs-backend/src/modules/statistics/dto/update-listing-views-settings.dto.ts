import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateListingViewsSettingsDto {
  @IsOptional() @IsInt() @Min(0) manualViews?: number;
  @IsOptional() @IsBoolean() viewsAutopilotEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) viewsAutopilotRatePerHour?: number | null;
  @IsOptional() @IsInt() @Min(0) viewsAutopilotRateMin?: number | null;
  @IsOptional() @IsInt() @Min(0) viewsAutopilotRateMax?: number | null;
  @IsOptional() @IsInt() @Min(1) viewsAutopilotIntervalMinutes?: number | null;
  @IsOptional() @IsInt() @Min(0) viewsAutopilotMaxPerDay?: number | null;
  @IsOptional() @IsInt() @Min(0) viewsAutopilotMaxTotal?: number | null;

  /** Zpětná kompatibilita s admin UI. */
  @IsOptional() @IsInt() @Min(0) viewsCount?: number;
  @IsOptional() @IsBoolean() autoViewsEnabled?: boolean;
  @IsOptional() @IsInt() @Min(1) autoViewsIncrement?: number;
  @IsOptional() @IsInt() @Min(1) autoViewsIntervalMinutes?: number;
}
