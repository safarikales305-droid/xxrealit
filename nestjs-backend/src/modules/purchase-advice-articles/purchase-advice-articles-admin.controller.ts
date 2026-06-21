import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePurchaseAdviceArticleDto } from './dto/create-purchase-advice-article.dto';
import { UpdatePurchaseAdviceArticleDto } from './dto/update-purchase-advice-article.dto';
import { PurchaseAdviceArticlesService } from './purchase-advice-articles.service';

@Controller('admin/purchase-advice-articles')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PurchaseAdviceArticlesAdminController {
  constructor(private readonly articles: PurchaseAdviceArticlesService) {}

  @Get()
  list() {
    return this.articles.listForAdmin();
  }

  @Post()
  create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreatePurchaseAdviceArticleDto,
  ) {
    return this.articles.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdatePurchaseAdviceArticleDto,
  ) {
    return this.articles.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.articles.delete(id);
  }
}
