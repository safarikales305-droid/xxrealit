import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateBrokerPublicProfileDto {
  @IsOptional()
  @IsBoolean()
  isPublicBrokerProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  allowBrokerReviews?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  brokerOfficeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  brokerSpecialization?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brokerRegionLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  brokerWeb?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  brokerPhonePublic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  brokerEmailPublic?: string;
}
