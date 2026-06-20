import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class ConfirmWhatsAppVerificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @Matches(/^\d{4,8}$/, { message: 'Zadejte platný ověřovací kód.' })
  code!: string;
}
