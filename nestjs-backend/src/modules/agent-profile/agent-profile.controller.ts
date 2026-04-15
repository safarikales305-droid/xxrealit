import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { parseBearerUserId } from '../auth/auth-token.util';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentProfileService } from './agent-profile.service';
import { SubmitAgentRequestDto } from './dto/submit-agent-request.dto';
import { SubmitCompanyRequestDto } from './dto/submit-company-request.dto';
import { SubmitAgencyRequestDto } from './dto/submit-agency-request.dto';
import { SubmitFinancialAdvisorRequestDto } from './dto/submit-financial-advisor-request.dto';
import { SubmitInvestorRequestDto } from './dto/submit-investor-request.dto';

@Controller('agent-profile')
export class AgentProfileController {
  constructor(
    private readonly agentProfileService: AgentProfileService,
    private readonly jwt: JwtService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMine(@CurrentUser() user: AuthUser) {
    return this.agentProfileService.getMine(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('request')
  submitRequest(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SubmitAgentRequestDto,
  ) {
    return this.agentProfileService.submitRequest(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('request/company')
  submitCompanyRequest(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SubmitCompanyRequestDto,
  ) {
    return this.agentProfileService.submitCompanyRequest(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('request/agency')
  submitAgencyRequest(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SubmitAgencyRequestDto,
  ) {
    return this.agentProfileService.submitAgencyRequest(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('request/financial-advisor')
  submitFinancialAdvisorRequest(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SubmitFinancialAdvisorRequestDto,
  ) {
    return this.agentProfileService.submitFinancialAdvisorRequest(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('request/investor')
  submitInvestorRequest(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SubmitInvestorRequestDto,
  ) {
    return this.agentProfileService.submitInvestorRequest(user.id, dto);
  }

  /** Veřejný profil ověřeného makléře + inzeráty (volitelné JWT pro „liked“ u inzerátů). */
  @Get('public/:userId')
  getPublic(
    @Param('userId') userId: string,
    @Headers('authorization') auth?: string,
  ) {
    const viewerId = parseBearerUserId(this.jwt, auth);
    return this.agentProfileService.getPublicVerifiedByUserId(userId, viewerId);
  }
}
