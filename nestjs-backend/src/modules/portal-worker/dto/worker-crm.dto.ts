import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { UserRole, WorkerClientNoteType } from '@prisma/client';

export class CreateWorkerClientDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsEnum(UserRole)
  targetRole!: UserRole;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(5)
  phone!: string;

  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  @IsOptional()
  @IsString()
  ico?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AddWorkerClientNoteDto {
  @IsOptional()
  @IsString()
  preregistrationId?: string;

  @IsOptional()
  @IsString()
  clientUserId?: string;

  @IsEnum(WorkerClientNoteType)
  noteType!: WorkerClientNoteType;

  @IsString()
  @MinLength(1)
  body!: string;
}

export class GrantWorkerBonusDto {
  @IsString()
  clientUserId!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class WorkerCrmMessageDto {
  @IsString()
  preregistrationId!: string;

  @IsIn(['invite', 'complete', 'verify', 'welcome', 'bonus', 'reminder'])
  action!: 'invite' | 'complete' | 'verify' | 'welcome' | 'bonus' | 'reminder';
}

export class UpdateWorkerProfileAdminDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  commissionPercent?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxBonusPerClient?: number;

  @IsOptional()
  @IsString()
  adminNotes?: string | null;
}
