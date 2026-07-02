import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SupportTicketCategory } from '@prisma/client';

export class CreateSupportTicketDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsString()
  @MinLength(6)
  @MaxLength(30)
  phone!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(30)
  whatsapp!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @IsEnum(SupportTicketCategory)
  category!: SupportTicketCategory;

  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  message!: string;

  @IsBoolean()
  gdprConsent!: boolean;

  @IsBoolean()
  contactConsent!: boolean;
}

export class CreateSupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
}

export class AdminReplySupportMessageDto extends CreateSupportMessageDto {
  @IsOptional()
  @IsBoolean()
  isInternalNote?: boolean;

  @IsOptional()
  @IsString()
  mailboxId?: string;
}

export class AdminUpdateSupportTicketDto {
  @IsOptional()
  @IsEnum(['NEW', 'WAITING_REPLY', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'])
  status?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string | null;
}

export class AdminListSupportTicketsQuery {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
