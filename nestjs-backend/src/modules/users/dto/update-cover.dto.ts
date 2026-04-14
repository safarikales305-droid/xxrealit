import { Type } from 'class-transformer';
import { IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { ImageCropDto } from './image-crop.dto';

export class UpdateCoverDto {
  @IsString()
  @MinLength(1, { message: 'coverImageUrl je povinný řetězec.' })
  coverImageUrl!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ImageCropDto)
  crop?: ImageCropDto;
}
