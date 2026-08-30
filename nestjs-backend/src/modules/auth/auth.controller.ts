import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Options,
  Post,
  Query,
  Req,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { extractRequestClientMeta } from '../../common/request-client-meta';
import { RegistrationGateService } from '../registration-gate/registration-gate.service';
import { RegistrationRequirementsService } from '../registration-gate/registration-requirements.service';
import { PortalTermsService } from '../portal-terms/portal-terms.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { EmailSignupDto } from '../registration-gate/dto/shorts-signup.dto';
import { ShortsSignupAnalyticsService } from '../registration-gate/shorts-signup-analytics.service';
import type { AuthUser } from './decorators/current-user.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly registrationGate: RegistrationGateService,
    private readonly registrationRequirements: RegistrationRequirementsService,
    private readonly config: ConfigService,
    private readonly portalTerms: PortalTermsService,
    private readonly shortsSignupAnalytics: ShortsSignupAnalyticsService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    return this.authService.register(dto, extractRequestClientMeta(req));
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const email = dto.email?.trim().toLowerCase() ?? '';
    this.logger.log(`[login] attempt email=${email || '(empty)'}`);
    try {
      const result = await this.authService.login(dto);
      this.logger.log(`[login] success email=${email}`);
      return result;
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && 'getStatus' in err
          ? (err as { getStatus: () => number }).getStatus()
          : 500;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[login] failed email=${email} status=${status} message=${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
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

  @Post('email-signup')
  async emailSignup(
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: EmailSignupDto,
    @Req() req: { ip?: string; headers?: Record<string, string | string[] | undefined> },
  ) {
    const meta = extractRequestClientMeta(req);
    const result = await this.authService.emailSignupFromShorts(dto.email, meta);
    if (result.success) {
      void this.shortsSignupAnalytics.track({
        eventName: result.isNewAccount ? 'shorts_signup_success' : 'shorts_signup_existing_email',
        userId: result.userId,
        utmSource: dto.utmSource,
        utmMedium: dto.utmMedium,
        utmCampaign: dto.utmCampaign,
        referrer: dto.referrer,
      });
      void this.shortsSignupAnalytics.track({
        eventName: 'shorts_signup_password_email_sent',
        userId: result.userId,
      });
    } else {
      void this.shortsSignupAnalytics.track({ eventName: 'shorts_signup_failed' });
    }
    return { success: result.success, message: result.message };
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
    if (result.success && result.userId) {
      void this.shortsSignupAnalytics.trackPasswordSetIfEligible(result.userId);
    }
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
  @Post('send-email-verification')
  sendEmailVerification(@CurrentUser() user: AuthUser) {
    return this.authService.sendEmailVerification(user.id);
  }

  @Get('verify-email')
  verifyEmail(@Query('token') token?: string) {
    return this.authService.verifyEmailByToken(String(token ?? ''));
  }

  @UseGuards(JwtAuthGuard)
  @Post('accept-terms')
  acceptTerms(
    @CurrentUser() user: AuthUser,
    @Req() req: { ip?: string; headers?: Record<string, string | string[] | undefined> },
  ) {
    return this.authService.acceptTerms(user.id, extractRequestClientMeta(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Request() req: { user: AuthUser }) {
    const profile = await this.usersService.getMeProfile(req.user.id);
    const isAdmin = profile?.role === 'ADMIN' || req.user.role === 'ADMIN';

    let firstContentCompleted = true;
    let requireFirstContent = false;
    let registrationRequirements: Awaited<
      ReturnType<RegistrationRequirementsService['getStatusForUser']>
    > | null = null;

    const role = (profile?.role ?? req.user.role) as UserRole;
    const isPropertySeeker = role === UserRole.PROPERTY_SEEKER;
    const isPortalWorker = role === UserRole.PORTAL_WORKER;

    if (!isAdmin && !isPropertySeeker && !isPortalWorker) {
      firstContentCompleted = await this.registrationGate.syncFirstContentStatus(
        req.user.id,
      );
      requireFirstContent = await this.registrationGate.getRequireFirstContent();
      registrationRequirements = await this.registrationRequirements.getStatusForUser(
        req.user.id,
        role,
      );
    } else if (isPropertySeeker || isPortalWorker) {
      firstContentCompleted = true;
      requireFirstContent = false;
      registrationRequirements = { allCompleted: true, pendingCount: 0, steps: [] };
    }

    const termsReacceptRequired = await this.portalTerms.userNeedsReaccept(req.user.id);
    const currentTerms = termsReacceptRequired ? await this.portalTerms.getCurrentPublished() : null;

    if (!profile) {
      console.log(`[auth/me] ROLE_LOADED userId=${req.user.id} role=${req.user.role} source=jwt`);
      return {
        ...req.user,
        role: req.user.role,
        firstContentCompleted,
        requireFirstContent,
        registrationRequirements,
        termsReacceptRequired,
        currentTermsVersion: currentTerms?.version ?? null,
      };
    }
    console.log(
      `[auth/me] ROLE_LOADED userId=${profile.id} role=${profile.role} jwtRole=${req.user.role}`,
    );
    return {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      phone: profile.phone,
      phonePublic: profile.phonePublic,
      role: profile.role,
      avatar: profile.avatarUrl,
      avatarCrop: profile.avatarCrop ?? null,
      coverImage: profile.coverImageUrl ?? null,
      coverCrop: profile.coverCrop ?? null,
      bio: profile.bio ?? null,
      emailVerified: profile.emailVerified,
      whatsappVerified: profile.whatsappVerified,
      portalWorkerStatus: profile.portalWorkerStatus ?? null,
      publicProfile: Boolean(profile.publicProfile),
      isTipar: profile.isTipar,
      profileRequirements: profile.profileRequirements,
      createdAt: profile.createdAt.toISOString(),
      firstContentCompleted,
      requireFirstContent,
      registrationRequirements,
      termsReacceptRequired,
      currentTermsVersion: currentTerms?.version ?? null,
    };
  }
}
