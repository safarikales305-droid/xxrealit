import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePurchaseAdviceArticleDto } from './dto/create-purchase-advice-article.dto';
import { UpdatePurchaseAdviceArticleDto } from './dto/update-purchase-advice-article.dto';

@Injectable()
export class PurchaseAdviceArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  listPublic(limit = 12) {
    const take = Math.min(Math.max(limit, 1), 50);
    return this.prisma.purchaseAdviceArticle.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take,
      select: {
        id: true,
        title: true,
        imageUrl: true,
        category: true,
        createdAt: true,
      },
    });
  }

  getPublicById(id: string) {
    return this.prisma.purchaseAdviceArticle.findFirst({
      where: { id, isPublished: true },
    });
  }

  listForAdmin() {
    return this.prisma.purchaseAdviceArticle.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  create(dto: CreatePurchaseAdviceArticleDto) {
    return this.prisma.purchaseAdviceArticle.create({
      data: {
        title: dto.title.trim(),
        imageUrl: dto.imageUrl?.trim() || null,
        body: dto.body,
        category: dto.category?.trim() || 'rady-pri-koupi',
        galleryUrls: dto.galleryUrls?.map((u) => u.trim()).filter(Boolean) ?? [],
        seoTitle: dto.seoTitle?.trim() || null,
        seoDescription: dto.seoDescription?.trim() || null,
        isPublished: dto.isPublished ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdatePurchaseAdviceArticleDto) {
    const existing = await this.prisma.purchaseAdviceArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Článek nenalezen.');
    return this.prisma.purchaseAdviceArticle.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl?.trim() || null } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.category !== undefined ? { category: dto.category.trim() || 'rady-pri-koupi' } : {}),
        ...(dto.galleryUrls !== undefined
          ? { galleryUrls: dto.galleryUrls.map((u) => u.trim()).filter(Boolean) }
          : {}),
        ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle?.trim() || null } : {}),
        ...(dto.seoDescription !== undefined
          ? { seoDescription: dto.seoDescription?.trim() || null }
          : {}),
        ...(dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async delete(id: string) {
    const existing = await this.prisma.purchaseAdviceArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Článek nenalezen.');
    await this.prisma.purchaseAdviceArticle.delete({ where: { id } });
    return { ok: true };
  }
}
