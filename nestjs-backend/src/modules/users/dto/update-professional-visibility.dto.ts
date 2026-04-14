import { IsBoolean } from 'class-validator';

export class UpdateProfessionalVisibilityDto {
  @IsBoolean()
  isPublic!: boolean;
}
