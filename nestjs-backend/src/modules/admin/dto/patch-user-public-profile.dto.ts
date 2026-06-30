import { IsBoolean } from 'class-validator';

export class PatchUserPublicProfileDto {
  @IsBoolean()
  publicProfile!: boolean;
}
