import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class RoleRateDto {
  @IsString()
  role!: string;

  @IsInt()
  @Min(0)
  percent!: number;
}

export class UpdateWorkerCommissionSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  defaultPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minTopUpAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleRateDto)
  roleRates?: RoleRateDto[];
}
