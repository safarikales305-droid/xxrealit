import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@Controller('conversations')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @UseGuards(JwtAuthGuard)
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    const count = await this.messages.unreadCount(user.id);
    return { count };
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('folder') folder?: string,
  ) {
    const f =
      folder === 'inbox' || folder === 'sent' || folder === 'all'
        ? folder
        : 'all';
    return this.messages.listConversations(user.id, f);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  createOrGet(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateConversationDto,
  ) {
    return this.messages.getOrCreateConversation(user.id, dto.propertyId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.messages.getConversationDetail(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/messages')
  send(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messages.sendMessage(user.id, id, dto.body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.messages.markConversationRead(user.id, id);
  }
}
