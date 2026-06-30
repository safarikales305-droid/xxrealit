import { IsBoolean } from 'class-validator';

export class UpdateMePublicProfileDto {
  @IsBoolean()
  isPublicProfile!: boolean;
}
