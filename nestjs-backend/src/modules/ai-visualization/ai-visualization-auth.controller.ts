import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiVisualizationService } from './ai-visualization.service';
import { AiVisualizationStorageService } from './ai-visualization-storage.service';
import { AiVisualizationSettingsService } from './ai-visualization-settings.service';
import { AiVisualizationWatermarkService } from './ai-visualization-watermark.service';

type AuthedRequest = { user: { id: string } };

@Controller('ai-visualization')
@UseGuards(JwtAuthGuard)
export class AiVisualizationAuthController {
  constructor(
    private readonly viz: AiVisualizationService,
    private readonly storage: AiVisualizationStorageService,
    private readonly settings: AiVisualizationSettingsService,
    private readonly watermark: AiVisualizationWatermarkService,
  ) {}

  @Get('me')
  listMine(@Req() req: AuthedRequest) {
    return this.viz.listMine(req.user.id);
  }

  @Post('claim/:id')
  @HttpCode(HttpStatus.OK)
  claim(
    @Param('id') id: string,
    @Body('anonymousSessionId') anonymousSessionId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.viz.claimVisualization(id, anonymousSessionId ?? '', req.user.id);
  }

  @Get('download/:id')
  async download(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const row = await this.viz.assertDownloadAllowed(id, req.user.id);
    const buffer = await this.storage.downloadBuffer(row.resultCloudinaryId!);
    const s = await this.settings.getSettings();
    let out = buffer;
    if (s.watermarkOnDownload) {
      out = await this.watermark.applyPreviewWatermark(out, true, s.watermarkPosition);
    }

    await this.viz.trackEvent({
      eventName: 'ai_visualization_download',
      visualizationId: id,
      userId: req.user.id,
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="xxrealit-vizualizace-${id}.png"`);
    res.send(out);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteOne(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.viz.deleteMine(id, req.user.id);
  }
}
