/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'demo123';

async function upsertUser(email, name) {
  const password = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    update: { name },
    create: {
      email,
      name,
      password,
      role: 'USER',
    },
  });
}

async function ensureProperty(userId, { title, price, city, approved = true }) {
  const existing = await prisma.property.findFirst({
    where: { userId, title },
  });
  if (existing) return existing;
  return prisma.property.create({
    data: {
      title,
      price,
      city,
      userId,
      approved,
      videoUrl: null,
    },
  });
}

async function main() {
  const u1 = await upsertUser('user1@test.cz', 'Demo uživatel 1');
  const u2 = await upsertUser('user2@test.cz', 'Demo uživatel 2');
  const u3 = await upsertUser('user3@test.cz', 'Demo uživatel 3');

  await ensureProperty(u1.id, {
    title: 'Byt Praha 3',
    price: 6_890_000,
    city: 'Praha 3',
  });
  await ensureProperty(u1.id, {
    title: 'Dům Brno',
    price: 12_500_000,
    city: 'Brno',
  });
  await ensureProperty(u1.id, {
    title: 'Pozemek Ostrava',
    price: 3_200_000,
    city: 'Ostrava',
  });

  await ensureProperty(u2.id, {
    title: 'Byt Plzeň',
    price: 4_150_000,
    city: 'Plzeň',
  });
  await ensureProperty(u2.id, {
    title: 'Vila Liberec',
    price: 15_900_000,
    city: 'Liberec',
  });
  await ensureProperty(u2.id, {
    title: 'Byt Olomouc centrum',
    price: 5_400_000,
    city: 'Olomouc',
  });

  await ensureProperty(u3.id, {
    title: 'Rodinný dům České Budějovice',
    price: 9_750_000,
    city: 'České Budějovice',
  });
  await ensureProperty(u3.id, {
    title: 'Garáž Brno',
    price: 890_000,
    city: 'Brno',
  });

  console.log('Seed demo: user1@test.cz, user2@test.cz, user3@test.cz (heslo: demo123)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
