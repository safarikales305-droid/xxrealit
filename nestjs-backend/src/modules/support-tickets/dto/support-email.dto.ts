import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateSupportEmailSettingsDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  adminNotifyEmail?: string | null;
}

export class CreateSupportEmailMailboxDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  replyToEmail?: string | null;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  smtpHost!: string;

  @IsInt()
  @Min(1)
  smtpPort!: number;

  @IsBoolean()
  smtpSecure!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  smtpUser!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  smtpPassword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  imapHost?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  imapPort?: number | null;

  @IsOptional()
  @IsBoolean()
  imapSecure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  imapUser?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imapPassword?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  signatureHtml?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  signatureText?: string;

  @IsOptional()
  @IsBoolean()
  autoReplyEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  autoReplySubject?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  autoReplyHtml?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  autoReplyText?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateSupportEmailMailboxDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  replyToEmail?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  smtpUser?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  smtpPassword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  imapHost?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  imapPort?: number | null;

  @IsOptional()
  @IsBoolean()
  imapSecure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  imapUser?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imapPassword?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  signatureHtml?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  signatureText?: string;

  @IsOptional()
  @IsBoolean()
  autoReplyEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  autoReplySubject?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  autoReplyHtml?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  autoReplyText?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class InboundSupportEmailWebhookDto {
  @IsString()
  @MinLength(10)
  rawMime!: string;
}
