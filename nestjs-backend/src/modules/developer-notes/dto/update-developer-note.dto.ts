import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDeveloperNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED'])
  status?: 'OPEN' | 'RESOLVED';
}
