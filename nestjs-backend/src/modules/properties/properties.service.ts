import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { serializeProperty } from './properties.serializer';

const socialInclude = (viewerId?: string) =>
  viewerId
    ? {
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
        likes: {
          where: { userId: viewerId },
          select: { id: true },
          take: 1,
        },
      }
    : {
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
      };

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllPublic(viewerId?: string) {
    const rows = await this.prisma.property.findMany({
      orderBy: { createdAt: 'desc' },
      include: socialInclude(viewerId),
    });
    return rows.map((r) =>
      serializeProperty(
        { ...r, likes: 'likes' in r ? r.likes : [] },
        viewerId,
      ),
    );
  }

  async findByOwner(ownerId: string, viewerId?: string) {
    const rows = await this.prisma.property.findMany({
      where: { userId: ownerId },
      orderBy: { createdAt: 'desc' },
      include: socialInclude(viewerId),
    });
    return rows.map((r) =>
      serializeProperty(
        { ...r, likes: 'likes' in r ? r.likes : [] },
        viewerId,
      ),
    );
  }

  async findFromFollowedUsers(viewerId: string) {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followingId: true },
    });
    const ids = follows.map((f) => f.followingId);
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.property.findMany({
      where: { userId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      include: socialInclude(viewerId),
    });
    return rows.map((r) =>
      serializeProperty(
        { ...r, likes: 'likes' in r ? r.likes : [] },
        viewerId,
      ),
    );
  }

  async toggleLike(propertyId: string, userId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new NotFoundException(`Property "${propertyId}" not found`);
    }

    const existing = await this.prisma.propertyLike.findUnique({
      where: {
        propertyId_userId: { propertyId, userId },
      },
    });

    if (existing) {
      await this.prisma.propertyLike.delete({ where: { id: existing.id } });
    } else {
      try {
        await this.prisma.propertyLike.create({
          data: { propertyId, userId },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException('Already liked');
        }
        throw e;
      }
    }

    const likeCount = await this.prisma.propertyLike.count({
      where: { propertyId },
    });
    return {
      liked: !existing,
      likeCount,
    };
  }

  async create(dto: CreatePropertyDto) {
    const userId =
      dto.userId ??
      (
        await this.prisma.user.findFirst({
          orderBy: { createdAt: 'asc' },
        })
      )?.id;

    if (!userId) {
      throw new BadRequestException(
        'No userId provided and no users exist in the database',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }

    try {
      return await this.prisma.property.create({
        data: {
          title: dto.title,
          price: dto.price,
          videoUrl: dto.videoUrl?.trim() || null,
          city: dto.city ?? 'Unknown',
          userId,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new NotFoundException(`User with id "${userId}" not found`);
      }
      throw e;
    }
  }
}
