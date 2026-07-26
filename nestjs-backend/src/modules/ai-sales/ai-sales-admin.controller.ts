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
import { PartnerSearchService } from './partner-search.service';
import { PrismaService } from '../../database/prisma.service';
import { AiSalesAdminException, mapExceptionToSalesAdminError } from './ai-sales-errors.util';

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
    private readonly search: PartnerSearchService,
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

  @Post('prospects/:id/reject')
  rejectProspect(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.prospects.reject(id, body.reason);
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

  // ── Search ──

  @Get('diagnostics')
  getDiagnostics() {
    return this.admin.getDiagnostics();
  }

  @Get('prompts')
  listPrompts() {
    return this.prisma.aiPromptVersion.findMany({
      where: { feature: { startsWith: 'AI_SALES_' } },
      orderBy: [{ feature: 'asc' }, { createdAt: 'desc' }],
    });
  }

  @Get('knowledge')
  listKnowledge() {
    return this.prisma.aiKnowledgeItem.findMany({
      where: {
        category: {
          in: [
            'XXREALIT_GENERAL', 'AGENT_OFFER', 'AGENCY_OFFER', 'CONSTRUCTION_COMPANY_OFFER',
            'DEVELOPER_OFFER', 'FINANCIAL_ADVISOR_OFFER', 'INVESTOR_OFFER', 'PRICING',
            'REGISTRATION', 'MARKETING', 'LEADS', 'SOCIAL_PUBLISHING', 'CONTACT_RULES',
            'LEGAL_AND_PRIVACY', 'FREQUENT_OBJECTIONS',
          ],
        },
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  @Get('search-providers')
  listSearchProviders() {
    return this.search.listProviders();
  }

  @Post('search-providers/:id/test')
  testSearchProvider(@Param('id') id: string) {
    return this.wrap(() => this.admin.testSearchProvider({ providerKey: id }));
  }

  @Put('search-providers/:id')
  async updateSearchProvider(@Param('id') id: string, @Body() body: { enabled?: boolean }) {
    return this.prisma.aiSalesSearchProvider.update({
      where: { id },
      data: { enabled: body.enabled },
    });
  }

  @Post('search')
  startSearch(
    @Body()
    body: {
      partnerType?: AiSalesPartnerType;
      region?: string;
      district?: string;
      city?: string;
      keywords?: string[];
      specialization?: string;
      sources?: string[];
      limit?: number;
      minFitScore?: number;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.wrap(() =>
      this.search.startSearch(
        {
          ...body,
          sources: body.sources as never,
        },
        this.userId(req),
      ),
    );
  }

  @Get('searches')
  listSearches() {
    return this.search.listSearches();
  }

  @Get('searches/:id')
  getSearch(@Param('id') id: string) {
    return this.search.getSearch(id);
  }

  @Get('searches/:id/results')
  getSearchResults(@Param('id') id: string) {
    return this.search.getSearchResults(id);
  }

  @Post('searches/:id/cancel')
  cancelSearch(@Param('id') id: string) {
    return this.search.cancelSearch(id);
  }

  @Post('search-results/:id/save')
  saveSearchResult(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.search.saveSearchResult(id, this.userId(req));
  }

  @Post('search-results/:id/reject')
  rejectSearchResult(@Param('id') id: string) {
    return this.search.rejectSearchResult(id);
  }

  @Post('search-results/:id/verify')
  verifySearchResult(@Param('id') id: string) {
    return this.search.verifySearchResult(id);
  }

  @Post('search-results/:id/analyze')
  analyzeSearchResult(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.wrap(async () => {
      const result = await this.prisma.aiSalesSearchResult.findUnique({ where: { id } });
      if (!result) throw new BadRequestException('Výsledek nenalezen.');
      const prospect = await this.search.saveSearchResult(id, this.userId(req));
      if (!prospect) throw new BadRequestException('Partner se nepodařilo uložit.');
      return this.analysis.analyzeProspect(prospect.id, this.userId(req));
    });
  }

  @Post('search-results/:id/do-not-contact')
  dncSearchResult(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.search.markResultDoNotContact(id, body.reason);
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
      publicInformation?: string;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.wrap(() => this.admin.testAnalysis({ ...body, userId: this.userId(req) }));
  }

  @Post('test-openai')
  testOpenAi(@Req() req: { user?: { id?: string; sub?: string } }) {
    return this.wrap(() => this.admin.testOpenAi(this.userId(req)));
  }

  @Post('test-analysis')
  testAnalysis(
    @Body()
    body: {
      companyName: string;
      partnerType: string;
      city?: string;
      website?: string;
      publicInformation?: string;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.wrap(() => this.admin.testAnalysis({ ...body, userId: this.userId(req) }));
  }

  @Post('test-search-provider')
  testSearchProviderBody(
    @Body() body: { providerKey?: string; partnerType?: string; city?: string; limit?: number },
  ) {
    return this.wrap(() => this.admin.testSearchProvider(body));
  }

  @Post('seed')
  async runSeed() {
    const { AiSalesSeedService } = await import('./ai-sales-seed.service');
    const seed = new AiSalesSeedService(this.prisma);
    await seed.seedIfEmpty();
    return { success: true };
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AiSalesAdminException) throw err;
      const mapped = mapExceptionToSalesAdminError(err);
      throw new AiSalesAdminException(mapped);
    }
  }
}
