export type RenovationImageProviderResult = {
  imageBuffer: Buffer;
  model: string;
  provider: string;
  usageMeta?: Record<string, unknown>;
};

export interface RenovationImageProvider {
  readonly providerId: string;
  isReady(): boolean;
  generateRenovation(input: {
    imagePngBuffer: Buffer;
    prompt: string;
    model: string;
    quality?: string;
  }): Promise<RenovationImageProviderResult>;
}
