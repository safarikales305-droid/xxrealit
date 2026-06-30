import { IsBoolean } from 'class-validator';

export class UpdateMePublicProfileDto {
  @IsBoolean()
  publicProfile!: boolean;
}
