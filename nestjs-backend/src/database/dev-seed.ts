import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  SEED_PROPERTIES,
  SEED_USER_EMAIL,
  SEED_USER_PASSWORD,
} from './seed.constants';

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
      role: UserRole.makler,
      avatar: null,
      bio: 'Ukázkový makléř — demo profil.',
      city: 'Praha',
      rating: 4.7,
    },
    update: {
      name: 'Seed User',
      password,
      role: UserRole.makler,
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
        price: row.price,
        city: row.location,
        videoUrl: row.videoUrl,
        userId: user.id,
      },
    });
  }

  console.log(
    `[DevSeed] Empty database — created ${SEED_PROPERTIES.length} sample properties.`,
  );
}
