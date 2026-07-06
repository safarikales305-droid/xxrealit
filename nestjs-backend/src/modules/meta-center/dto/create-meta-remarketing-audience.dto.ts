import { IsNumber, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMetaRemarketingAudienceDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  audienceType!: string;

  @IsOptional()
  @IsObject()
  filters?: {
    city?: string | null;
    district?: string | null;
    region?: string | null;
    propertyType?: string | null;
    priceFrom?: number | null;
    priceTo?: number | null;
    offerType?: string | null;
    retentionDays?: number | null;
    listingId?: string | null;
  };

  @IsOptional()
  @IsNumber()
  retentionDays?: number;
}
