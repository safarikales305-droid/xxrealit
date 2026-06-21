import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDeveloperNoteDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED'])
  status?: 'OPEN' | 'RESOLVED';
}
