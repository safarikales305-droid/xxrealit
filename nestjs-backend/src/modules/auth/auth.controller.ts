import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    console.log('LOGIN HIT');
    return this.authService.login(dto);
  }

  @Post('reset-request')
  async resetRequest(@Body() body: { email?: string }) {
    const email = typeof body?.email === 'string' ? body.email : '';
    return this.authService.resetPassword(email);
  }

  @Get('create-admin')
  async createAdminGet() {
    return this.authService.createAdminAccount();
  }

  @Post('create-admin')
  async createAdminPost() {
    return this.authService.createAdminAccount();
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Request() req: { user: AuthUser }) {
    const profile = await this.usersService.getMeProfile(req.user.id);
    if (!profile) {
      return req.user;
    }
    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      avatar: profile.avatarUrl,
      avatarCrop: profile.avatarCrop ?? null,
      coverImage: profile.coverImageUrl ?? null,
      coverCrop: profile.coverCrop ?? null,
      bio: profile.bio ?? null,
      createdAt: profile.createdAt.toISOString(),
    };
  }
}
