import { IsString, MaxLength, MinLength } from 'class-validator';

export class AddShortsMediaUrlDto {
  @IsString()
  @MinLength(4)
  @MaxLength(2000)
  imageUrl!: string;
}
