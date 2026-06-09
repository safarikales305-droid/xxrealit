import { IsEmail, IsString, MinLength } from 'class-validator';

export class UnlockListingContactDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(9)
  phone!: string;
}
