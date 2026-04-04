import {
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { JwtPayload } from './types/jwt-payload';

const BCRYPT_ROUNDS = 10;

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

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

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
      password: dto.password,
    });

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.users.create({
        email,
        password: passwordHash,
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

    console.log('LOGIN CHECK:', {
      inputPassword: password,
      hashed: user.password,
      isValid,
    });

    if (!isValid) {
      throw new HttpException(
        { error: 'Neplatný e-mail nebo heslo' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.issueTokens(user);
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
