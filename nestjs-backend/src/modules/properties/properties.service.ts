import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { serializeProperty } from './properties.serializer';

const socialInclude = (viewerId?: string) =>
  viewerId
    ? {
        media: { orderBy: { sortOrder: 'asc' as const } },
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
        likes: {
          where: { userId: viewerId },
          select: { id: true },
          take: 1,
        },
      }
    : {
        media: { orderBy: { sortOrder: 'asc' as const } },
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
      };

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  private async viewerIsAdmin(viewerId?: string): Promise<boolean> {
    if (!viewerId) return false;
    const u = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { role: true },
    });
    return u?.role === UserRole.ADMIN;
  }

  async findAllPublic(viewerId?: string) {
    const admin = await this.viewerIsAdmin(viewerId);
    const rows = await this.prisma.property.findMany({
      where: admin ? undefined : { approved: true },
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
    const admin = await this.viewerIsAdmin(viewerId);
    const viewerIsOwner = viewerId === ownerId;
    const rows = await this.prisma.property.findMany({
      where: {
        userId: ownerId,
        ...(!admin && !viewerIsOwner ? { approved: true } : {}),
      },
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
    const admin = await this.viewerIsAdmin(viewerId);
    const follows = await this.prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followingId: true },
    });
    const ids = follows.map((f) => f.followingId);
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.property.findMany({
      where: {
        userId: { in: ids },
        ...(admin ? {} : { approved: true }),
      },
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

  /**
   * Detail inzerátu + autor + další inzeráty stejného uživatele.
   * Neschválený inzerát vidí jen admin nebo vlastník.
   */
  async findOneForDetail(id: string, viewerId?: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        media: {
          orderBy: { sortOrder: 'asc' },
        },
        user: {
          select: {
            id: true,
            email: true,
            avatar: true,
            name: true,
            city: true,
          },
        },
        _count: { select: { likes: true } },
        ...(viewerId
          ? {
              likes: {
                where: { userId: viewerId },
                select: { id: true },
                take: 1,
              },
            }
          : {}),
      },
    });

    if (!property) {
      throw new NotFoundException(`Property "${id}" not found`);
    }

    const admin = await this.viewerIsAdmin(viewerId);
    const isOwner = viewerId === property.userId;
    if (!property.approved && !admin && !isOwner) {
      throw new NotFoundException(`Property "${id}" not found`);
    }

    const author = property.user;
    const userPayload = {
      id: author.id,
      email: author.email,
      name: author.name ?? null,
      avatar: author.avatar ?? null,
    };

    const othersWhere: Prisma.PropertyWhereInput = {
      userId: property.userId,
      id: { not: property.id },
    };
    if (!admin && !isOwner) {
      othersWhere.approved = true;
    }

    const otherRows = await this.prisma.property.findMany({
      where: othersWhere,
      orderBy: { createdAt: 'desc' },
      include: {
        media: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
        ...(viewerId
          ? {
              likes: {
                where: { userId: viewerId },
                select: { id: true },
                take: 1,
              },
            }
          : {}),
      },
    });

    const likesArr =
      'likes' in property && Array.isArray(property.likes) ? property.likes : [];

    const propertySerialized = serializeProperty(
      {
        ...property,
        likes: likesArr,
        _count: property._count,
        user: { id: author.id, city: author.city },
      },
      viewerId,
    );

    const otherProperties = otherRows.map((r) =>
      serializeProperty(
        {
          ...r,
          likes: 'likes' in r ? r.likes : [],
          _count: r._count,
          user: r.user,
        },
        viewerId,
      ),
    );

    return {
      property: propertySerialized,
      user: userPayload,
      otherProperties,
    };
  }

  async toggleLike(propertyId: string, userId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new NotFoundException(`Property "${propertyId}" not found`);
    }
    const admin = await this.viewerIsAdmin(userId);
    if (!property.approved && !admin) {
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

  async create(ownerId: string, dto: CreatePropertyDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
    });

    if (!user) {
      throw new NotFoundException(`User with id "${ownerId}" not found`);
    }

    const images = Array.isArray(dto.images)
      ? dto.images.filter((u) => typeof u === 'string' && u.trim().length > 0)
      : [];

    try {
      return await this.prisma.property.create({
        data: {
          title: dto.title.trim(),
          description: dto.description.trim(),
          price: dto.price,
          currency: (dto.currency ?? 'CZK').trim().slice(0, 8) || 'CZK',
          offerType: dto.type.trim(),
          propertyType: dto.propertyType.trim(),
          subType: (dto.subType ?? '').trim().slice(0, 120),
          address: (dto.address ?? '').trim().slice(0, 500),
          city: dto.city.trim(),
          area: dto.area ?? null,
          landArea: dto.landArea ?? null,
          floor: dto.floor ?? null,
          totalFloors: dto.totalFloors ?? null,
          condition: dto.condition?.trim() || null,
          construction: dto.construction?.trim() || null,
          ownership: dto.ownership?.trim() || null,
          energyLabel: dto.energyLabel?.trim() || null,
          equipment: dto.equipment?.trim() || null,
          parking: dto.parking ?? false,
          cellar: dto.cellar ?? false,
          images,
          videoUrl: dto.videoUrl?.trim() || null,
          contactName: dto.contactName.trim(),
          contactPhone: dto.contactPhone.trim(),
          contactEmail: dto.contactEmail.trim().toLowerCase(),
          userId: ownerId,
          approved: false,
          status: 'PENDING',
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new NotFoundException(`User with id "${ownerId}" not found`);
      }
      throw e;
    }
  }
}
