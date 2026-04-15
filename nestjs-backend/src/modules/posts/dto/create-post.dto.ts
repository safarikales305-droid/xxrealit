import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

  @IsOptional()
  @IsString()
  @IsIn([
    'MAKLERI',
    'STAVEBNI_FIRMY',
    'REALITNI_KANCELARE',
    'FINANCNI_PORADCI',
    'INVESTORI',
  ])
  category?:
    | 'MAKLERI'
    | 'STAVEBNI_FIRMY'
    | 'REALITNI_KANCELARE'
    | 'FINANCNI_PORADCI'
    | 'INVESTORI';
}
