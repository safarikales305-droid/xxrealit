import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAvatarDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  avatarUrl!: string;
}
