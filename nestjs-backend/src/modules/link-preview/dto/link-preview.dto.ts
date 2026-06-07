import { IsString, MaxLength, MinLength } from 'class-validator';

export class LinkPreviewDto {
  @IsString()
  @MinLength(8)
  @MaxLength(2048)
  url!: string;
}
