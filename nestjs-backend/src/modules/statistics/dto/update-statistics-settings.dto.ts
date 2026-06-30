import { IsBoolean, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateStatisticsSettingsDto {
  @IsOptional() @IsBoolean() shortsViewsAutopilotEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) shortsViewsRatePerHour?: number;
  @IsOptional() @IsInt() @Min(0) shortsViewsRateMin?: number;
  @IsOptional() @IsInt() @Min(0) shortsViewsRateMax?: number;
  @IsOptional() @IsInt() @Min(1) shortsViewsIntervalMinutes?: number;
  @IsOptional() @IsInt() @Min(0) shortsViewsMaxPerDay?: number;
  @IsOptional() @IsInt() @Min(0) shortsViewsMaxTotal?: number;

  @IsOptional() @IsBoolean() classicViewsAutopilotEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) classicViewsRatePerHour?: number;
  @IsOptional() @IsInt() @Min(0) classicViewsRateMin?: number;
  @IsOptional() @IsInt() @Min(0) classicViewsRateMax?: number;
  @IsOptional() @IsInt() @Min(1) classicViewsIntervalMinutes?: number;
  @IsOptional() @IsInt() @Min(0) classicViewsMaxPerDay?: number;
  @IsOptional() @IsInt() @Min(0) classicViewsMaxTotal?: number;

  @IsOptional() @IsInt() @Min(0) newListingBoostHours?: number;
  @IsOptional() @IsNumber() @Min(1) newListingBoostMultiplier?: number;

  @IsOptional() @IsBoolean() postsLikesAutopilotEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) postsLikesRatePerHour?: number;
  @IsOptional() @IsInt() @Min(0) postsLikesRateMin?: number;
  @IsOptional() @IsInt() @Min(0) postsLikesRateMax?: number;
  @IsOptional() @IsInt() @Min(1) postsLikesIntervalMinutes?: number;
  @IsOptional() @IsInt() @Min(0) postsLikesMaxPerDay?: number;
  @IsOptional() @IsInt() @Min(0) postsLikesMaxTotal?: number;
  @IsOptional() @IsInt() @Min(0) postsLikesAfter24hMax?: number;

  @IsOptional() @IsInt() @Min(1) viewDedupHours?: number;
}
