import { IsInt, Min } from 'class-validator';

export class PatchUserCreditDto {
  @IsInt()
  @Min(0)
  creditBalance!: number;
}
