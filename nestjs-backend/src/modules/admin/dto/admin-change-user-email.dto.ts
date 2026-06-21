import { IsEmail } from 'class-validator';

export class AdminChangeUserEmailDto {
  @IsEmail()
  email!: string;
}
