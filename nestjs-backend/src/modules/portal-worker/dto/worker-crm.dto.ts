import {
  IsBoolean,
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
  address?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  activityDescription?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  workerInternalNote?: string;
}

export class UpdateWorkerClientDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  @IsOptional()
  @IsEnum(UserRole)
  targetRole?: UserRole;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  ico?: string;

  @IsOptional()
  @IsString()
  activityDescription?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  workerInternalNote?: string;
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
  @IsBoolean()
  canAssignBonusCredits?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  adminNotes?: string | null;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  phoneVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappVerified?: boolean;
}

export class UpdateWorkerSelfSettingsDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
