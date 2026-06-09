import { IsInt, Max, Min } from 'class-validator';

export class TopUpCreditDto {
  @IsInt()
  @Min(1)
  amount!: number;
}
