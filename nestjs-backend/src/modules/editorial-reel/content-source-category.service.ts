import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DEFAULT_CONTENT_SOURCE_CATEGORIES } from './editorial-reel.constants';

@Injectable()
export class ContentSourceCategoryService implements OnModuleInit {
  private readonly log = new Logger(ContentSourceCategoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
  }

  async seedDefaults() {
    for (const seed of DEFAULT_CONTENT_SOURCE_CATEGORIES) {
      await this.prisma.contentSourceCategory.upsert({
        where: { slug: seed.slug },
        create: {
          slug: seed.slug,
          label: seed.label,
          sortOrder: seed.sortOrder,
          active: true,
        },
        update: { label: seed.label, sortOrder: seed.sortOrder },
      });
    }
    this.log.log(`Seeded ${DEFAULT_CONTENT_SOURCE_CATEGORIES.length} content source categories`);
  }

  async list(includeInactive = false) {
    return this.prisma.contentSourceCategory.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      include: {
        _count: { select: { sources: true } },
      },
    });
  }

  async create(data: { slug: string; label: string; sortOrder?: number }) {
    const slug = data.slug.trim().toLowerCase().replace(/\s+/g, '-');
    return this.prisma.contentSourceCategory.create({
      data: {
        slug,
        label: data.label.trim(),
        sortOrder: data.sortOrder ?? 500,
        active: true,
      },
    });
  }

  async update(
    id: string,
    patch: { label?: string; sortOrder?: number; active?: boolean; slug?: string },
  ) {
    await this.getById(id);
    return this.prisma.contentSourceCategory.update({
      where: { id },
      data: {
        ...(patch.label != null ? { label: patch.label.trim() } : {}),
        ...(patch.sortOrder != null ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.active != null ? { active: patch.active } : {}),
        ...(patch.slug != null
          ? { slug: patch.slug.trim().toLowerCase().replace(/\s+/g, '-') }
          : {}),
      },
    });
  }

  async getById(id: string) {
    const row = await this.prisma.contentSourceCategory.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Kategorie nenalezena.');
    return row;
  }

  async getBySlug(slug: string) {
    return this.prisma.contentSourceCategory.findUnique({ where: { slug } });
  }
}
