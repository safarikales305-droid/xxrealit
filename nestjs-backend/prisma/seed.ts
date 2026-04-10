import { readFileSync } from 'fs';
import { join } from 'path';

import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@admin.cz';
const ADMIN_PASSWORD = 'admin123';

type MediaJson = {
  url: string;
  type: string;
  sortOrder?: number;
  order?: number;
};

type ListingJson = {
  title: string;
  description?: string;
  price: number;
  city: string;
  address?: string;
  approved?: boolean;
  propertyType?: string;
  offerType?: string;
  subType?: string;
  area?: number;
  landArea?: number;
  floor?: number;
  totalFloors?: number;
  condition?: string;
  construction?: string;
  ownership?: string;
  energyLabel?: string;
  equipment?: string;
  parking?: boolean;
  cellar?: boolean;
  videoUrl?: string | null;
  images?: string[];
  media?: MediaJson[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  currency?: string;
  status?: string;
};

function mediaSortOrder(m: MediaJson, index: number): number {
  if (typeof m.sortOrder === 'number' && Number.isFinite(m.sortOrder)) return m.sortOrder;
  if (typeof m.order === 'number' && Number.isFinite(m.order)) return m.order;
  return index;
}

function buildImagesAndVideo(listing: ListingJson): { images: string[]; videoUrl: string | null } {
  const media = listing.media ?? [];
  const imageUrls = media.filter((m) => m.type === 'image').map((m) => m.url.trim()).filter(Boolean);
  const videoFromMedia = media.find((m) => m.type === 'video')?.url?.trim();
  const images =
    listing.images?.filter((u) => typeof u === 'string' && u.trim()) ??
    (imageUrls.length ? imageUrls : []);
  const videoUrl =
    (listing.videoUrl && String(listing.videoUrl).trim()) || videoFromMedia || null;
  return { images, videoUrl };
}

async function main() {
  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      password: hashed,
      role: UserRole.ADMIN,
      name: 'Administrátor',
    },
  });
  console.log('Admin připraven:', ADMIN_EMAIL, '/', ADMIN_PASSWORD);

  const datasetPath = join(process.cwd(), 'prisma/seed-data/xx_reality_demo_dataset_60.json');
  const raw = readFileSync(datasetPath, 'utf-8');
  const listings = JSON.parse(raw) as ListingJson[];

  if (!Array.isArray(listings)) {
    throw new Error('Dataset musí být JSON pole inzerátů');
  }

  let userId = process.env.SEED_USER_ID?.trim();
  if (!userId) {
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('No user found');
    userId = user.id;
  }

  if (listings.length === 0) {
    console.log('Dataset je prázdný — žádné inzeráty (soubor:', datasetPath, ')');
    return;
  }

  for (const listing of listings) {
    if (!listing?.title || listing.city == null || listing.price == null) {
      console.warn('Přeskakuji záznam bez title/city/price');
      continue;
    }

    const { images, videoUrl } = buildImagesAndVideo(listing);
    const description = listing.description?.trim() ?? '';

    const created = await prisma.property.create({
      data: {
        title: listing.title.trim(),
        description,
        price: Math.round(Number(listing.price)),
        city: String(listing.city).trim(),
        userId,
        address: (listing.address ?? listing.city ?? '').toString().trim(),
        approved: listing.approved ?? true,
        status: listing.status?.trim() || 'APPROVED',
        currency: listing.currency?.trim() || 'CZK',
        offerType: listing.offerType?.trim() || 'prodej',
        propertyType: listing.propertyType?.trim() || 'byt',
        subType: listing.subType?.trim() ?? '',
        area: listing.area != null ? Number(listing.area) : null,
        landArea: listing.landArea != null ? Number(listing.landArea) : null,
        floor: listing.floor != null ? Math.round(Number(listing.floor)) : null,
        totalFloors: listing.totalFloors != null ? Math.round(Number(listing.totalFloors)) : null,
        condition: listing.condition?.trim() ?? null,
        construction: listing.construction?.trim() ?? null,
        ownership: listing.ownership?.trim() ?? null,
        energyLabel: listing.energyLabel?.trim() ?? null,
        equipment: listing.equipment?.trim() ?? null,
        parking: listing.parking ?? false,
        cellar: listing.cellar ?? false,
        images,
        videoUrl,
        contactName: listing.contactName?.trim() || 'Seed',
        contactPhone: listing.contactPhone?.trim() || '',
        contactEmail: listing.contactEmail?.trim() || admin.email,
      },
    });

    if (listing.media?.length) {
      await prisma.propertyMedia.createMany({
        data: listing.media.map((m, index) => ({
          propertyId: created.id,
          url: m.url,
          type: m.type,
          sortOrder: mediaSortOrder(m, index),
        })),
      });
    }
  }

  console.log('✅ Seed hotov:', listings.length, 'inzerátů');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
