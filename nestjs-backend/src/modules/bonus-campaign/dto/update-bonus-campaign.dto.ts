import { PartialType } from '@nestjs/mapped-types';
import { CreateBonusCampaignDto } from './create-bonus-campaign.dto';

export class UpdateBonusCampaignDto extends PartialType(CreateBonusCampaignDto) {}
