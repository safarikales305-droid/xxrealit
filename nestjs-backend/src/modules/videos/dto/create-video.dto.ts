import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVideoDto {
  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
