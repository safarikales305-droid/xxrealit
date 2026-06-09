import { IsBoolean, IsOptional } from 'class-validator';

export class RejectTopUpDto {
  @IsOptional()
  @IsBoolean()
  blockAccount?: boolean;
}
