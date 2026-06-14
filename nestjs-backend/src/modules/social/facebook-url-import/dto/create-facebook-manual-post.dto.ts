import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFacebookManualPostDto {
  @IsString()
  @MaxLength(500)
  postUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;
}
