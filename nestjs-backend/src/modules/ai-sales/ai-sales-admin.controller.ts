import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AiSalesCampaignStatus,
  AiSalesMessageStatus,
  AiSalesPartnerType,
  AiSalesProspectStatus,
} from '@prisma/client';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiSalesAdminService } from './ai-sales-admin.service';
import { AiSalesAnalysisService } from './ai-sales-analysis.service';
import { AiSalesCampaignService } from './ai-sales-campaign.service';
import { AiSalesDashboardService } from './ai-sales-dashboard.service';
import { AiSalesMessageService } from './ai-sales-message.service';
import { parseCsv, AiSalesProspectService } from './ai-sales-prospect.service';
import { AiSalesSettingsService } from './ai-sales-settings.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('admin/ai-sales')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiSalesAdminController {
  constructor(
    private readonly prospects: AiSalesProspectService,
    private readonly analysis: AiSalesAnalysisService,
    private readonly messages: AiSalesMessageService,
    private readonly campaigns: AiSalesCampaignService,
    private readonly dashboard: AiSalesDashboardService,
    private readonly admin: AiSalesAdminService,
    private readonly settings: AiSalesSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  private userId(req: { user?: { id?: string; sub?: string } }) {
    return req.user?.id ?? req.user?.sub;
  }

  @Get('dashboard')
  getDashboard(@Query('days') days?: string) {
    return this.dashboard.getDashboard(days ? Number(days) : 7);
  }

  @Get('analytics')
  getAnalytics(@Query('days') days?: string) {
    return this.dashboard.getAnalytics(days ? Number(days) : 30);
  }

  @Get('tasks')
  listTasks(@Query('limit') limit?: string) {
    return this.dashboard.listTasks(limit ? Number(limit) : 50);
  }

  @Get('settings')
  getSettings() {
    return this.settings.getOrCreate();
  }

  @Put('settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.settings.update(body as never);
  }

  // ── Prospects ──

  @Get('prospects')
  listProspects(
    @Query('status') status?: AiSalesProspectStatus,
    @Query('partnerType') partnerType?: AiSalesPartnerType,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.prospects.list({
      status,
      partnerType,
      q,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get('prospects/:id')
  getProspect(@Param('id') id: string) {
    return this.prospects.getById(id);
  }

  @Post('prospects')
  createProspect(
    @Body() body: Record<string, unknown>,
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.prospects.create(body as never, this.userId(req));
  }

  @Put('prospects/:id')
  updateProspect(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.prospects.update(id, body as never);
  }

  @Post('prospects/import/preview')
  importPreview(@Body() body: { csv?: string; rows?: Array<Record<string, string>> }) {
    const rows = body.rows ?? (body.csv ? parseCsv(body.csv) : []);
    if (!rows.length) throw new BadRequestException('Prázdný import.');
    return this.prospects.importPreview(rows);
  }

  @Post('prospects/import')
  importProspects(
    @Body() body: { rows: Array<Record<string, unknown>> },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.prospects.importValid(body.rows ?? [], this.userId(req));
  }

  @Post('prospects/:id/analyze')
  analyzeProspect(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.analysis.analyzeProspect(id, this.userId(req));
  }

  @Post('prospects/:id/approve')
  approveProspect(@Param('id') id: string) {
    return this.prospects.approve(id);
  }

  @Post('prospects/:id/do-not-contact')
  doNotContact(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.prospects.markDoNotContact(id, body.reason, this.userId(req));
  }

  @Post('prospects/:id/generate-message')
  generateMessage(
    @Param('id') id: string,
    @Body() body: { campaignId?: string },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.analysis.generateOutreachMessage(id, this.userId(req), {
      campaignId: body.campaignId,
    });
  }

  // ── Messages ──

  @Get('messages')
  listMessages(
    @Query('status') status?: AiSalesMessageStatus,
    @Query('prospectId') prospectId?: string,
  ) {
    return this.messages.list({ status, prospectId });
  }

  @Get('messages/:id')
  getMessage(@Param('id') id: string) {
    return this.messages.getById(id);
  }

  @Put('messages/:id')
  updateMessage(
    @Param('id') id: string,
    @Body() body: { subject?: string; content?: string },
  ) {
    return this.messages.updateContent(id, body);
  }

  @Post('messages/:id/approve')
  approveMessage(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.messages.approve(id, this.userId(req));
  }

  @Post('messages/:id/send')
  sendMessage(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.messages.send(id, this.userId(req));
  }

  @Post('messages/:id/schedule')
  scheduleMessage(
    @Param('id') id: string,
    @Body() body: { scheduledAt: string },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.messages.schedule(id, new Date(body.scheduledAt), this.userId(req));
  }

  @Post('messages/:id/regenerate')
  regenerateMessage(
    @Param('id') id: string,
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const msg = this.messages.getById(id);
    return msg.then((m) =>
      this.analysis.generateOutreachMessage(m.prospectId, this.userId(req), {
        campaignId: m.campaignId ?? undefined,
      }),
    );
  }

  @Post('messages/:id/reject')
  rejectMessage(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.messages.reject(id, this.userId(req));
  }

  // ── Replies ──

  @Get('replies')
  listReplies() {
    return this.prisma.aiSalesReplyAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        message: {
          include: {
            prospect: { select: { id: true, companyName: true, email: true } },
          },
        },
      },
    });
  }

  @Get('replies/:id')
  getReply(@Param('id') id: string) {
    return this.prisma.aiSalesReplyAnalysis.findUnique({
      where: { id },
      include: { message: { include: { prospect: true } } },
    });
  }

  @Post('replies/:messageId/classify')
  classifyReply(
    @Param('messageId') messageId: string,
    @Body() body: { replyText: string },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.messages.classifyReply(messageId, body.replyText, this.userId(req));
  }

  @Delete('replies/:id')
  deleteReply(@Param('id') id: string) {
    return this.prisma.aiSalesReplyAnalysis.delete({ where: { id } });
  }

  @Post('replies/:id/create-lead')
  async createLeadFromReply(
    @Param('id') id: string,
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    const analysis = await this.prisma.aiSalesReplyAnalysis.findUnique({
      where: { id },
      include: { message: true },
    });
    if (!analysis) throw new BadRequestException('Analýza nenalezena.');
    return this.prisma.aiSalesLead.create({
      data: {
        prospectId: analysis.message.prospectId,
        campaignId: analysis.message.campaignId,
        status: 'NEW',
        interestScore: Math.round((analysis.confidence ?? 0.5) * 100),
        summary: analysis.summary,
        nextAction: analysis.recommendedAction,
        assignedToId: this.userId(req),
      },
    });
  }

  // ── Campaigns ──

  @Get('campaigns')
  listCampaigns(@Query('status') status?: AiSalesCampaignStatus) {
    return this.campaigns.list(status);
  }

  @Post('campaigns')
  createCampaign(
    @Body() body: Record<string, unknown>,
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.campaigns.create(body as never, this.userId(req));
  }

  @Put('campaigns/:id')
  updateCampaign(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.campaigns.update(id, body as never);
  }

  @Post('campaigns/:id/activate')
  activateCampaign(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.campaigns.activate(id, this.userId(req));
  }

  @Post('campaigns/:id/pause')
  pauseCampaign(@Param('id') id: string) {
    return this.campaigns.pause(id);
  }

  // ── Test ──

  @Post('test')
  runTest(
    @Body()
    body: {
      companyName: string;
      partnerType: string;
      city?: string;
      website?: string;
      publicInfo?: string;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.admin.runTest({ ...body, userId: this.userId(req) });
  }

  @Post('seed')
  async runSeed() {
    const { AiSalesSeedService } = await import('./ai-sales-seed.service');
    const seed = new AiSalesSeedService(this.prisma);
    await seed.seedIfEmpty();
    return { success: true };
  }
}
