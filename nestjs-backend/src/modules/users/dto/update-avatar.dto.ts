import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { ImageCropDto } from './image-crop.dto';

export class UpdateAvatarDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  avatarUrl!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ImageCropDto)
  crop?: ImageCropDto;
}
