import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { serializeProperty } from '../properties/properties.serializer';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.propertyLike.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        property: {
          include: {
            user: { select: { id: true, city: true } },
            _count: { select: { likes: true } },
            likes: { where: { userId }, select: { id: true }, take: 1 },
          },
        },
      },
    });

    return rows.map((r) => {
      const p = r.property;
      return serializeProperty(
        {
          ...p,
          likes: p.likes?.length ? p.likes : [{ id: r.id }],
          _count: p._count,
        },
        userId,
      );
    });
  }

  async add(userId: string, propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new NotFoundException(`Property "${propertyId}" not found`);
    }
    try {
      await this.prisma.propertyLike.create({
        data: { userId, propertyId },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Already in favorites');
      }
      throw e;
    }
    const likeCount = await this.prisma.propertyLike.count({
      where: { propertyId },
    });
    return { favorited: true, likeCount };
  }

  async remove(userId: string, propertyId: string) {
    await this.prisma.propertyLike.deleteMany({
      where: { userId, propertyId },
    });
    const likeCount = await this.prisma.propertyLike.count({
      where: { propertyId },
    });
    return { favorited: false, likeCount };
  }
}
