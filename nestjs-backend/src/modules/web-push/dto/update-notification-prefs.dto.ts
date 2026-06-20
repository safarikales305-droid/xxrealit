import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPrefsDto {
  @IsOptional()
  @IsBoolean()
  notifyNewPosts?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyNewMessages?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyWhatsAppAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyPwaPush?: boolean;
}
