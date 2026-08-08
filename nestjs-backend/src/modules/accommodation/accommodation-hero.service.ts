import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const DEFAULT_CATEGORIES = [
  {
    label: 'Wellness',
    imageUrl: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80',
    imageAlt: 'Wellness pobyt s bazénem',
    href: '/ubytovani/wellness',
    sortOrder: 0,
  },
  {
    label: 'Apartmány',
    imageUrl: 'https://images.unsplash.com/photo-1502672265066-763c14014da2?auto=format&fit=crop&w=800&q=80',
    imageAlt: 'Moderní apartmán u vody',
    href: '/ubytovani/apartmany',
    sortOrder: 1,
  },
  {
    label: 'Chaty',
    imageUrl: 'https://images.unsplash.com/photo-1449158743715-0acffed1f21b?auto=format&fit=crop&w=800&q=80',
    imageAlt: 'Horská chata v přírodě',
    href: '/ubytovani/chaty',
    sortOrder: 2,
  },
  {
    label: 'Hotely',
    imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
    imageAlt: 'Hotel s výhledem na město',
    href: '/ubytovani/hotely',
    sortOrder: 3,
  },
  {
    label: 'Dovolená v ČR',
    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80',
    imageAlt: 'Příroda a relaxace v Česku',
    href: '/ubytovani/hory',
    sortOrder: 4,
  },
] as const;

export type AccommodationHeroPayload = {
  title: string;
  subtitle: string;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  categories: Array<{
    id: string;
    label: string;
    imageUrl: string;
    imageAlt: string | null;
    href: string;
    sortOrder: number;
    active: boolean;
  }>;
};

@Injectable()
export class AccommodationHeroService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaults();
  }

  async ensureDefaults(): Promise<void> {
    await this.prisma.accommodationHeroSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        title: 'Najděte si místo pro odpočinek',
        subtitle: 'Hotely, apartmány, wellness pobyty a ubytování po celé ČR.',
      },
      update: {},
    });

    const count = await this.prisma.accommodationHeroCategory.count();
    if (count > 0) return;

    await this.prisma.accommodationHeroCategory.createMany({
      data: DEFAULT_CATEGORIES.map((item) => ({ ...item })),
    });
  }

  async getPublicHero(): Promise<AccommodationHeroPayload> {
    await this.ensureDefaults();
    const [settings, categories] = await Promise.all([
      this.prisma.accommodationHeroSettings.findUnique({ where: { id: 'default' } }),
      this.prisma.accommodationHeroCategory.findMany({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    return {
      title: settings?.title ?? 'Najděte si místo pro odpočinek',
      subtitle:
        settings?.subtitle ??
        'Hotely, apartmány, wellness pobyty a ubytování po celé ČR.',
      heroImageUrl: settings?.heroImageUrl ?? null,
      heroImageAlt: settings?.heroImageAlt ?? null,
      categories: categories.map((c) => ({
        id: c.id,
        label: c.label,
        imageUrl: c.imageUrl,
        imageAlt: c.imageAlt,
        href: c.href,
        sortOrder: c.sortOrder,
        active: c.active,
      })),
    };
  }

  async getAdminHero() {
    await this.ensureDefaults();
    const [settings, categories] = await Promise.all([
      this.prisma.accommodationHeroSettings.findUnique({ where: { id: 'default' } }),
      this.prisma.accommodationHeroCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);
    return { settings, categories };
  }

  async saveHero(body: {
    title?: string;
    subtitle?: string;
    heroImageUrl?: string | null;
    heroImageAlt?: string | null;
    categories?: Array<{
      id?: string;
      label: string;
      imageUrl: string;
      imageAlt?: string | null;
      href: string;
      sortOrder?: number;
      active?: boolean;
    }>;
  }) {
    await this.ensureDefaults();

    await this.prisma.accommodationHeroSettings.update({
      where: { id: 'default' },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.subtitle !== undefined ? { subtitle: body.subtitle } : {}),
        ...(body.heroImageUrl !== undefined ? { heroImageUrl: body.heroImageUrl } : {}),
        ...(body.heroImageAlt !== undefined ? { heroImageAlt: body.heroImageAlt } : {}),
      },
    });

    if (body.categories) {
      const incomingIds = body.categories.map((c) => c.id).filter(Boolean) as string[];
      if (incomingIds.length > 0) {
        await this.prisma.accommodationHeroCategory.deleteMany({
          where: { id: { notIn: incomingIds } },
        });
      } else {
        await this.prisma.accommodationHeroCategory.deleteMany({});
      }

      for (const [index, category] of body.categories.entries()) {
        const data = {
          label: category.label,
          imageUrl: category.imageUrl,
          imageAlt: category.imageAlt ?? null,
          href: category.href,
          sortOrder: category.sortOrder ?? index,
          active: category.active ?? true,
        };
        if (category.id) {
          await this.prisma.accommodationHeroCategory.upsert({
            where: { id: category.id },
            create: { id: category.id, ...data },
            update: data,
          });
        } else {
          await this.prisma.accommodationHeroCategory.create({ data });
        }
      }
    }

    return this.getAdminHero();
  }
}
