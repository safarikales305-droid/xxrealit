import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AiVisualizationEventName } from '@prisma/client';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiVisualizationService } from './ai-visualization.service';
import { AiRenovationService } from './ai-renovation.service';
import { AiRenovationMaterialTier, AiRenovationRecipientStatus } from '@prisma/client';

type AuthedRequest = { user?: { id: string; email?: string; name?: string } };

@Controller('public/ai-visualization')
export class AiVisualizationPublicController {
  constructor(
    private readonly viz: AiVisualizationService,
    private readonly renovation: AiRenovationService,
  ) {}

  @Get('config')
  getConfig() {
    return this.viz.getPublicConfig();
  }

  @Post('event')
  @HttpCode(HttpStatus.NO_CONTENT)
  async trackEvent(
    @Body()
    body: {
      eventName: AiVisualizationEventName;
      visualizationId?: string;
      anonymousSessionId?: string;
      meta?: Record<string, unknown>;
    },
    @Req() req: AuthedRequest,
  ) {
    await this.viz.trackEvent({
      eventName: body.eventName,
      visualizationId: body.visualizationId,
      anonymousSessionId: body.anonymousSessionId,
      userId: req.user?.id,
      meta: body.meta,
    });
  }

  @Post('upload')
  @UseGuards(OptionalJwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('anonymousSessionId') anonymousSessionId: string,
    @Req() req: AuthedRequest,
    @Ip() ip: string,
  ) {
    if (!anonymousSessionId?.trim()) {
      throw new BadRequestException('Chybí relace prohlížeče.');
    }
    return this.viz.createDraftFromUpload({
      file,
      anonymousSessionId: anonymousSessionId.trim(),
      userId: req.user?.id,
      ip,
    });
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  generate(
    @Body()
    body: {
      visualizationId: string;
      anonymousSessionId: string;
      propertyType: string;
      style: string;
      renovationLevel: 'LIGHT' | 'RENOVATION' | 'MAJOR';
      userPrompt?: string;
      idempotencyKey: string;
      parentId?: string;
      marketingConsent?: boolean;
    },
    @Req() req: AuthedRequest,
    @Ip() ip: string,
  ) {
    return this.viz.queueGeneration({
      ...body,
      userId: req.user?.id,
      ip,
    });
  }

  @Get('status/:id')
  @UseGuards(OptionalJwtAuthGuard)
  status(
    @Param('id') id: string,
    @Req() req: AuthedRequest & { query: { anonymousSessionId?: string } },
  ) {
    const sid = req.query.anonymousSessionId ?? '';
    if (!sid) throw new BadRequestException('Chybí anonymousSessionId.');
    return this.viz.getVisualizationForClient(id, sid, req.user?.id);
  }

  @Get('share/:publicShareId')
  getShare(@Param('publicShareId') publicShareId: string) {
    return this.viz.getShareView(publicShareId);
  }

  @Post(':id/share')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  share(
    @Param('id') id: string,
    @Body('anonymousSessionId') anonymousSessionId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.viz.enableShare(id, anonymousSessionId, req.user?.id);
  }

  @Post('renovation/estimate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  createRenovationEstimate(
    @Body()
    body: {
      visualizationId: string;
      anonymousSessionId: string;
      location?: string;
      areaSqm?: number;
      scopePartial?: boolean;
      materialTier?: AiRenovationMaterialTier;
    },
    @Req() req: AuthedRequest,
  ) {
    return this.renovation.createEstimate({
      ...body,
      userId: req.user?.id,
    });
  }

  @Get('renovation/companies')
  @UseGuards(OptionalJwtAuthGuard)
  listRenovationCompanies(
    @Req() req: { query: { visualizationId?: string; location?: string; limit?: string } },
  ) {
    const visualizationId = req.query.visualizationId?.trim();
    if (!visualizationId) throw new BadRequestException('Chybí visualizationId.');
    return this.renovation.findCompanies({
      visualizationId,
      location: req.query.location,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
  }

  @Post('renovation/request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  sendRenovationRequest(
    @Body()
    body: {
      visualizationId: string;
      estimateId: string;
      anonymousSessionId: string;
      email?: string;
      phone?: string;
      companyIds: string[];
      transferConsent: boolean;
      marketingConsent?: boolean;
      idempotencyKey: string;
      description?: string;
    },
    @Req() req: AuthedRequest,
  ) {
    return this.renovation.createAndSendRequest({
      ...body,
      userId: req.user?.id,
      userEmail: req.user?.email,
      userName: req.user?.name,
    });
  }
}

@Controller('public/ai-renovation')
export class AiRenovationPublicController {
  constructor(private readonly renovation: AiRenovationService) {}

  @Get('poptavka/:publicId')
  @UseGuards(OptionalJwtAuthGuard)
  getPoptavka(@Param('publicId') publicId: string, @Req() req: AuthedRequest) {
    return this.renovation.getPublicRequest(publicId, req.user?.id);
  }

  @Post('poptavka/:publicId/respond')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  respond(
    @Param('publicId') publicId: string,
    @Body()
    body: {
      companyId: string;
      status: AiRenovationRecipientStatus;
      offerPrice?: number;
      offerMessage?: string;
    },
    @Req() req: AuthedRequest & { user?: { id: string } },
  ) {
    if (!req.user?.id) throw new BadRequestException('Přihlaste se jako firma.');
    return this.renovation.respondAsCompany({
      publicId,
      companyId: body.companyId,
      userId: req.user.id,
      status: body.status,
      offerPrice: body.offerPrice,
      offerMessage: body.offerMessage,
    });
  }
}
