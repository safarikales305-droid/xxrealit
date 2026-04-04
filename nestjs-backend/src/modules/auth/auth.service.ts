import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
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

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const mappedRole = mapRegisterRole(dto.role);
    const name = dto.name?.trim() || null;

    try {
      const user = await this.users.create({
        email,
        password,
        name,
        role: mappedRole,
      });

      return this.issueTokens(user);
    } catch (err: unknown) {
      console.error('REGISTER ERROR:', err);

      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new HttpException(
          { error: 'Uživatel s tímto e-mailem už existuje' },
          HttpStatus.CONFLICT,
        );
      }

      const message =
        err instanceof Error ? err.message : 'Neznámá chyba při registraci';
      throw new HttpException({ error: message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.users.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(password, user.password);

    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(
      dto.email.trim().toLowerCase(),
      dto.password,
    );

    return this.issueTokens(user);
  }

  issueTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
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
