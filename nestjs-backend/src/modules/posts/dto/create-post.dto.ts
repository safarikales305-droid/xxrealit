import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePostDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  description?: string;
}
