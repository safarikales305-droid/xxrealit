import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import {
  SEED_PROPERTIES,
  SEED_USER_EMAIL,
  SEED_USER_PASSWORD,
} from './seed.constants';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');

/** Inserts the sample listings when the DB has no properties (fresh SQLite). */
export async function ensureDevSeedIfEmpty(prisma: PrismaClient): Promise<void> {
  const count = await prisma.property.count();
  if (count > 0) {
    return;
  }

  const password = await bcrypt.hash(SEED_USER_PASSWORD, 10);
  const user = await prisma.user.upsert({
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

  for (const row of SEED_PROPERTIES) {
    await prisma.property.create({
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
      },
    });
  }

  console.log(
    `[DevSeed] Empty database — created ${SEED_PROPERTIES.length} sample properties.`,
  );
}
