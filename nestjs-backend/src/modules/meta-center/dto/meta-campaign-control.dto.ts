import { IsIn, IsString } from 'class-validator';

export class MetaCampaignControlDto {
  @IsString()
  @IsIn(['activate', 'pause', 'resume', 'delete'])
  action!: 'activate' | 'pause' | 'resume' | 'delete';
}
