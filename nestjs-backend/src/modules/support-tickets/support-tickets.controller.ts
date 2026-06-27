import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CreateSupportMessageDto, CreateSupportTicketDto } from './dto/support-tickets.dto';
import { SupportTicketsService } from './support-tickets.service';

function clientMeta(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): { ip?: string; userAgent?: string } {
  const forwarded = req.headers?.['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
    req.ip ??
    undefined;
  const ua = req.headers?.['user-agent'];
  return {
    ip,
    userAgent: typeof ua === 'string' ? ua.slice(0, 512) : undefined,
  };
}

@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private readonly support: SupportTicketsService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  create(
    @Body() dto: CreateSupportTicketDto,
    @CurrentUser() user: AuthUser | null,
    @Req() req: { ip?: string; headers?: Record<string, string | string[] | undefined> },
  ) {
    return this.support.createTicket(dto, user?.id ?? null, clientMeta(req));
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: AuthUser) {
    return this.support.listMyTickets(user.id);
  }

  @Get('my/:id')
  @UseGuards(JwtAuthGuard)
  getMine(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.support.getMyTicket(user.id, id);
  }

  @Post('my/:id/messages')
  @UseGuards(JwtAuthGuard)
  replyMine(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateSupportMessageDto,
  ) {
    return this.support.addCustomerMessage(user.id, id, dto);
  }
}
