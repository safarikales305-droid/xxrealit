import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

export class UpdateWhatsAppSettingsDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim() !== '')
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'WhatsApp číslo musí být ve formátu +420123456789.',
  })
  whatsappPhone?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  whatsappEnabled?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  whatsappMarketingOptOut?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  whatsappNotifyMyUploads?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  whatsappNotifyNewPosts?: boolean;
}
