import { IsBoolean } from 'class-validator';

export class FacebookSyncToggleDto {
  @IsBoolean()
  syncEnabled!: boolean;
}
