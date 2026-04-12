import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

function toBool(v: unknown): boolean | undefined {
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  if (v === false || v === 'false' || v === 0 || v === '0') return false;
  return undefined;
}

export class UpdateBrokerLeadPrefsDto {
  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  brokerLeadNotificationEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  brokerPreferredRegions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  brokerPreferredPropertyTypes?: string[];
}
