import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

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

  @IsOptional()
  @IsInt()
  @Min(0)
  leadPriceClassic?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadPriceShorts?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadPriceDeveloper?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadPriceCompany?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  tipMinContactPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  tipMaxContactPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  tipSuccessBonus?: number;

  @IsOptional()
  @IsBoolean()
  showSellerContactToBuyer?: boolean;
}
