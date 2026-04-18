import { ListingImportMethod, ListingImportPortal } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class BulkDisableImportedDto {
  @IsOptional()
  @IsEnum(ListingImportPortal)
  source?: ListingImportPortal;

  @IsOptional()
  @IsEnum(ListingImportMethod)
  method?: ListingImportMethod;
}

