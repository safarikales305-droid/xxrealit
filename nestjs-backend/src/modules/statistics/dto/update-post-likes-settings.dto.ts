import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdatePostLikesSettingsDto {
  @IsOptional() @IsInt() @Min(0) manualLikes?: number;
  @IsOptional() @IsBoolean() likesAutopilotEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) likesAutopilotRatePerHour?: number | null;
  @IsOptional() @IsInt() @Min(0) likesAutopilotMaxTotal?: number | null;
}
