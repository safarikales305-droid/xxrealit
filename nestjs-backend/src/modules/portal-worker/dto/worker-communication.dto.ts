import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SendWorkerInternalMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
}

export class ReplyWorkerInternalMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
}

export class WorkerBulkMessageFilterDto {
  @IsOptional()
  @IsBoolean()
  activeOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  approvedOnly?: boolean;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  district?: string;
}

export class SendWorkerBulkMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  campaignName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;

  @ValidateNested()
  @Type(() => WorkerBulkMessageFilterDto)
  filter!: WorkerBulkMessageFilterDto;

  @IsOptional()
  @IsBoolean()
  saveAsTemplate?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  templateName?: string;
}

export class SaveWorkerBulkTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  templateName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;
}

export class UpdateWorkerProfileReminderDto {
  @IsBoolean()
  enabled!: boolean;
}

export class WorkerCooperationCancelDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  reason?: string;
}

export class WorkerWorkGuideStepDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsInt()
  sortOrder!: number;
}

export class UpdateWorkerWorkGuideDto {
  @IsBoolean()
  enabled!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerWorkGuideStepDto)
  steps!: WorkerWorkGuideStepDto[];

  @IsOptional()
  @IsBoolean()
  saveAsTemplate?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  templateName?: string;
}

export class ApplyWorkerWorkGuideTemplateDto {
  @IsString()
  templateId!: string;
}

export class UpdateRecruitmentTargetDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  workerNote?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  steps?: string[];
}

export class CreateRecruitmentTargetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  workerNote?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @IsString({ each: true })
  steps!: string[];
}

export class SendRecruitmentTargetDto {
  @IsArray()
  @IsString({ each: true })
  workerIds!: string[];
}

export class ReorderRecruitmentTargetsDto {
  @IsArray()
  @IsString({ each: true })
  orderedTargetTypes!: string[];
}
