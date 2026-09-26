import type {
  AiVisualizationRenovationLevel,
  AiVisualizationStatus,
} from '@prisma/client';

export const DEFAULT_AI_VISUALIZATION_SETTINGS = {
  enabled: true,
  anonymousEnabled: true,
  anonymousFreeGenerations: 2,
  loggedInFreeGenerations: 10,
  maxUploadBytes: 12_582_912,
  provider: 'openai',
  model: 'gpt-image-1',
  outputQuality: 'high',
  originalRetentionDays: 30,
  resultRetentionDays: 90,
  watermarkEnabled: true,
  watermarkPosition: 'BOTTOM_RIGHT' as const,
  watermarkOnDownload: false,
  estimatedCostCzkPerGeneration: null as number | null,
};

export type AiVisualizationPublicConfig = {
  enabled: boolean;
  anonymousEnabled: boolean;
  maxUploadBytes: number;
  propertyTypes: Array<{ id: string; label: string; emoji: string }>;
  styles: Array<{ id: string; label: string }>;
  renovationLevels: Array<{ id: string; label: string; description: string }>;
};

export type CreateGenerationInput = {
  visualizationId: string;
  anonymousSessionId: string;
  userId?: string | null;
  propertyType: string;
  style: string;
  renovationLevel: AiVisualizationRenovationLevel;
  userPrompt?: string;
  idempotencyKey: string;
  parentId?: string;
  ipHash?: string;
};

export type VisualizationPublicView = {
  id: string;
  status: AiVisualizationStatus;
  progress: number;
  propertyType: string | null;
  style: string | null;
  renovationLevel: AiVisualizationRenovationLevel | null;
  userPrompt: string | null;
  originalPreviewUrl: string | null;
  resultPreviewUrl: string | null;
  publicShareId: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

export const PROPERTY_TYPE_OPTIONS = [
  { id: 'exterior', label: 'Exteriér domu', emoji: '🏠' },
  { id: 'living_room', label: 'Obývací pokoj', emoji: '🛋' },
  { id: 'kitchen', label: 'Kuchyně', emoji: '🍳' },
  { id: 'bedroom', label: 'Ložnice', emoji: '🛏' },
  { id: 'bathroom', label: 'Koupelna', emoji: '🚿' },
  { id: 'hallway', label: 'Chodba', emoji: '🚪' },
  { id: 'kids_room', label: 'Dětský pokoj', emoji: '👶' },
  { id: 'apartment', label: 'Byt', emoji: '🏢' },
  { id: 'garden', label: 'Zahrada / terasa', emoji: '🌳' },
  { id: 'other', label: 'Jiné', emoji: '✨' },
] as const;

export const STYLE_OPTIONS = [
  { id: 'modern', label: 'Moderní' },
  { id: 'luxury', label: 'Luxusní' },
  { id: 'minimal', label: 'Minimalistický' },
  { id: 'scandinavian', label: 'Skandinávský' },
  { id: 'industrial', label: 'Industriální' },
  { id: 'rustic', label: 'Rustikální' },
  { id: 'classic', label: 'Klasický' },
  { id: 'natural', label: 'Přírodní' },
  { id: 'czech_modern', label: 'Moderní český interiér' },
] as const;

export const RENOVATION_LEVEL_OPTIONS = [
  {
    id: 'LIGHT' as const,
    label: 'Lehká úprava',
    description: 'Barvy, podlahy, nábytek, dekorace',
  },
  {
    id: 'RENOVATION' as const,
    label: 'Rekonstrukce',
    description: 'Nový interiér, kuchyň, koupelna, povrchy',
  },
  {
    id: 'MAJOR' as const,
    label: 'Velká proměna',
    description: 'Výraznější redesign prostoru',
  },
];
