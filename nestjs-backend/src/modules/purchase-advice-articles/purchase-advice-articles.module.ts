import { Module } from '@nestjs/common';
import { PurchaseAdviceArticlesAdminController } from './purchase-advice-articles-admin.controller';
import { PurchaseAdviceArticlesController } from './purchase-advice-articles.controller';
import { PurchaseAdviceArticlesService } from './purchase-advice-articles.service';

@Module({
  controllers: [PurchaseAdviceArticlesController, PurchaseAdviceArticlesAdminController],
  providers: [PurchaseAdviceArticlesService],
  exports: [PurchaseAdviceArticlesService],
})
export class PurchaseAdviceArticlesModule {}
