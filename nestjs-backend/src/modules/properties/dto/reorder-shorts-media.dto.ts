import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderShortsMediaDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderedIds!: string[];
}
