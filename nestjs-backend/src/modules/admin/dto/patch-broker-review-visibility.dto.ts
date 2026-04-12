import { IsBoolean } from 'class-validator';

export class PatchBrokerReviewVisibilityDto {
  @IsBoolean()
  isVisible!: boolean;
}
