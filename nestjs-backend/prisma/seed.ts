import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@admin.cz';
const ADMIN_PASSWORD = 'admin123';

async function main() {
  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await prisma.user.upsert({
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
