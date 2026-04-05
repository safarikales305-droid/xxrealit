import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { serializeProperty } from '../properties/properties.serializer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const [totalUsers, adminUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: UserRole.ADMIN } }),
    ]);
    return {
      users: totalUsers - adminUsers,
      admins: adminUsers,
      total: totalUsers,
    };
  }

  async listAllProperties() {
    const rows = await this.prisma.property.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, city: true } },
        _count: { select: { likes: true } },
      },
    });
    return rows.map((r) =>
      serializeProperty(
        {
          ...r,
          likes: [],
          _count: r._count,
          user: { id: r.user.id, city: r.user.city },
        },
        undefined,
      ),
    );
  }

  async listUsers() {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        avatar: true,
        createdAt: true,
        name: true,
      },
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      avatarUrl: u.avatar,
      createdAt: u.createdAt,
    }));
  }

  async approveProperty(propertyId: string) {
    const p = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!p) {
      throw new NotFoundException('Inzerát nenalezen');
    }
    return this.prisma.property.update({
      where: { id: propertyId },
      data: { approved: true },
    });
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Nové heslo musí mít alespoň 8 znaků');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) {
      throw new NotFoundException();
    }
    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) {
      throw new UnauthorizedException('Současné heslo je nesprávné');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });
    return { success: true };
  }
}
