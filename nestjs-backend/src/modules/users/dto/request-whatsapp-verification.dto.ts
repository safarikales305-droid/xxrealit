import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RequestWhatsAppVerificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;
}
