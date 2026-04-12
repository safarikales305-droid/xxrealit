import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class PatchShortsMediaDto {
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(30)
  duration?: number;

  @IsOptional()
  @IsBoolean()
  isCover?: boolean;
}
