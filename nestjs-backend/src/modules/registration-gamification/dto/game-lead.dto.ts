import { IsIn } from 'class-validator';
import { GAME_LEAD_STATUSES } from '../game-lead-status';

export class UpdateGameLeadStatusDto {
  @IsIn([...GAME_LEAD_STATUSES])
  status!: (typeof GAME_LEAD_STATUSES)[number];
}
