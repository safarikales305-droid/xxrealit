import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

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

  @IsOptional()
  @IsString()
  @IsIn([
    'MAKLERI',
    'STAVEBNI_FIRMY',
    'REALITNI_KANCELARE',
    'FINANCNI_PORADCI',
    'INVESTORI',
    'REMESLNICI',
  ])
  category?:
    | 'MAKLERI'
    | 'STAVEBNI_FIRMY'
    | 'REALITNI_KANCELARE'
    | 'FINANCNI_PORADCI'
    | 'INVESTORI'
    | 'REMESLNICI';

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  externalUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  previewTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  previewDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  previewImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  previewSiteName?: string;
}
