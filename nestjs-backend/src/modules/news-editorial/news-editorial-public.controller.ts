import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { NewsArticleService } from './news-article.service';

@Controller('news-editorial')
export class NewsEditorialPublicController {
  constructor(private readonly articles: NewsArticleService) {}

  @Get('articles')
  listArticles(@Query() query: Record<string, string | undefined>) {
    return this.articles.listPublishedPublic(query);
  }

  @Get('articles/:slug')
  getArticle(@Param('slug') slug: string) {
    return this.articles.getArticleBySlug(slug);
  }

  @Get('articles/:slug/related')
  getRelated(@Param('slug') slug: string) {
    return this.articles.getRelatedForArticle(slug);
  }

  @Post('articles/:slug/view')
  recordView(@Param('slug') slug: string) {
    return this.articles.incrementView(slug);
  }
}
