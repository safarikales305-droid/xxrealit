import { IsBoolean } from 'class-validator';

export class RequestProfessionalVerificationDto {
  @IsBoolean()
  requestVerification!: boolean;

  @IsBoolean()
  publishAfterApproval!: boolean;
}
