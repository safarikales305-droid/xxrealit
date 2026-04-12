import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

function toBool(v: unknown): boolean {
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  return false;
}

export class PatchPremiumBrokerDto {
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  isPremiumBroker!: boolean;
}
