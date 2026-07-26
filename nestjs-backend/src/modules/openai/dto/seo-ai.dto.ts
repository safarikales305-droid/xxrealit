import { IsOptional, IsString } from 'class-validator';

export class SeoAiImproveDto {
  @IsOptional()
  @IsString()
  contentId?: string;
}

export class SeoAiApplyDto {
  @IsString()
  generationId!: string;
}

export class SeoAiRejectDto {
  @IsString()
  generationId!: string;
}
