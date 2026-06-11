import { IsNotEmpty, IsString } from 'class-validator';

export class FacebookSelectPageDto {
  @IsString()
  @IsNotEmpty()
  pageId!: string;
}
