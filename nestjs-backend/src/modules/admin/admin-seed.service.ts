import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');

@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly log = new Logger(AdminSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const email =
      process.env.ADMIN_EMAIL?.trim().toLowerCase() ||
      'admin@xxrealit.local';
    const password = process.env.ADMIN_PASSWORD || 'admin123';

    try {
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing) {
        this.log.log(`Admin seed: účet ${email} už existuje`);
        return;
      }
      const hash = await bcrypt.hash(password, 10);
      await this.prisma.user.create({
        data: {
          email,
          password: hash,
          role: UserRole.ADMIN,
          name: 'Administrátor',
        },
      });
      this.log.log(`Admin seed: vytvořen ${email} (změňte heslo v produkci)`);
    } catch (e) {
      this.log.error('Admin seed selhal', e);
    }
  }
}
