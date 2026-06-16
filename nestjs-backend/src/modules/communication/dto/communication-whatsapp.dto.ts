import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CommunicationWhatsAppSendDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^\+?[0-9]{9,15}$/, { message: 'Neplatné telefonní číslo.' })
  toPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(4096)
  message!: string;

  @IsOptional()
  @IsUUID()
  listingId?: string;
}

export class CommunicationWhatsAppListingLeadsDto {
  @IsUUID()
  listingId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(4096)
  message!: string;
}
