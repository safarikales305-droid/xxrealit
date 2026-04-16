import { IsBoolean } from 'class-validator';

export class UpdateProfileVisibilityDto {
  @IsBoolean()
  isPublic!: boolean;
}
