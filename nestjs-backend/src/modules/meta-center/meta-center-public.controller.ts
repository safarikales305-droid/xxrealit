import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetaCatalogService } from '../meta-catalog/meta-catalog.service';

@Controller('public/meta')
export class MetaCenterPublicController {
  constructor(private readonly catalog: MetaCatalogService) {}

  @Get('feed.csv')
  async feedCsv(@Res() res: Response) {
    const body = await this.catalog.buildCsvFeed();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(body);
  }

  @Get('feed.xml')
  async feedXml(@Res() res: Response) {
    const body = await this.catalog.buildXmlFeed();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(body);
  }

  @Get('feed.json')
  async feedJson(@Res() res: Response) {
    const body = await this.catalog.buildJsonFeed();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(body);
  }
}
