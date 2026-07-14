import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import type { CreateMetaCampaignDto } from './dto/create-meta-campaign.dto';
import {
  hasMetaCampaignBodyPayload,
  validateCreateMetaCampaignDto,
} from './meta-campaign-dto-validation.util';

@Injectable()
export class MetaCampaignBodyPipe implements PipeTransform {
  async transform(value: unknown): Promise<CreateMetaCampaignDto> {
    if (!hasMetaCampaignBodyPayload(value)) {
      throw new BadRequestException(
        'Chybí data kampaně — vyplňte formulář a odešlete znovu.',
      );
    }
    return validateCreateMetaCampaignDto(value as Record<string, unknown>);
  }
}

@Injectable()
export class OptionalMetaCampaignBodyPipe implements PipeTransform {
  async transform(value: unknown): Promise<CreateMetaCampaignDto | undefined> {
    if (!hasMetaCampaignBodyPayload(value)) return undefined;
    return validateCreateMetaCampaignDto(value as Record<string, unknown>);
  }
}
