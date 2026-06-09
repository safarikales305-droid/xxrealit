import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateContactMonetizationDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  tipPortalPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  tipTipsterPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  ownerListingContactPrice?: number;
}
