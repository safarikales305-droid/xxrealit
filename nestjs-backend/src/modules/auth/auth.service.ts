import {
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { UsersService } from '../users/users.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { JwtPayload } from './types/jwt-payload';

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

  'realitni makler': UserRole.AGENT,
  makler: UserRole.AGENT,
  kancelar: UserRole.AGENT,
  agent: UserRole.AGENT,

  developer: UserRole.DEVELOPER,

  admin: UserRole.AGENT,
  remeslnik: UserRole.USER,
  firma: UserRole.USER,
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
  UserRole.DEVELOPER,
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

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private appOrigin(): string {
    const raw =
      this.config.get<string>('NEXT_PUBLIC_APP_URL')?.trim() ||
      this.config.get<string>('APP_URL')?.trim() ||
      'http://localhost:3000';
    return raw.replace(/\/+$/, '');
  }

  /**
   * Požadavek na obnovu hesla — Resend, bez throw (vždy vrací objekt).
   */
  async resetPassword(emailRaw: string): Promise<ResetPasswordRequestResult> {
    const email = emailRaw?.trim().toLowerCase() ?? '';

    try {
      console.log('RESET REQUEST FOR:', email);

      if (!email) {
        return { success: false, error: 'Missing email' };
      }

      const user = await this.users.findByEmail(email);

      const generic: ResetPasswordRequestResult = {
        success: true,
        message: 'Pokud účet existuje, odeslali jsme instrukce na e-mail.',
      };

      if (!user) {
        return generic;
      }

      const apiKey = process.env.RESEND_API_KEY?.trim();
      if (!apiKey) {
        console.error('RESET ERROR FULL: Missing RESEND_API_KEY');
        return { success: false, error: 'Missing RESEND_API_KEY' };
      }

      const token = randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000);

      await this.users.setPasswordResetToken(user.id, token, resetExpires);

      const url = `${this.appOrigin()}/reset-hesla?token=${encodeURIComponent(token)}`;
      console.log('RESET URL:', url);

      const resend = new Resend(apiKey);

      const response = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email,
        subject: 'Obnova hesla',
        html: `<p>Klikni: <a href="${url}">${url}</a></p>`,
      });

      console.log('RESEND RESPONSE:', response);

      if (response.error) {
        const re = response.error;
        console.error('RESEND ERROR FULL (API):', re);
        console.error('RESEND ERROR MESSAGE:', re.message ?? '(no message)');
        console.error('RESEND ERROR NAME:', 'name' in re ? re.name : '(no name)');
        console.error(
          'RESEND ERROR STATUS:',
          'statusCode' in re ? re.statusCode : '(no statusCode)',
        );
        console.error(
          'RESEND ERROR STACK:',
          'stack' in re && typeof (re as { stack?: string }).stack === 'string'
            ? (re as { stack: string }).stack
            : '(no stack)',
        );
        console.error('RESEND ERROR JSON:', JSON.stringify(re));
        return {
          success: false,
          error: re.message ?? JSON.stringify(re),
        };
      }

      return {
        success: true,
        message: 'Email odeslán',
      };
    } catch (error: any) {
      console.error('RESEND ERROR FULL:', error);
      console.error('RESEND ERROR MESSAGE:', error?.message);
      console.error('RESEND ERROR STACK:', error?.stack);

      return {
        success: false,
        error: error?.message || 'Email failed',
      };
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

  issueTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      success: true,
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: (user as any).avatar ?? null,
        bio: (user as any).bio ?? null,
        city: (user as any).city ?? null,
      },
    };
  }
}
