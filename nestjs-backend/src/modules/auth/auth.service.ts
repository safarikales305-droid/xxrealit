import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { UserRole, PortalWorkerStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { PrismaService } from '../../database/prisma.service';
import { AccountUniquenessService } from '../../common/account-uniqueness.service';
import { EMAIL_ALREADY_REGISTERED_MSG } from '../../common/account-uniqueness.constants';
import { buildEmailVerificationUrl, buildPasswordResetUrl, resolveFrontendUrl } from '../../common/resolve-frontend-url';
import { upgradeHttpToHttpsForApi } from '../../lib/secure-url';
import { EmailsService } from '../emails/emails.service';
import { WhatsAppMarketingService } from '../whatsapp/whatsapp-marketing.service';
import { UsersService } from '../users/users.service';
import { ReferralService } from '../bonus-campaign/referral.service';
import { BonusCampaignService } from '../bonus-campaign/bonus-campaign.service';
import { MarketingBonusActionType } from '@prisma/client';
import type { RequestClientMeta } from '../../common/request-client-meta';
import { PortalTermsService } from '../portal-terms/portal-terms.service';
type TokenUserShape = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  avatar?: string | null;
  coverImage?: string | null;
  bio?: string | null;
  city?: string | null;
  createdAt: Date;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { JwtPayload } from './types/jwt-payload';
import { ensureUserRole } from './user-role.util';

/** Normalized key: lowercase + Czech letters → ASCII (kvůli „Realitní makléř“ atd.). */
const CZ_ASCII: Record<string, string> = {
  á: 'a',
  č: 'c',
  ď: 'd',
  é: 'e',
  ě: 'e',
  í: 'i',
  ň: 'n',
  ó: 'o',
  ô: 'o',
  ř: 'r',
  š: 's',
  ť: 't',
  ú: 'u',
  ů: 'u',
  ý: 'y',
  ž: 'z',
};

function roleKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .split('')
    .map((c) => CZ_ASCII[c] ?? c)
    .join('')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const roleMap: Record<string, UserRole> = {
  'soukromy inzerent': UserRole.USER,
  uzivatel: UserRole.USER,
  user: UserRole.USER,

  private_seller: UserRole.PRIVATE_SELLER,
  privateseller: UserRole.PRIVATE_SELLER,
  'soukromy prodejce': UserRole.PRIVATE_SELLER,
  soukromyprodejce: UserRole.PRIVATE_SELLER,

  'realitni makler': UserRole.AGENT,
  makler: UserRole.AGENT,
  kancelar: UserRole.AGENT,
  agent: UserRole.AGENT,
  company: UserRole.COMPANY,
  firma: UserRole.COMPANY,
  agency: UserRole.AGENCY,
  'realitni kancelar': UserRole.AGENCY,
  'financni poradce': UserRole.FINANCIAL_ADVISOR,
  financial_advisor: UserRole.FINANCIAL_ADVISOR,
  investor: UserRole.INVESTOR,

  developer: UserRole.DEVELOPER,

  craftsman: UserRole.CRAFTSMAN,
  remeslnik: UserRole.CRAFTSMAN,
  'remeslnik ucet': UserRole.CRAFTSMAN,

  tipster: UserRole.TIPSTER,
  tipar: UserRole.TIPSTER,
  'tipar ucet': UserRole.TIPSTER,

  admin: UserRole.USER,
  administrator: UserRole.USER,
  firmicka: UserRole.COMPANY,
  'stavebni firma': UserRole.COMPANY,
  'majitel stavebni firmy': UserRole.COMPANY,

  portal_worker: UserRole.PORTAL_WORKER,
  'pracovnik portalu': UserRole.PORTAL_WORKER,
  'pracovník portálu': UserRole.PORTAL_WORKER,
};

function mapRegisterRole(input?: string): UserRole {
  if (!input) return UserRole.USER;

  const key = roleKey(input);
  return roleMap[key] ?? UserRole.USER;
}

const REGISTER_ROLES: readonly UserRole[] = [
  UserRole.USER,
  UserRole.AGENT,
  UserRole.COMPANY,
  UserRole.AGENCY,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
  UserRole.DEVELOPER,
  UserRole.PRIVATE_SELLER,
  UserRole.CRAFTSMAN,
  UserRole.TIPSTER,
];

function assertPortalWorkerRegistration(dto: RegisterDto): {
  name: string;
  firstName: string;
  lastName: string;
  city: string;
  bio: string;
} {
  const firstName = dto.firstName?.trim() ?? '';
  const lastName = dto.lastName?.trim() ?? '';
  const city = dto.city?.trim() ?? '';
  const bio = dto.bio?.trim() ?? '';
  if (!firstName) {
    throw new HttpException({ error: 'Jméno je povinné' }, HttpStatus.BAD_REQUEST);
  }
  if (!lastName) {
    throw new HttpException({ error: 'Příjmení je povinné' }, HttpStatus.BAD_REQUEST);
  }
  if (!city) {
    throw new HttpException({ error: 'Město je povinné' }, HttpStatus.BAD_REQUEST);
  }
  if (bio.length < 20) {
    throw new HttpException(
      { error: 'Krátké představení musí mít alespoň 20 znaků' },
      HttpStatus.BAD_REQUEST,
    );
  }
  if (dto.portalWorkerCooperationConsent !== true) {
    throw new HttpException(
      { error: 'Musíte souhlasit se spoluprací s XXrealit.cz' },
      HttpStatus.BAD_REQUEST,
    );
  }
  return { name: `${firstName} ${lastName}`.trim(), firstName, lastName, city, bio };
}

function assertPropertySeekerRegistration(dto: RegisterDto): void {
  if (dto.wantsPortalWorker === true) {
    throw new HttpException(
      { error: 'Nelze kombinovat registraci hledače nemovitosti s pracovníkem portálu.' },
      HttpStatus.BAD_REQUEST,
    );
  }
  if (dto.marketingConsentWhatsApp !== true || dto.marketingConsentEmail !== true) {
    throw new HttpException(
      {
        error:
          'Pro pokračování je nutný souhlas se zasíláním nabídek přes WhatsApp a e-mail.',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

function errorDetailForResponse(err: unknown): Record<string, unknown> {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      name: err.name,
      code: err.code,
      message: err.message,
      meta: err.meta as Record<string, unknown>,
      clientVersion: err.clientVersion,
    };
  }
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { value: String(err) };
}

export type ResetPasswordRequestResult = {
  success: boolean;
  message?: string;
  error?: string;
};

export type ResendTestResult = {
  success: boolean;
  message?: string;
  error?: string;
  id?: string;
};

export type CompleteResetPasswordResult = {
  success: boolean;
  message?: string;
  error?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly emailsService: EmailsService,
    private readonly referral: ReferralService,
    private readonly bonusCampaigns: BonusCampaignService,
    private readonly whatsAppMarketing: WhatsAppMarketingService,
    private readonly accountUniqueness: AccountUniquenessService,
    private readonly portalTerms: PortalTermsService,
  ) {}

  private resendFromAddress(): string {
    return 'xxrealit <reset@mail.xxrealit.cz>';
  }

  private resendErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) return message;
    }
    if (error instanceof Error && error.message.trim().length > 0) return error.message;
    return 'Resend API call failed';
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private logResendError(context: string, error: unknown): void {
    const base = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
    const message =
      typeof base.message === 'string'
        ? base.message
        : error instanceof Error
          ? error.message
          : 'Unknown error';
    const name =
      typeof base.name === 'string'
        ? base.name
        : error instanceof Error
          ? error.name
          : 'UnknownError';
    const statusCode = base.statusCode ?? 'n/a';
    const response = base.response;
    this.logger.error(
      `${context} message=${message} name=${name} statusCode=${String(statusCode)} response=${response ? '[present]' : '[none]'}`,
    );
    if (response) {
      let responseDetail = '';
      if (typeof response === 'string') {
        responseDetail = response;
      } else {
        try {
          responseDetail = JSON.stringify(response);
        } catch {
          responseDetail = '[unserializable response]';
        }
      }
      this.logger.error(
        `${context} response detail: ${responseDetail}`,
      );
    }
  }

  async sendResendResetEmailTest(toRaw: string): Promise<ResendTestResult> {
    const to = toRaw?.trim().toLowerCase() ?? '';
    if (!to) {
      return { success: false, error: 'Zadejte cílový e-mail pro test.' };
    }
    if (!this.isValidEmail(to)) {
      return { success: false, error: 'Neplatný cílový e-mail pro test.' };
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = this.resendFromAddress();
    this.logger.log(`Resend test config: apiKeyPresent=${Boolean(apiKey)} from=${from}`);

    if (!apiKey) {
      return {
        success: false,
        error: 'E-mailová služba není nakonfigurovaná. Chybí RESEND_API_KEY.',
      };
    }

    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const response = await resend.emails.send({
        from,
        to,
        subject: 'xxrealit - test odeslání Resend',
        html: '<p>Test odeslání reset e-mailu přes Resend je funkční.</p>',
        text: 'Test odeslání reset e-mailu přes Resend je funkční.',
      });

      if (response.error) {
        const msg = this.resendErrorMessage(response.error);
        this.logResendError('Resend test failed', response.error);
        return { success: false, error: msg };
      }

      this.logger.log(`Resend test succeeded: id=${response.data?.id ?? 'n/a'}`);
      return {
        success: true,
        message: 'Testovací e-mail byl odeslán.',
        id: response.data?.id ?? undefined,
      };
    } catch (error: unknown) {
      const msg = this.resendErrorMessage(error);
      this.logResendError('Resend test failed unexpectedly', error);
      return { success: false, error: msg };
    }
  }

  private appOrigin(): string {
    return resolveFrontendUrl(this.config, this.logger);
  }

  /**
   * Požadavek na obnovu hesla — Resend, bez throw (vždy vrací objekt).
   */
  async resetPassword(emailRaw: string): Promise<ResetPasswordRequestResult> {
    const email = emailRaw?.trim().toLowerCase() ?? '';

    try {
      this.logger.log(`Password reset requested: ${email || '(empty email)'}`);

      if (!email) {
        return { success: false, error: 'Zadejte e-mail.' };
      }

      const user = await this.users.findByEmail(email);

      const generic: ResetPasswordRequestResult = {
        success: true,
        message: 'Pokud účet existuje, odeslali jsme instrukce na e-mail.',
      };

      if (!user) {
        return generic;
      }
      if (!this.isValidEmail(user.email)) {
        this.logger.error(`Password reset rejected: invalid recipient email "${user.email}"`);
        return { success: false, error: 'Neplatný e-mail účtu.' };
      }

      const from = this.resendFromAddress();
      const hasApiKey = Boolean(process.env.RESEND_API_KEY?.trim());
      this.logger.log(
        `Resend config check: apiKeyPresent=${hasApiKey} from=${from}`,
      );

      const token = randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000);

      await this.users.setPasswordResetToken(user.id, token, resetExpires);

      const url = buildPasswordResetUrl(token, this.config, this.logger);
      this.logger.log(
        `Reset URL prepared for userId=${user.id} appOrigin=${this.appOrigin()} to=${user.email}`,
      );

      try {
        await this.emailsService.sendPasswordResetEmail({
          email: user.email,
          resetUrl: url,
        });
        this.logger.log(`Password reset email queued/sent via template for userId=${user.id}`);
      } catch (err: unknown) {
        this.logResendError('RESEND ERROR', err);
        return {
          success: false,
          error: `E-mail se nepodařilo odeslat (${this.resendErrorMessage(err)}).`,
        };
      }

      return {
        success: true,
        message: 'Pokud účet existuje, odeslali jsme instrukce na e-mail.',
      };
    } catch (error: any) {
      this.logger.error(
        `Password reset email failed unexpectedly: ${this.resendErrorMessage(error)}`,
        error?.stack,
      );

      return {
        success: false,
        error: `E-mail se nepodařilo odeslat (${this.resendErrorMessage(error)}).`,
      };
    }
  }

  async completeResetPassword(input: {
    token?: string;
    password?: string;
    confirmPassword?: string;
  }): Promise<CompleteResetPasswordResult> {
    try {
      const token = String(input.token ?? '').trim();
      const password = String(input.password ?? '');
      const confirmPassword = String(input.confirmPassword ?? '');
      this.logger.log(
        `[reset-password] request received tokenPresent=${Boolean(token)} passwordLen=${password.length} confirmLen=${confirmPassword.length}`,
      );

      if (!token) {
        this.logger.warn('[reset-password] missing token');
        return { success: false, error: 'Token je povinný.' };
      }
      if (password.length < 6) {
        this.logger.warn('[reset-password] password too short');
        return { success: false, error: 'Heslo musí mít alespoň 6 znaků.' };
      }
      if (password !== confirmPassword) {
        this.logger.warn('[reset-password] password mismatch');
        return { success: false, error: 'Hesla se neshodují.' };
      }

      const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
      const now = new Date();
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [{ resetToken: token }, { resetToken: tokenHash }],
          resetExpires: { gt: now },
        },
        select: { id: true, email: true, resetExpires: true },
      });

      if (!user) {
        const tokenExists = await this.prisma.user.findFirst({
          where: { OR: [{ resetToken: token }, { resetToken: tokenHash }] },
          select: { id: true, resetExpires: true },
        });
        if (!tokenExists) {
          this.logger.warn('[reset-password] token invalid (not found)');
          return { success: false, error: 'Neplatný reset odkaz.' };
        }
        this.logger.warn(
          `[reset-password] token expired userId=${tokenExists.id} expiresAt=${tokenExists.resetExpires?.toISOString() ?? 'null'}`,
        );
        return { success: false, error: 'Reset odkaz vypršel. Požádejte o nový.' };
      }

      this.logger.log(
        `[reset-password] user matched userId=${user.id} expiresAt=${user.resetExpires?.toISOString() ?? 'null'}`,
      );

      const hashedPassword = await bcrypt.hash(password, 10);
      this.logger.log('[reset-password] password hash completed');

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetExpires: null,
        },
      });
      this.logger.log(`[reset-password] user updated and token invalidated userId=${user.id}`);

      return { success: true, message: 'Heslo bylo úspěšně změněno.' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const name = error instanceof Error ? error.name : 'UnknownError';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[reset-password] unexpected failure name=${name} message=${message}`,
        stack,
      );
      return { success: false, error: 'Obnova hesla selhala kvůli chybě serveru.' };
    }
  }

  async register(dto: RegisterDto, meta?: RequestClientMeta) {
    const emailTrimmed = dto.email?.trim().toLowerCase() ?? '';
    if (!emailTrimmed) {
      throw new HttpException(
        {
          error: 'Email je povinný',
          detail: { email: dto.email },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const email = emailTrimmed;

    if (typeof dto.password !== 'string' || dto.password.length === 0) {
      throw new HttpException(
        { error: 'Heslo je povinné' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const password = dto.password;

    const mappedRole = dto.wantsPropertySeeker
      ? UserRole.PROPERTY_SEEKER
      : dto.wantsPortalWorker
        ? UserRole.PORTAL_WORKER
        : mapRegisterRole(dto.role);
    if (
      !dto.wantsPortalWorker &&
      !dto.wantsPropertySeeker &&
      mappedRole === UserRole.PORTAL_WORKER
    ) {
      throw new HttpException(
        { error: 'Roli pracovníka portálu lze získat pouze registrací přes formulář pracovníka.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      !dto.wantsPropertySeeker &&
      mappedRole === UserRole.PROPERTY_SEEKER
    ) {
      throw new HttpException(
        { error: 'Roli hledače nemovitosti lze získat pouze registrací přes „Hledám nemovitost“.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      !REGISTER_ROLES.includes(mappedRole) &&
      mappedRole !== UserRole.PORTAL_WORKER &&
      mappedRole !== UserRole.PROPERTY_SEEKER
    ) {
      throw new HttpException(
        {
          error: 'Neplatná role',
          detail: { role: dto.role, mappedRole },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const name = dto.name?.trim() || '';
    const phone = dto.phone?.trim() || '';
    let portalWorkerFields: {
      firstName?: string;
      lastName?: string;
      city?: string;
      bio?: string;
    } = {};
    let propertySeekerFields: {
      marketingConsentWhatsApp: boolean;
      marketingConsentEmail: boolean;
      consentCreatedAt: Date;
      consentSource: string;
      firstContentCompleted: boolean;
    } | null = null;
    let resolvedName = name;
    if (dto.wantsPortalWorker) {
      const pw = assertPortalWorkerRegistration(dto);
      resolvedName = pw.name;
      portalWorkerFields = {
        firstName: pw.firstName,
        lastName: pw.lastName,
        city: pw.city,
        bio: pw.bio,
      };
    } else if (dto.wantsPropertySeeker) {
      assertPropertySeekerRegistration(dto);
      if (!name) {
        throw new HttpException({ error: 'Jméno je povinné' }, HttpStatus.BAD_REQUEST);
      }
      propertySeekerFields = {
        marketingConsentWhatsApp: true,
        marketingConsentEmail: true,
        consentCreatedAt: new Date(),
        consentSource: 'REGISTRATION_PROPERTY_SEEKER',
        firstContentCompleted: true,
      };
    } else if (!name) {
      throw new HttpException({ error: 'Jméno je povinné' }, HttpStatus.BAD_REQUEST);
    }
    if (!phone) {
      throw new HttpException({ error: 'Telefon je povinný' }, HttpStatus.BAD_REQUEST);
    }

    const termsVersion = await this.portalTerms.assertRegistrationConsent(dto.termsAccepted);
    const termsConsent = this.portalTerms.termsConsentData(termsVersion, meta);

    const role = dto.role;

    console.log('REGISTER INPUT:', {
      email,
      name,
      role,
    });

    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('PLAIN PASSWORD:', password);
    console.log('HASHED PASSWORD:', hashedPassword);

    try {
      await this.accountUniqueness.assertEmailAvailable(email);
      const referredByUserId = await this.referral.resolveReferrerByCode(dto.referralCode);
      const user = await this.users.create({
        email,
        password: hashedPassword,
        name: resolvedName,
        phone,
        phonePublic: false,
        role: mappedRole,
        isTipar: mappedRole === UserRole.TIPSTER,
        referredByUserId,
        emailVerified: false,
        phoneVerified: false,
        portalWorkerStatus:
          mappedRole === UserRole.PORTAL_WORKER
            ? PortalWorkerStatus.PENDING_APPROVAL
            : undefined,
        ...portalWorkerFields,
        ...(propertySeekerFields ?? {}),
        ...termsConsent,
      });
      void this.referral.ensureReferralCode(user.id).catch(() => {});
      if (referredByUserId) {
        void this.bonusCampaigns
          .evaluateMarketingBonuses(
            referredByUserId,
            MarketingBonusActionType.REFERRAL_REGISTRATION,
          )
          .catch(() => {});
      }
      void this.emailsService
        .sendWelcomeEmail({ email: user.email, name: user.name ?? undefined })
        .catch((error: unknown) => {
          this.logger.warn(
            `Welcome email failed for userId=${user.id}: ${this.resendErrorMessage(error)}`,
          );
        });
      void this.sendProfileOnboardingEmailOnce(user.id, user.email, user.name);
      void this.whatsAppMarketing
        .sendWelcomeOnRegister({
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Welcome WhatsApp failed for userId=${user.id}: ${error instanceof Error ? error.message : 'unknown'}`,
          );
        });

      return this.issueTokens(user);
    } catch (err: any) {
      console.error('REGISTER ERROR FULL:', err);
      console.error('MESSAGE:', err?.message);
      console.error('STACK:', err?.stack);

      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new HttpException(
          {
            error: EMAIL_ALREADY_REGISTERED_MSG,
            code: 'EMAIL_EXISTS',
            detail: errorDetailForResponse(err),
          },
          HttpStatus.CONFLICT,
        );
      }

      throw new HttpException(
        {
          error: err?.message || 'Unknown error',
          detail: errorDetailForResponse(err),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async acceptTerms(userId: string, meta?: RequestClientMeta) {
    return this.portalTerms.acceptTermsForUser(userId, meta);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    try {
      const { password } = dto;

      const user = await this.users.findByEmail(email);

      if (!user) {
        this.logger.warn(`[login] invalid credentials email=${email} reason=user_not_found`);
        throw new HttpException(
          { error: 'Neplatný e-mail nebo heslo' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      const isValid = await bcrypt.compare(password, user.password);

      if (!isValid) {
        this.logger.warn(`[login] invalid credentials email=${email} reason=bad_password`);
        throw new HttpException(
          { error: 'Neplatný e-mail nebo heslo' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      return this.issueTokens(user);
    } catch (err: unknown) {
      if (err instanceof HttpException) {
        throw err;
      }

      const message =
        err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `[login] internal error email=${email} message=${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new HttpException({ error: message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async sendEmailVerification(userId: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, emailVerified: true },
      });
      if (!user) {
        return { success: false, error: 'Uživatel nenalezen.' };
      }
      if (user.emailVerified) {
        return { success: true, message: 'E-mail je již ověřený.' };
      }
      if (!this.isValidEmail(user.email)) {
        return { success: false, error: 'Neplatná e-mailová adresa účtu.' };
      }

      const token = randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.users.setEmailVerificationToken(user.id, token, expires);

      const verifyUrl = buildEmailVerificationUrl(token, this.config, this.logger);
      await this.emailsService.sendEmailVerificationEmail({
        email: user.email,
        verifyUrl,
      });

      this.logger.log(`[email-verify] sent userId=${user.id}`);
      return {
        success: true,
        message: 'Ověřovací e-mail byl odeslán. Zkontrolujte schránku.',
      };
    } catch (err: unknown) {
      const message = this.resendErrorMessage(err);
      this.logger.error(`[email-verify] send failed: ${message}`);
      return { success: false, error: `E-mail se nepodařilo odeslat (${message}).` };
    }
  }

  async verifyEmailByToken(tokenRaw: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    const token = String(tokenRaw ?? '').trim();
    if (!token) {
      return {
        success: false,
        error: 'Ověřovací odkaz je neplatný nebo expiroval.',
      };
    }

    const user = await this.users.findByEmailVerificationToken(token);
    if (
      !user ||
      !user.emailVerificationExpires ||
      user.emailVerificationExpires.getTime() < Date.now()
    ) {
      return {
        success: false,
        error: 'Ověřovací odkaz je neplatný nebo expiroval.',
      };
    }

    if (user.emailVerified) {
      return { success: true, message: 'E-mail byl úspěšně ověřen.' };
    }

    await this.users.confirmEmailVerification(user.id);
    this.logger.log(`[email-verify] confirmed userId=${user.id}`);
    return { success: true, message: 'E-mail byl úspěšně ověřen.' };
  }

  async createAdminAccount() {
    const email = 'admin@admin.cz';
    const hashed = await bcrypt.hash('admin123', 10);
    return this.prisma.user.upsert({
      where: { email },
      update: {
        password: hashed,
        role: UserRole.ADMIN,
      },
      create: {
        email,
        password: hashed,
        role: UserRole.ADMIN,
        name: 'Administrátor',
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
  }

  private sendProfileOnboardingEmailOnce(
    userId: string,
    email: string,
    name: string | null,
  ): void {
    void (async () => {
      const row = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { profileOnboardingEmailSentAt: true },
      });
      if (row?.profileOnboardingEmailSentAt) return;
      await this.emailsService.sendProfileOnboardingReminderEmail({
        email,
        name: name ?? undefined,
      });
      await this.prisma.user.update({
        where: { id: userId },
        data: { profileOnboardingEmailSentAt: new Date() },
      });
    })().catch((error: unknown) => {
      this.logger.warn(
        `Profile onboarding email failed for userId=${userId}: ${this.resendErrorMessage(error)}`,
      );
    });
  }

  issueTokens(user: TokenUserShape) {
    const role = ensureUserRole(user.role);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role,
    };
    const signed = this.jwt.sign(payload);

    return {
      success: true,
      redirect: role === UserRole.ADMIN ? '/admin' : undefined,
      accessToken: signed,
      // Compatibility for frontend clients expecting `token` / `access_token`.
      token: signed,
      access_token: signed,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role,
        avatar:
          upgradeHttpToHttpsForApi((user as { avatar?: string | null }).avatar ?? null) ??
          (user as { avatar?: string | null }).avatar ??
          null,
        coverImage:
          upgradeHttpToHttpsForApi((user as { coverImage?: string | null }).coverImage ?? null) ??
          (user as { coverImage?: string | null }).coverImage ??
          null,
        bio: (user as any).bio ?? null,
        city: (user as any).city ?? null,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }
}
