import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePurchaseAdviceArticleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
