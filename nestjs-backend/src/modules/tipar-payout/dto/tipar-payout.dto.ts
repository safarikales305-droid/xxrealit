import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { TiparPayoutStatus } from '@prisma/client';

export class CreateTiparPayoutRequestDto {
  @IsInt()
  @Min(1)
  amount!: number;
}

export class UpdateTiparPayoutStatusDto {
  @IsEnum(TiparPayoutStatus)
  status!: TiparPayoutStatus;

  @IsOptional()
  @IsString()
  @MinLength(0)
  adminNote?: string;
}
