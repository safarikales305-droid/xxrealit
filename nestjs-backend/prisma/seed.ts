import { readFileSync } from 'fs';
import { join } from 'path';

import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import type { ListingJson, MediaJson } from './listing-seed-types';
import { getSyntheticCz50Listings } from './seed-data/synthetic-cz-50';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@admin.cz';
const ADMIN_PASSWORD = 'admin123';

const DEMO_LISTINGS_OWNER_EMAIL = 'demo-listings-owner@realestate.local';
const DEMO_LISTINGS_OWNER_PASSWORD = 'DemoListings!2026';

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

function loadListingsFromEnvOrDefault(): ListingJson[] {
  const rel = process.env.SEED_DATASET_PATH?.trim();
  if (rel) {
    const datasetPath = join(process.cwd(), rel);
    const raw = readFileSync(datasetPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`SEED_DATASET_PATH musí ukazovat na JSON pole inzerátů: ${datasetPath}`);
    }
    console.log('Dataset ze souboru:', datasetPath);
    return parsed as ListingJson[];
  }
  console.log('Dataset: vestavěných 50 syntetických CZ inzerátů (prisma/seed-data/synthetic-cz-50.ts)');
  return getSyntheticCz50Listings();
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

  const ownerHash = await bcrypt.hash(DEMO_LISTINGS_OWNER_PASSWORD, 10);
  const listingOwner = await prisma.user.upsert({
    where: { email: DEMO_LISTINGS_OWNER_EMAIL },
    update: { name: 'Demo vlastník inzerátů' },
    create: {
      email: DEMO_LISTINGS_OWNER_EMAIL,
      password: ownerHash,
      role: UserRole.AGENT,
      name: 'Demo vlastník inzerátů',
      city: 'Praha',
    },
  });
  console.log(
    'Vlastník demo inzerátů:',
    DEMO_LISTINGS_OWNER_EMAIL,
    '/',
    DEMO_LISTINGS_OWNER_PASSWORD,
  );

  const listings = loadListingsFromEnvOrDefault();

  let userId = process.env.SEED_USER_ID?.trim();
  if (!userId) {
    userId = listingOwner.id;
  }

  if (listings.length === 0) {
    console.log('Dataset je prázdný — žádné inzeráty.');
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
        ...(listing.createdAt ? { createdAt: new Date(listing.createdAt) } : {}),
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

  const withVideo = listings.filter(
    (l) =>
      (l.videoUrl && String(l.videoUrl).trim()) ||
      (l.media ?? []).some((m) => m.type === 'video'),
  ).length;
  console.log('✅ Seed hotov:', listings.length, 'inzerátů, z toho s videem (shorts):', withVideo);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
