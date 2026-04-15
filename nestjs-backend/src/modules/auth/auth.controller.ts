import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Options,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly config: ConfigService,
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
    console.log(`[AUTH] reset-request received: emailPresent=${Boolean(email?.trim())}`);
    const result = await this.authService.resetPassword(email);
    if (!result.success) {
      console.warn(`[AUTH] reset-request failed: ${result.error ?? 'unknown error'}`);
    } else {
      console.log('[AUTH] reset-request completed successfully.');
    }
    return result;
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: { email?: string }) {
    const email = typeof body?.email === 'string' ? body.email : '';
    console.log(`[AUTH] forgot-password received: emailPresent=${Boolean(email?.trim())}`);
    return this.authService.resetPassword(email);
  }

  @Post('reset-password')
  async resetPassword(
    @Body()
    body: {
      token?: string;
      password?: string;
      confirmPassword?: string;
      newPassword?: string;
      passwordConfirmation?: string;
    },
  ) {
    console.log(
      `[AUTH] reset-password received tokenPresent=${Boolean(body?.token)} hasPassword=${Boolean(body?.password || body?.newPassword)} hasConfirmation=${Boolean(body?.confirmPassword || body?.passwordConfirmation)}`,
    );
    const result = await this.authService.completeResetPassword({
      token: body?.token,
      password: body?.password ?? body?.newPassword,
      confirmPassword: body?.confirmPassword ?? body?.passwordConfirmation,
    });
    if (!result.success) {
      console.warn(`[AUTH] reset-password failed: ${result.error ?? 'unknown error'}`);
    } else {
      console.log('[AUTH] reset-password completed successfully.');
    }
    return result;
  }

  @Options('reset-request')
  @HttpCode(204)
  resetRequestOptions() {
    return;
  }

  @Post('reset-request-test')
  async resetRequestTest(@Body() body: { email?: string }) {
    const enabled = this.config.get<string>('ENABLE_RESEND_TEST_ENDPOINT') === 'true';
    if (!enabled) {
      throw new ForbiddenException('Resend test endpoint is disabled.');
    }
    const email = typeof body?.email === 'string' ? body.email : '';
    return this.authService.sendResendResetEmailTest(email);
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
