import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AiChatService } from './ai-chat.service';

@Controller('ai-chat')
export class AiChatPublicController {
  constructor(private readonly chat: AiChatService) {}

  @Get('config')
  getConfig(@Query('pageType') pageType?: string, @Query('path') path?: string) {
    return this.chat.getPublicConfig({ pageType, path });
  }

  @Post('sessions')
  @UseGuards(OptionalJwtAuthGuard)
  createSession(
    @Body()
    body: {
      sourcePageType?: string;
      sourceUrl?: string;
      sourceEntityId?: string;
      sourceContext?: Record<string, unknown>;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.chat.createSession({ ...body, userId });
  }

  @Get('sessions/:publicSessionId')
  @UseGuards(OptionalJwtAuthGuard)
  getSession(
    @Param('publicSessionId') publicSessionId: string,
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.chat.getSession(publicSessionId, userId);
  }

  @Post('sessions/:publicSessionId/messages')
  @UseGuards(OptionalJwtAuthGuard)
  sendMessage(
    @Param('publicSessionId') publicSessionId: string,
    @Body() body: { content: string; quickActionId?: string },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.chat.sendMessage(publicSessionId, { ...body, userId });
  }

  @Post('sessions/:publicSessionId/feedback')
  @UseGuards(OptionalJwtAuthGuard)
  submitFeedback(
    @Param('publicSessionId') publicSessionId: string,
    @Body()
    body: { messageId?: string; rating: 'UP' | 'DOWN'; category?: string; comment?: string },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.chat.submitFeedback(publicSessionId, { ...body, userId });
  }

  @Post('sessions/:publicSessionId/request-contact')
  @UseGuards(OptionalJwtAuthGuard)
  requestContact(
    @Param('publicSessionId') publicSessionId: string,
    @Body()
    body: {
      name?: string;
      email?: string;
      phone?: string;
      consentStorage: boolean;
      consentTransfer: boolean;
      consentContact: boolean;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.chat.requestContact(publicSessionId, { ...body, userId });
  }

  @Post('sessions/:publicSessionId/close')
  closeSession(@Param('publicSessionId') publicSessionId: string) {
    return this.chat.closeSession(publicSessionId);
  }
}
