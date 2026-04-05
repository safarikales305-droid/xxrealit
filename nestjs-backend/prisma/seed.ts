import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@admin.cz';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Admin už existuje:', email);
    return;
  }
  const password = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: {
      email,
      password,
      role: UserRole.ADMIN,
      name: 'Administrátor',
    },
  });
  console.log('Vytvořen admin:', email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
