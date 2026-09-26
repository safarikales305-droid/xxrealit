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
import { AiVisualizationService } from './ai-visualization.service';

type AuthedRequest = { user?: { id: string } };

@Controller('public/ai-visualization')
export class AiVisualizationPublicController {
  constructor(private readonly viz: AiVisualizationService) {}

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
}
