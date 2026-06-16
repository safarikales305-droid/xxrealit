import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CommunicationEmailSendDto {
  @IsEmail()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  subject!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20000)
  body!: string;

  @IsOptional()
  @IsUUID()
  listingId?: string;
}

export class CommunicationEmailBulkDto {
  @IsArray()
  @IsEmail({}, { each: true })
  recipients!: string[];

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  subject!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20000)
  body!: string;
}

export class CommunicationEmailScheduleDto extends CommunicationEmailBulkDto {
  @IsISO8601()
  scheduledAt!: string;
}
