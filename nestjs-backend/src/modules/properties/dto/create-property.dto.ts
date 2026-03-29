import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePropertyDto {
  @IsString()
  @MinLength(1, { message: 'title must not be empty' })
  title: string;

  @Type(() => Number)
  @IsInt({ message: 'price must be an integer' })
  @Min(0, { message: 'price must be zero or greater' })
  price: number;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'videoUrl must not be empty when provided' })
  videoUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'city must not be empty when provided' })
  city?: string;

  /** When omitted, the first user in the database is used (handy for local dev). */
  @IsOptional()
  @IsUUID('all', { message: 'userId must be a valid UUID' })
  userId?: string;
}
