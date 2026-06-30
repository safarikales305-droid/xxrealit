import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListingViewSource } from '@prisma/client';

export class RecordListingViewDto {
  @IsEnum(ListingViewSource)
  source!: ListingViewSource;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  visitorId?: string;
}
