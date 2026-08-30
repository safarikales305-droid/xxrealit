import { IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export const SHORTS_SIGNUP_EVENT_NAMES = [
  'shorts_signup_eligible',
  'shorts_signup_popup_shown',
  'shorts_signup_email_started',
  'shorts_signup_submitted',
  'shorts_signup_success',
  'shorts_signup_existing_email',
  'shorts_signup_failed',
  'shorts_signup_dismissed',
  'shorts_signup_closed',
  'shorts_signup_password_email_sent',
  'shorts_signup_password_set',
] as const;

export type ShortsSignupEventName = (typeof SHORTS_SIGNUP_EVENT_NAMES)[number];

export class TrackShortsSignupEventDto {
  @IsString()
  @IsIn([...SHORTS_SIGNUP_EVENT_NAMES])
  eventName!: ShortsSignupEventName;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  anonymousSessionId?: string;

  @IsOptional()
  @IsInt()
  triggerViewCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  shortType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referrer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  variantId?: string;
}

export class EmailSignupDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referrer?: string;
}
