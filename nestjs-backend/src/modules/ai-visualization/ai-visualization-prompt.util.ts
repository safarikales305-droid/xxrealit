import type { AiVisualizationRenovationLevel } from '@prisma/client';
import { PROPERTY_TYPE_OPTIONS, STYLE_OPTIONS } from './ai-visualization.types';

const MAX_USER_PROMPT_LEN = 800;

export function sanitizeUserPrompt(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_USER_PROMPT_LEN);
}

function labelForPropertyType(id: string): string {
  return PROPERTY_TYPE_OPTIONS.find((p) => p.id === id)?.label ?? id;
}

function labelForStyle(id: string): string {
  return STYLE_OPTIONS.find((s) => s.id === id)?.label ?? id;
}

function renovationLevelText(level: AiVisualizationRenovationLevel): string {
  if (level === 'LIGHT') {
    return 'Light refresh: colors, flooring, furniture and decor only; keep structure unchanged.';
  }
  if (level === 'MAJOR') {
    return 'Major redesign while preserving the same room/building geometry and camera view.';
  }
  return 'Full renovation visualization: surfaces, fixtures, kitchen/bathroom as appropriate.';
}

export function buildRenovationImagePrompt(input: {
  propertyType: string;
  style: string;
  renovationLevel: AiVisualizationRenovationLevel;
  userPrompt?: string;
}): string {
  const userPart = sanitizeUserPrompt(input.userPrompt);
  const property = labelForPropertyType(input.propertyType);
  const style = labelForStyle(input.style);

  return [
    'Create a photorealistic renovation visualization of the supplied property image.',
    '',
    'Preserve exactly:',
    '- camera position and perspective',
    '- architecture and room geometry',
    '- window and door positions',
    '- structural proportions and layout',
    '- the same property (before/after of ONE space, not a different building)',
    '',
    `Property type: ${property}`,
    `Requested style: ${style}`,
    `Renovation level: ${renovationLevelText(input.renovationLevel)}`,
    userPart ? `User request: ${userPart}` : '',
    '',
    'Requirements:',
    '- professional real-estate renovation visualization',
    '- photorealistic lighting and materials',
    '- no text, logos, watermarks or people in the scene',
    '- no impossible structures or warped geometry',
  ]
    .filter(Boolean)
    .join('\n');
}
