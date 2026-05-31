import { ArrayMinSize, IsArray, IsString, IsUrl } from 'class-validator';

export class ReorderTiparMediaDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderedUrls!: string[];
}
