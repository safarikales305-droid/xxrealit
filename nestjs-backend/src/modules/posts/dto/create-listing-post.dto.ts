import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateListingPostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  description!: string;

  @IsString()
  price!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @IsOptional()
  @IsString()
  @IsIn(['post', 'short'])
  type?: 'post' | 'short';

  @IsOptional()
  @IsString()
  @IsIn(['MAKLERI', 'STAVEBNI_FIRMY', 'REMESLNICI', 'REALITNI_KANCELARE'])
  category?: 'MAKLERI' | 'STAVEBNI_FIRMY' | 'REMESLNICI' | 'REALITNI_KANCELARE';

  /** JSON array of original image filenames in the chosen order. */
  @IsOptional()
  @IsString()
  imageOrder?: string;
}
