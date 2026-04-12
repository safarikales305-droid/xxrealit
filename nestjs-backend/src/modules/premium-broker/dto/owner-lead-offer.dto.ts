import { IsString, MaxLength, MinLength } from 'class-validator';

export class OwnerLeadOfferDto {
  @IsString()
  @MinLength(10)
  @MaxLength(900)
  message!: string;
}
