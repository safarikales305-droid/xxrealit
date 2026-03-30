import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import type { JwtPayload } from './types/jwt-payload';

const BCRYPT_ROUNDS = 10;

const roleMap: Record<string, UserRole> = {
  'Soukromy inzerent': UserRole.USER,
  'Makléř': UserRole.ADMIN,
  USER: UserRole.USER,
  ADMIN: UserRole.ADMIN,
  uzivatel: UserRole.USER,
  makler: UserRole.ADMIN,
  kancelar: UserRole.ADMIN,
  remeslnik: UserRole.USER,
  firma: UserRole.USER,
};

function mapRegisterRole(input?: string): UserRole {
  if (!input) return UserRole.USER;

  const key = input.trim();

  return (
    roleMap[key] ||
    roleMap[key.toLowerCase()] ||
    UserRole.USER
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const mappedRole = mapRegisterRole(dto.role);

    const user = await this.users.create({
      email,
      password,
      name: dto.name?.trim() || null,
      role: mappedRole,
    });

    return this.issueTokens(user);
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

  async login(email: string, password: string) {
    const user = await this.validateUser(
      email.trim().toLowerCase(),
      password,
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