import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAiChatSettingsDto {
  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  publicChatEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  testModeEnabled?: boolean;
}
