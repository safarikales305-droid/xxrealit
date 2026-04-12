import { Controller, Get } from '@nestjs/common';
import { Property, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  SEED_PROPERTIES,
  SEED_USER_EMAIL,
  SEED_USER_PASSWORD,
} from '../../database/seed.constants';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');

/** API shape: `location` matches product language; DB column is `city`. */
function toResponseShape(p: Property) {
  return {
    id: p.id,
    title: p.title,
    price: p.price,
    location: p.city,
    videoUrl: p.videoUrl,
    createdAt: p.createdAt,
    userId: p.userId,
  };
}

@Controller('seed')
export class SeedController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resets seed user listings and recreates them with current `videoUrl` values.
   */
  @Get()
  async seed() {
    console.log('[Seed] Starting property seed…');

    const password = await bcrypt.hash(SEED_USER_PASSWORD, 10);
    const user = await this.prisma.user.upsert({
      where: { email: SEED_USER_EMAIL },
      create: {
        email: SEED_USER_EMAIL,
        name: 'Seed User',
        password,
        role: UserRole.AGENT,
        avatar: null,
        bio: 'Ukázkový makléř — demo profil.',
        city: 'Praha',
        rating: 4.7,
      },
      update: {
        name: 'Seed User',
        password,
        role: UserRole.AGENT,
        avatar: null,
        bio: 'Ukázkový makléř — demo profil.',
        city: 'Praha',
        rating: 4.7,
      },
    });

    const deleted = await this.prisma.property.deleteMany({
      where: { userId: user.id },
    });
    console.log(
      `[Seed] Removed ${deleted.count} existing listing(s) for seed user.`,
    );

    const created: ReturnType<typeof toResponseShape>[] = [];

    for (const row of SEED_PROPERTIES) {
      const property = await this.prisma.property.create({
        data: {
          title: row.title,
          description: `Ukázkový inzerát: ${row.title}`,
          price: row.price,
          city: row.location,
          address: row.location,
          videoUrl: row.videoUrl,
          userId: user.id,
          currency: 'CZK',
          offerType: 'prodej',
          propertyType: 'byt',
          subType: '',
          contactName: user.name ?? 'Seed uživatel',
          contactPhone: '+420777000000',
          contactEmail: user.email,
          images: [],
          approved: true,
          listingType: row.videoUrl?.trim() ? 'SHORTS' : 'CLASSIC',
        },
      });

      console.log(
        `[Seed] Created property: ${property.id} — ${property.title} (${property.videoUrl})`,
      );
      created.push(toResponseShape(property));
    }

    console.log(`[Seed] Done. Created: ${created.length}.`);

    return {
      message: 'Seed completed',
      seedUserId: user.id,
      deletedCount: deleted.count,
      created,
    };
  }
}
