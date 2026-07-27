import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { AiSalesCrmService } from './ai-sales-crm.service';
import { AiSalesDashboardService } from './ai-sales-dashboard.service';
import { AiSalesFollowUpService } from './ai-sales-followup.service';
import { AiSalesKnowledgeAdminService } from './ai-sales-knowledge-admin.service';
import { AiSalesMessageService } from './ai-sales-message.service';
import { AiSalesPromptAdminService } from './ai-sales-prompt-admin.service';
import { parseCsv, AiSalesProspectService } from './ai-sales-prospect.service';
import { AiSalesSettingsService } from './ai-sales-settings.service';
import { PartnerSearchService } from './partner-search.service';
import { PartnerContactEnrichmentService } from './partner-contact-enrichment.service';
import { AiSalesPublicContactService } from './ai-sales-public-contact.service';
import { AiSalesOutreachGenerationService } from './ai-sales-outreach-generation.service';
import { PrismaService } from '../../database/prisma.service';
import { AiSalesAdminException, mapExceptionToSalesAdminError } from './ai-sales-errors.util';

@Controller('admin/ai-sales')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiSalesAdminController {
  constructor(
    private readonly prospects: AiSalesProspectService,
    private readonly analysis: AiSalesAnalysisService,
    private readonly outreach: AiSalesOutreachGenerationService,
    private readonly messages: AiSalesMessageService,
    private readonly campaigns: AiSalesCampaignService,
    private readonly dashboard: AiSalesDashboardService,
    private readonly crm: AiSalesCrmService,
    private readonly followUp: AiSalesFollowUpService,
    private readonly promptAdmin: AiSalesPromptAdminService,
    private readonly knowledgeAdmin: AiSalesKnowledgeAdminService,
    private readonly admin: AiSalesAdminService,
    private readonly settings: AiSalesSettingsService,
    private readonly search: PartnerSearchService,
    private readonly contactEnrichment: PartnerContactEnrichmentService,
    private readonly publicContacts: AiSalesPublicContactService,
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

  @Post('prospects/:id/import-search-contacts')
  importSearchContacts(
    @Param('id') id: string,
    @Body()
    body: {
      selectedContactIds?: string[];
      primaryEmailContactId?: string;
      primaryPhoneContactId?: string;
    },
  ) {
    return this.wrap(() =>
      this.publicContacts.importSearchContactsForProspect(id, {
        ...body,
        explicitEmptySelection:
          Array.isArray(body.selectedContactIds) && body.selectedContactIds.length === 0,
      }),
    );
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
    return this.wrap(() => this.analysis.analyzeProspect(id, this.userId(req)), 'analysis');
  }

  // ── CRM ──

  @Get('crm/partners')
  listCrmPartners(
    @Query('status') status?: AiSalesProspectStatus,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.crm.listPartners({ status, q, limit: limit ? Number(limit) : 100 });
  }

  @Get('crm/partners/:id')
  getCrmPartner(@Param('id') id: string) {
    return this.crm.getPartnerCard(id);
  }

  @Put('crm/partners/:id')
  updateCrmPartner(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.crm.updatePartnerCrm(id, body as never);
  }

  @Post('crm/partners/:id/memories')
  addPartnerMemory(
    @Param('id') id: string,
    @Body() body: { memoryType: string; content: string; source?: string },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.crm.addMemory(id, body, this.userId(req));
  }

  @Delete('crm/memories/:memoryId')
  deletePartnerMemory(@Param('memoryId') memoryId: string) {
    return this.crm.deleteMemory(memoryId);
  }

  // ── Follow-up ──

  @Get('follow-up')
  listFollowUps(@Query('limit') limit?: string) {
    return this.followUp.listFollowUps(limit ? Number(limit) : 50);
  }

  @Post('follow-up/scan')
  scanFollowUps(@Req() req: { user?: { id?: string; sub?: string } }) {
    return this.followUp.scanAndCreateSuggestions(this.userId(req));
  }

  @Post('follow-up/messages/:messageId/draft')
  draftFollowUp(
    @Param('messageId') messageId: string,
    @Body() body: { tier: 1 | 2 },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.followUp.generateFollowUpDraft(messageId, body.tier ?? 1, this.userId(req));
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

  @Post('prospects/:id/generate-offer')
  generateOffer(
    @Param('id') id: string,
    @Body() body: { campaignId?: string; tone?: string; variantCount?: number; skipAnalysis?: boolean },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.wrap(() =>
      this.outreach.generateOffer(id, this.userId(req), {
        campaignId: body.campaignId,
        tone: body.tone as never,
        variantCount: body.variantCount ?? 3,
        skipAnalysis: body.skipAnalysis,
      }),
      'generate_offer',
    );
  }

  @Post('prospects/:id/generate-message')
  generateMessage(
    @Param('id') id: string,
    @Body() body: { campaignId?: string; tone?: string; variantCount?: number },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.wrap(() =>
      this.outreach.generateVariants(id, this.userId(req), {
        campaignId: body.campaignId,
        tone: body.tone as never,
        variantCount: body.variantCount ?? 3,
      }),
    );
  }

  @Post('prospects/:id/generate-message/manual')
  generateManualMessage(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.wrap(() => this.outreach.createManualDraft(id, this.userId(req)));
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

  @Get('messages/:id/preview')
  getMessagePreview(@Param('id') id: string) {
    return this.messages.getPreview(id);
  }

  @Delete('messages/:id')
  deleteMessage(@Param('id') id: string) {
    return this.wrap(() => this.messages.deleteMessage(id));
  }

  @Put('messages/:id')
  updateMessage(
    @Param('id') id: string,
    @Body()
    body: {
      subject?: string;
      content?: string;
      preheader?: string;
      greeting?: string;
      intro?: string;
      benefitsJson?: unknown;
      ctaText?: string;
      ctaUrl?: string;
      closing?: string;
      signature?: string;
      plainText?: string;
      htmlContent?: string;
      replyToEmail?: string;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.messages.updateContent(id, body, this.userId(req));
  }

  @Post('messages/:id/submit-for-approval')
  submitMessageForApproval(@Param('id') id: string) {
    return this.prisma.aiSalesMessage.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL' },
    });
  }

  @Post('messages/:id/approve')
  approveMessage(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.messages.approve(id, this.userId(req));
  }

  @Post('messages/:id/send')
  sendMessage(
    @Param('id') id: string,
    @Body() body: { mode?: 'immediate' | 'schedule'; scheduledAt?: string },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    if (body?.mode === 'schedule' && body.scheduledAt) {
      return this.messages.schedule(id, new Date(body.scheduledAt), this.userId(req));
    }
    return this.wrap(() => this.messages.send(id, this.userId(req), { manual: true }), 'send');
  }

  @Get('messages/:id/send-logs')
  listMessageSendLogs(@Param('id') id: string) {
    return this.messages.listSendLogs(id);
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
    return this.wrap(async () => {
      const m = await this.messages.getById(id);
      return this.outreach.generateSingle(m.prospectId, this.userId(req), {
        campaignId: m.campaignId ?? undefined,
        variantLabel: m.variantLabel ?? 'A',
      });
    });
  }

  @Post('messages/:id/send-test')
  sendTestMessage(
    @Param('id') id: string,
    @Body() body: { email: string },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.wrap(() => this.messages.sendTest(id, body.email, this.userId(req)));
  }

  @Get('messages/:id/recipients')
  listMessageRecipients(@Param('id') id: string) {
    return this.messages.listRecipients(id);
  }

  @Put('messages/:id/recipients')
  updateMessageRecipients(
    @Param('id') id: string,
    @Body() body: { recipients: Array<{ id: string; selected?: boolean; approved?: boolean }> },
  ) {
    return this.messages.updateRecipients(id, body.recipients ?? []);
  }

  @Post('messages/:id/recipients/select-all')
  selectAllMessageRecipients(@Param('id') id: string) {
    return this.messages.selectAllRecipients(id, 'all');
  }

  @Post('messages/:id/recipients/select-primary')
  selectPrimaryMessageRecipients(@Param('id') id: string) {
    return this.messages.selectAllRecipients(id, 'primary');
  }

  @Get('messages/:id/versions')
  listMessageVersions(@Param('id') id: string) {
    return this.messages.listVersions(id);
  }

  @Post('messages/:id/versions/:versionId/restore')
  restoreMessageVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.messages.restoreVersion(id, versionId, this.userId(req));
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

  @Post('search-results/:id/enrich')
  enrichSearchResult(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.wrap(() => this.contactEnrichment.enrichSearchResult(id, this.userId(req)));
  }

  @Post('search-results/enrich-batch')
  enrichSearchResultsBatch(
    @Body() body: { searchResultIds: string[] },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.wrap(() =>
      this.contactEnrichment.enrichSearchResultBatch(body.searchResultIds ?? [], this.userId(req)),
    );
  }

  @Get('search-results/:id/contacts')
  getSearchResultContacts(@Param('id') id: string) {
    return this.contactEnrichment.getContactsForSearchResult(id);
  }

  @Post('search-results/:id/select-contact')
  selectSearchResultContact(
    @Param('id') id: string,
    @Body() body: { contactId: string; type: 'EMAIL' | 'PHONE' },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.contactEnrichment.selectContact(id, body.contactId, body.type, this.userId(req));
  }

  @Post('prospects/:id/enrich')
  enrichProspect(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.wrap(() => this.contactEnrichment.enrichProspect(id, this.userId(req)));
  }

  @Get('prospects/:id/contacts')
  getProspectContacts(@Param('id') id: string) {
    return this.publicContacts.listForProspect(id);
  }

  @Post('prospects/:id/contacts')
  createProspectContact(
    @Param('id') id: string,
    @Body()
    body: {
      type: 'EMAIL' | 'PHONE' | 'CONTACT_FORM' | 'OTHER';
      value: string;
      label?: string;
      contactPersonName?: string;
      contactPersonRole?: string;
      sourceUrl?: string;
      isPrimary?: boolean;
      isSelectedForOutreach?: boolean;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.wrap(() => this.publicContacts.createForProspect(id, body, this.userId(req)));
  }

  @Put('prospects/:id/contacts/:contactId')
  updateProspectPublicContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body()
    body: {
      value?: string;
      label?: string | null;
      contactPersonName?: string | null;
      contactPersonRole?: string | null;
      sourceUrl?: string | null;
      isSelectedForOutreach?: boolean;
    },
  ) {
    return this.wrap(() => this.publicContacts.updateContact(id, contactId, body));
  }

  @Delete('prospects/:id/contacts/:contactId')
  deleteProspectPublicContact(@Param('id') id: string, @Param('contactId') contactId: string) {
    return this.wrap(() => this.publicContacts.deleteContact(id, contactId));
  }

  @Post('prospects/:id/contacts/:contactId/set-primary')
  setProspectContactPrimary(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.wrap(() => this.publicContacts.setPrimary(id, contactId, this.userId(req)));
  }

  @Post('prospects/:id/contacts/:contactId/toggle-outreach')
  toggleProspectContactOutreach(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() body: { enabled: boolean },
  ) {
    return this.wrap(() => this.publicContacts.toggleOutreach(id, contactId, body.enabled));
  }

  @Put('prospects/:id/contact')
  updateProspectContact(
    @Param('id') id: string,
    @Body()
    body: {
      email?: string | null;
      phone?: string | null;
      contactName?: string | null;
      position?: string | null;
      website?: string | null;
      contactSourceNote?: string | null;
      manualConfirm?: boolean;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.contactEnrichment.updateProspectContact(id, body, this.userId(req));
  }

  @Post('prospects/:id/verify-contact')
  verifyProspectContact(@Param('id') id: string) {
    return this.contactEnrichment.getContactsForProspect(id);
  }

  @Get('openai-diagnostics')
  @Header('Cache-Control', 'no-store')
  getOpenAiDiagnostics() {
    return this.admin.getOpenAiDiagnostics();
  }

  @Get('diagnostics')
  @Header('Cache-Control', 'no-store')
  getDiagnostics() {
    return this.admin.getDiagnostics();
  }

  @Get('prompts')
  listPrompts() {
    return this.promptAdmin.list();
  }

  @Get('prompts/:id')
  getPrompt(@Param('id') id: string) {
    return this.promptAdmin.getById(id);
  }

  @Post('prompts')
  createPrompt(
    @Body() body: { feature: string; name: string; version: string; systemPrompt: string; changeDescription?: string },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.promptAdmin.create({ ...body, createdById: this.userId(req) });
  }

  @Put('prompts/:id')
  updatePrompt(
    @Param('id') id: string,
    @Body() body: { name?: string; systemPrompt?: string; changeDescription?: string },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.promptAdmin.update(id, body, this.userId(req));
  }

  @Post('prompts/:id/activate')
  activatePrompt(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.promptAdmin.activate(id, this.userId(req));
  }

  @Get('knowledge')
  listKnowledge(@Query('q') q?: string, @Query('category') category?: string) {
    return this.knowledgeAdmin.list({ q, category });
  }

  @Get('knowledge/:id')
  getKnowledge(@Param('id') id: string) {
    return this.knowledgeAdmin.getById(id);
  }

  @Post('knowledge')
  createKnowledge(
    @Body() body: { title: string; category: string; question: string; answer: string; keywords?: string[]; priority?: number },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.knowledgeAdmin.create({ ...body, createdById: this.userId(req) });
  }

  @Put('knowledge/:id')
  updateKnowledge(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.knowledgeAdmin.update(id, body as never);
  }

  @Post('knowledge/:id/approve')
  approveKnowledge(@Param('id') id: string, @Req() req: { user?: { id?: string; sub?: string } }) {
    return this.knowledgeAdmin.approve(id, this.userId(req));
  }

  @Get('search-providers')
  @Header('Cache-Control', 'no-store')
  listSearchProviders() {
    return this.search.listProviders();
  }

  @Post('search-providers/:id/test')
  @Header('Cache-Control', 'no-store')
  testSearchProvider(@Param('id') id: string) {
    return this.wrap(() => this.search.testProvider(id));
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
  saveSearchResult(
    @Param('id') id: string,
    @Body()
    body: {
      selectedContactIds?: string[];
      primaryEmailContactId?: string;
      primaryPhoneContactId?: string;
    },
    @Req() req: { user?: { id?: string; sub?: string } },
  ) {
    return this.wrap(async () => {
      const saveResult = await this.search.saveSearchResult(id, this.userId(req), {
        selectedContactIds: body.selectedContactIds,
        primaryEmailContactId: body.primaryEmailContactId,
        primaryPhoneContactId: body.primaryPhoneContactId,
      });
      const prospect = saveResult.prospect;
      if (!prospect) throw new BadRequestException('Partner se nepodařilo uložit.');

      const settings = await this.settings.getOrCreate();
      let analysisStatus: 'PENDING' | 'SKIPPED' | 'FAILED' = saveResult.analysisStatus ?? 'PENDING';

      if (settings.autoAnalyzeOnSave) {
        analysisStatus = 'PENDING';
        void this.analysis
          .analyzeProspect(prospect.id, this.userId(req))
          .catch((err) => {
            const mapped = mapExceptionToSalesAdminError(err, 'analysis');
            console.warn(
              `[ai-sales] Auto analýza po uložení partnera ${prospect.id} selhala: ${mapped.code}`,
            );
          });
      } else {
        analysisStatus = 'SKIPPED';
      }

      return {
        ...saveResult,
        analysisStatus,
        savedWithoutEmail: !saveResult.primaryEmail,
        warning: !saveResult.primaryEmail
          ? 'Partner byl uložen bez e-mailu. Nabídku lze připravit a zobrazit, ale nelze ji odeslat.'
          : null,
      };
    });
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
      const saveResult = await this.search.saveSearchResult(id, this.userId(req));
      const prospect = saveResult.prospect;
      if (!prospect) throw new BadRequestException('Partner se nepodařilo uložit.');
      try {
        const analysis = await this.analysis.analyzeProspect(prospect.id, this.userId(req));
        return { success: true, prospect, analysis };
      } catch (err) {
        const mapped = mapExceptionToSalesAdminError(err, 'analysis');
        throw new AiSalesAdminException(mapped);
      }
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
    return this.wrap(() => this.analysis.runDryAnalysis({ ...body, userId: this.userId(req) }), 'analysis_test');
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
    return this.wrap(() => this.analysis.runDryAnalysis({ ...body, userId: this.userId(req) }), 'analysis_test');
  }

  @Post('test-search-provider')
  testSearchProviderBody(
    @Body() body: { providerKey?: string; partnerType?: string; city?: string; limit?: number },
  ) {
    return this.wrap(() => this.search.testProvider(body.providerKey ?? 'INTERNAL_DATABASE'));
  }

  @Post('seed')
  async runSeed() {
    const { AiSalesSeedService } = await import('./ai-sales-seed.service');
    const seed = new AiSalesSeedService(this.prisma);
    await seed.seedIfEmpty();
    return { success: true };
  }

  private async wrap<T>(fn: () => Promise<T>, phase?: string): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AiSalesAdminException) throw err;
      const mapped = mapExceptionToSalesAdminError(err, phase);
      throw new AiSalesAdminException(mapped);
    }
  }
}
