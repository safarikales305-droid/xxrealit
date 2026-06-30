import { IsBoolean } from 'class-validator';

export class PatchUserPublicProfileDto {
  @IsBoolean()
  isPublic!: boolean;
}
