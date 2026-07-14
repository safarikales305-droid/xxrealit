import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { CreateMetaCampaignDto } from './dto/create-meta-campaign.dto';

const FIELD_LABELS: Record<string, string> = {
  name: 'Název kampaně',
  objective: 'Cíl kampaně',
  cityName: 'Město',
  radiusKm: 'Okruh',
  dailyBudgetCzk: 'Denní rozpočet',
  selectedProductIds: 'Vybrané nemovitosti',
  startDate: 'Datum spuštění',
  endDate: 'Datum ukončení',
};

function constraintToMessage(property: string, constraint: string): string {
  const label = FIELD_LABELS[property] ?? property;
  const c = constraint.toLowerCase();
  if (c.includes('longer than or equal to 1')) return `${label} musí být vyplněný`;
  if (c.includes('must be a string')) return `${label} musí být text`;
  if (c.includes('must be a number')) return `${label} musí být číslo`;
  if (c.includes('must be an array')) return `${label} musí být seznam`;
  if (c.includes('must be greater than 0')) return `${label} musí být větší než 0`;
  if (c.includes('must not be greater than 80')) return `${label} nesmí být větší než 80`;
  if (c.includes('each value in')) return `${label} musí obsahovat platné ID`;
  return `${label}: ${constraint}`;
}

function flattenValidationErrors(errors: ValidationError[], prefix = ''): string[] {
  const lines: string[] = [];
  for (const err of errors) {
    const property = prefix ? `${prefix}.${err.property}` : err.property;
    if (err.constraints) {
      for (const constraint of Object.values(err.constraints)) {
        const key = property.split('.')[0] ?? property;
        lines.push(constraintToMessage(key, constraint));
      }
    }
    if (err.children?.length) {
      lines.push(...flattenValidationErrors(err.children, property));
    }
  }
  return lines;
}

export function formatMetaCampaignValidationErrors(errors: ValidationError[]): string {
  const lines = flattenValidationErrors(errors);
  return lines.length ? lines.join('\n') : 'Neplatná data kampaně.';
}

export function hasMetaCampaignBodyPayload(raw: unknown): boolean {
  return Boolean(raw && typeof raw === 'object' && Object.keys(raw as Record<string, unknown>).length > 0);
}

export async function validateCreateMetaCampaignDto(
  raw: Record<string, unknown>,
): Promise<CreateMetaCampaignDto> {
  const dto = plainToInstance(CreateMetaCampaignDto, raw, {
    enableImplicitConversion: true,
  });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });
  if (errors.length) {
    throw new BadRequestException(formatMetaCampaignValidationErrors(errors));
  }
  return dto;
}
