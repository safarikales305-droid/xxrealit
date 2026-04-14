import { IsNumber, Max, Min } from 'class-validator';

export class ImageCropDto {
  @IsNumber()
  @Min(-100)
  @Max(100)
  x!: number;

  @IsNumber()
  @Min(-100)
  @Max(100)
  y!: number;

  @IsNumber()
  @Min(0.5)
  @Max(3)
  zoom!: number;
}
