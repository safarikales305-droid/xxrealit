import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { PrismaService } from '../../database/prisma.service';
import { upgradeHttpToHttpsForApi } from '../../lib/secure-url';
import { UsersService } from '../users/users.service';
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

  developer: UserRole.DEVELOPER,

  admin: UserRole.USER,
  administrator: UserRole.USER,
  remeslnik: UserRole.USER,
  firmicka: UserRole.USER,
  'stavebni firma': UserRole.DEVELOPER,
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
  UserRole.DEVELOPER,
  UserRole.PRIVATE_SELLER,
];

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
    const appUrl = this.config.get<string>('APP_URL')?.trim() ?? '';
    const frontendUrl = this.config.get<string>('NEXT_PUBLIC_APP_URL')?.trim() ?? '';
    const candidate = appUrl || frontendUrl;
    const normalized = candidate.replace(/\/+$/, '');
    const nodeEnv = (this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? '').trim();
    const isProduction = nodeEnv.toLowerCase() === 'production';
    const productionFallback = 'https://www.xxrealit.cz';
    const localhostLike = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

    if (isProduction) {
      if (!normalized) {
        this.logger.error(
          `APP_URL is missing in production. Falling back to ${productionFallback}.`,
        );
        return productionFallback;
      }
      if (localhostLike.test(normalized)) {
        this.logger.error(
          `APP_URL resolves to localhost in production (${normalized}). Falling back to ${productionFallback}.`,
        );
        return productionFallback;
      }
      return normalized;
    }

    return normalized || 'http://localhost:3000';
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

      const url = `${this.appOrigin()}/reset-hesla?token=${encodeURIComponent(token)}`;
      this.logger.log(
        `Reset URL prepared for userId=${user.id} appOrigin=${this.appOrigin()} to=${user.email}`,
      );

      if (!process.env.RESEND_API_KEY?.trim()) {
        throw new Error('Missing RESEND_API_KEY');
      }
      const resend = new Resend(process.env.RESEND_API_KEY);

      let response: Awaited<ReturnType<typeof resend.emails.send>>;
      try {
        response = await resend.emails.send({
          from: 'xxrealit <reset@mail.xxrealit.cz>',
          to: user.email,
          subject: 'Obnova hesla',
          html: `     <p>Klikni na odkaz pro obnovu hesla:</p>     <a href="${url}">${url}</a>  `,
          text: `Klikni na odkaz pro obnovu hesla: ${url}`,
        });
        console.log('EMAIL SENT:', response);
      } catch (err: unknown) {
        this.logResendError('RESEND ERROR', err);
        return {
          success: false,
          error: `E-mail se nepodařilo odeslat (${this.resendErrorMessage(err)}).`,
        };
      }

      this.logger.log(
        `Resend send result: id=${response.data?.id ?? 'n/a'} error=${Boolean(response.error)}`,
      );

      if (response.error) {
        const statusCode =
          typeof response.error === 'object' &&
          response.error &&
          'statusCode' in response.error
            ? String((response.error as { statusCode?: unknown }).statusCode ?? '')
            : 'unknown';
        this.logger.error(
          `Resend rejected password reset email. status=${statusCode} message=${this.resendErrorMessage(response.error)}`,
        );
        this.logResendError('Resend rejected password reset email', response.error);
        return {
          success: false,
          error: `E-mail se nepodařilo odeslat (${this.resendErrorMessage(response.error)}).`,
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

      const tokenHash = require('node:crypto').createHash('sha256').update(token, 'utf8').digest('hex');
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

  async register(dto: RegisterDto) {
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

    const mappedRole = mapRegisterRole(dto.role);
    if (!REGISTER_ROLES.includes(mappedRole)) {
      throw new HttpException(
        {
          error: 'Neplatná role',
          detail: { role: dto.role, mappedRole },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const name = dto.name?.trim() || null;
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
      const user = await this.users.create({
        email,
        password: hashedPassword,
        name,
        role: mappedRole,
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
            error: 'Uživatel s tímto e-mailem už existuje',
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

  async login(dto: LoginDto) {
    try {
      const email = dto.email.trim().toLowerCase();
      const { password } = dto;

      const user = await this.users.findByEmail(email);

      if (!user) {
        throw new HttpException(
          { error: 'Neplatný e-mail nebo heslo' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      const isValid = await bcrypt.compare(password, user.password);

      console.log('COMPARE RESULT:', isValid);

      if (!isValid) {
        throw new HttpException(
          { error: 'Neplatný e-mail nebo heslo' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      return this.issueTokens(user);
    } catch (err: unknown) {
      console.error('LOGIN ERROR FULL:', err);

      if (err instanceof HttpException) {
        throw err;
      }

      const message =
        err instanceof Error ? err.message : 'Unknown error';
      throw new HttpException({ error: message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
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
