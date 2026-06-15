import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateReferralInviteDto {
  @IsIn(['EMAIL', 'WHATSAPP'])
  channel!: 'EMAIL' | 'WHATSAPP';

  @IsOptional()
  @IsString()
  @MaxLength(320)
  target?: string;
}
