import { IsArray, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePwaPushCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetCity?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetInterests?: string[];

  @IsOptional()
  @IsString()
  scheduledAt?: string;
}

export class UpdatePwaPushCampaignDto extends CreatePwaPushCampaignDto {
  @IsOptional()
  @IsString()
  status?: string;
}

export class SchedulePwaPushCampaignDto {
  @IsString()
  scheduledAt!: string;
}

export class SendPwaPushCampaignNowDto {
  @IsOptional()
  @IsInt()
  limit?: number;
}
