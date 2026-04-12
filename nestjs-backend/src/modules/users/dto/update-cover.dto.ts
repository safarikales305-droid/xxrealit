import { IsString, MinLength } from 'class-validator';

export class UpdateCoverDto {
  @IsString()
  @MinLength(1, { message: 'coverImageUrl je povinný řetězec.' })
  coverImageUrl!: string;
}
