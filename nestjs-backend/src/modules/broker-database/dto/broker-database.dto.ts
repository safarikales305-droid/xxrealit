import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { BrokerDatabaseWhatsAppAudience } from '../../imported-broker-contacts/directory-import.types';

export class BrokerDirectoryImportDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  directoryUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;
}

export class BrokerDatabaseWhatsAppCampaignDto {
  audience!: BrokerDatabaseWhatsAppAudience;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  waMetaTemplateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  waTemplateName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  waTemplateLanguage?: string;

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

export class BrokerDatabaseEmailCampaignDto {
  title!: string;
  audience!: Record<string, unknown>;
  senderName?: string;
  minDaysBetweenSends?: number;
  templateKey?: string;
  steps?: Array<Record<string, unknown>>;
}
