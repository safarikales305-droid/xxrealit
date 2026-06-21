import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { PurchaseAdviceArticlesService } from './purchase-advice-articles.service';

@Controller('purchase-advice-articles')
export class PurchaseAdviceArticlesController {
  constructor(private readonly articles: PurchaseAdviceArticlesService) {}

  @Get('public')
  listPublic(@Query('limit') limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : 12;
    return this.articles.listPublic(Number.isFinite(n) ? n : 12);
  }

  @Get('public/:id')
  async getPublic(@Param('id') id: string) {
    const row = await this.articles.getPublicById(id);
    if (!row) throw new NotFoundException('Článek nenalezen.');
    return row;
  }
}
