import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AiChatFeedbackRating,
  AiChatAdminReviewVerdict,
  AiChatReviewStatus,
  AiChatSessionStatus,
  AiKnowledgeStatus,
} from '@prisma/client';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiChatAdminService } from './ai-chat-admin.service';
import { AiChatKnowledgeService } from './ai-chat-knowledge.service';
import { AiChatPromptService } from './ai-chat-prompt.service';
import { AiChatSettingsService } from './ai-chat-settings.service';
import { AiChatService } from './ai-chat.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('admin/ai-chat')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiChatAdminController {
  private readonly log = new Logger(AiChatAdminController.name);

  constructor(
    private readonly chat: AiChatService,
    private readonly adminChat: AiChatAdminService,
    private readonly settings: AiChatSettingsService,
    private readonly knowledge: AiChatKnowledgeService,
    private readonly prompts: AiChatPromptService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('dashboard')
  getDashboard() {
    return this.chat.getDashboard();
  }

  @Get('settings')
  getSettings() {
    return this.settings.getOrCreate();
  }

  @Put('settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.settings.update(body as never);
  }

  @Get('sessions')
  listSessions(@Query('limit') limit?: string, @Query('q') q?: string) {
    return this.chat.listSessionsAdmin({
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      q,
    });
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string) {
    return this.chat.getSessionAdmin(id);
  }

  @Patch('sessions/:id/status')
  updateSessionStatus(@Param('id') id: string, @Body() body: { status: AiChatSessionStatus }) {
    return this.prisma.aiChatSession.update({ where: { id }, data: { status: body.status } });
  }

  @Post('sessions/:id/assign')
  assignSession(
    @Param('id') id: string,
    @Body() body: { assignedToUserId: string },
  ) {
    return this.prisma.aiChatSession.update({
      where: { id },
      data: { assignedToUserId: body.assignedToUserId },
    });
  }

  @Post('messages/:id/review')
  reviewMessage(
    @Param('id') id: string,
    @Body()
    body: {
      verdict: AiChatAdminReviewVerdict;
      correctAnswer?: string;
      createKnowledgeDraft?: boolean;
      category?: string;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const adminId = req.user?.id ?? req.user?.sub;
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.aiChatMessage.findUnique({ where: { id }, include: { session: true } });
      if (!message) throw new Error('Zpráva nenalezena.');

      const feedback = await tx.aiChatFeedback.create({
        data: {
          sessionId: message.sessionId,
          messageId: id,
          rating: AiChatFeedbackRating.DOWN,
          reviewStatus: AiChatReviewStatus.REVIEWED,
          adminVerdict: body.verdict,
          correctAnswer: body.correctAnswer ?? null,
          reviewedByAdminId: adminId ?? null,
          reviewedAt: new Date(),
        },
      });

      let knowledgeDraftId: string | null = null;
      if (body.createKnowledgeDraft && body.correctAnswer?.trim()) {
        const draft = await this.knowledge.createDraftFromFeedback({
          question: message.safeContent ?? message.content,
          answer: body.correctAnswer,
          category: body.category,
          createdById: adminId,
        });
        knowledgeDraftId = draft.id;
        await tx.aiChatFeedback.update({
          where: { id: feedback.id },
          data: { knowledgeDraftId: draft.id },
        });
      }

      return { feedback, knowledgeDraftId };
    });
  }

  @Get('feedback')
  listFeedback(@Query('reviewStatus') reviewStatus?: AiChatReviewStatus) {
    return this.prisma.aiChatFeedback.findMany({
      where: reviewStatus ? { reviewStatus } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { session: { select: { id: true, publicSessionId: true, detectedIntent: true } } },
    });
  }

  @Get('knowledge/:id')
  getKnowledge(@Param('id') id: string) {
    return this.knowledge.getById(id);
  }

  @Get('knowledge')
  listKnowledge(
    @Query('status') status?: AiKnowledgeStatus,
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('minPriority') minPriority?: string,
  ) {
    return this.knowledge.list({
      status,
      category,
      q,
      minPriority: minPriority ? Number.parseInt(minPriority, 10) : undefined,
    });
  }

  @Post('knowledge')
  createKnowledge(
    @Body()
    body: {
      title: string;
      category: string;
      question: string;
      answer: string;
      keywordsJson?: string[];
      priority?: number;
      validFrom?: string;
      validTo?: string;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.knowledge.create({
      ...body,
      validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
      validTo: body.validTo ? new Date(body.validTo) : undefined,
      createdById: req.user?.id ?? req.user?.sub,
    });
  }

  @Put('knowledge/:id')
  updateKnowledge(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.knowledge.update(id, body as never, req.user?.id ?? req.user?.sub);
  }

  @Post('knowledge/:id/approve')
  approveKnowledge(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.knowledge.approve(id, req.user?.id ?? req.user?.sub);
  }

  @Post('knowledge/:id/archive')
  archiveKnowledge(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.knowledge.archive(id, req.user?.id ?? req.user?.sub);
  }

  @Post('knowledge/:id/duplicate')
  duplicateKnowledge(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.knowledge.duplicate(id, req.user?.id ?? req.user?.sub);
  }

  @Post('knowledge/:id/test')
  testKnowledge(@Param('id') id: string, @Body() body: { message: string }) {
    return this.knowledge.testInChat(id, body.message ?? '');
  }

  @Delete('knowledge/:id')
  deleteKnowledge(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.knowledge.delete(id, req.user?.id ?? req.user?.sub);
  }

  @Get('prompts/active/:type')
  getActivePrompt(@Param('type') type: string) {
    return this.prompts.getActiveByType(type);
  }

  @Get('prompts')
  listPrompts(@Query('feature') feature?: string) {
    return this.prompts.listPrompts(feature);
  }

  @Get('prompts/:id')
  getPrompt(@Param('id') id: string) {
    return this.prompts.getById(id);
  }

  @Post('prompts')
  createPrompt(
    @Body()
    body: {
      feature: string;
      name?: string;
      version: string;
      systemPrompt: string;
      changeDescription?: string;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.prompts.createPrompt({ ...body, createdById: req.user?.id ?? req.user?.sub });
  }

  @Put('prompts/:id')
  updatePrompt(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.prompts.updatePrompt(id, body as never, req.user?.id ?? req.user?.sub);
  }

  @Post('prompts/:id/test')
  testPrompt(
    @Param('id') id: string,
    @Body() body: { message: string; pageType?: string; userRole?: string },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.adminChat.testPromptVersion(id, body, req.user?.id ?? req.user?.sub);
  }

  @Post('prompts/:id/activate')
  activatePrompt(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.prompts.activatePrompt(id, req.user?.id ?? req.user?.sub);
  }

  @Post('prompts/:id/archive')
  archivePrompt(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.prompts.archivePrompt(id, req.user?.id ?? req.user?.sub);
  }

  @Post('prompts/:id/duplicate')
  duplicatePrompt(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.prompts.duplicatePrompt(id, req.user?.id ?? req.user?.sub);
  }

  @Post('prompts/restore/:feature')
  restorePrompt(@Param('feature') feature: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.prompts.restorePreviousVersion(feature, req.user?.id ?? req.user?.sub);
  }

  @Delete('prompts/:id')
  deletePrompt(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.prompts.deletePrompt(id, req.user?.id ?? req.user?.sub);
  }

  @Get('diagnostics')
  getDiagnostics() {
    return this.adminChat.getDiagnostics();
  }

  @Post('test-connection')
  testConnection(@Req() req: { user?: { id?: string; sub?: string } }) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.adminChat.testConnectionOnly(userId);
  }

  @Post('test')
  async testChat(
    @Body() body: { message: string },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    const started = Date.now();
    try {
      const result = await this.adminChat.runAdminTest(body.message ?? '', userId);
      this.log.log(
        `POST /admin/ai-chat/test success model=${result.model} durationMs=${Date.now() - started}`,
      );
      return result;
    } catch (err) {
      this.log.warn(
        `POST /admin/ai-chat/test failed durationMs=${Date.now() - started}`,
      );
      throw err;
    }
  }

  @Get('analytics')
  getAnalytics() {
    return this.chat.getDashboard();
  }
}
