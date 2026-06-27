import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  AdminUpdateSupportTicketDto,
  CreateSupportMessageDto,
} from './dto/support-tickets.dto';
import { SupportTicketsService } from './support-tickets.service';

@Controller('admin/support-tickets')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SupportTicketsAdminController {
  constructor(private readonly support: SupportTicketsService) {}

  @Get('stats')
  stats() {
    return this.support.adminStats();
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.support.adminList({ status, category, assignedToId, q, from, to });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.support.adminGet(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: AdminUpdateSupportTicketDto) {
    return this.support.adminUpdate(id, dto);
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateSupportMessageDto & { isInternalNote?: boolean },
  ) {
    return this.support.adminReply(user.id, id, dto);
  }
}
