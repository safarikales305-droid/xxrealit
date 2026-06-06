import { IsNotEmpty, IsString } from 'class-validator';

export class FacebookConnectDto {
  @IsString()
  @IsNotEmpty()
  accessToken!: string;
}
