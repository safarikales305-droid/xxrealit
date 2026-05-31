import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TiparPost } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateTiparPostDto } from './dto/create-tipar-post.dto';
import { UpdateTiparPostDto } from './dto/update-tipar-post.dto';

const activeTiparPostWhere: Prisma.TiparPostWhereInput = {
  deletedAt: null,
  isActive: true,
  approved: true,
};

export type TiparPostPublic = ReturnType<TiparService['serializePostPublic']>;

@Injectable()
export class TiparService {
  constructor(private readonly prisma: PrismaService) {}

  async activateTipar(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isTipar: true },
      select: { id: true, isTipar: true },
    });
    return { ok: true, isTipar: user.isTipar };
  }

  async createPost(userId: string, dto: CreateTiparPostDto) {
    await this.requireTipar(userId);
    const isShorts = Boolean(dto.isShorts);
    if (isShorts && !(dto.videoUrl ?? '').trim()) {
      throw new BadRequestException('Shorts tip vyžaduje video URL.');
    }
    const post = await this.prisma.tiparPost.create({
      data: {
        userId,
        title: dto.title.trim(),
        description: dto.description.trim(),
        images: (dto.images ?? []).filter((u) => typeof u === 'string' && u.trim().length > 0),
        videoUrl: dto.videoUrl?.trim() || null,
        city: (dto.city ?? '').trim() || 'Neuvedeno',
        propertyPrice: dto.propertyPrice != null ? Math.max(0, Math.trunc(dto.propertyPrice)) : null,
        sourceUrl: dto.sourceUrl?.trim() || null,
        ownerNote: dto.ownerNote?.trim() || null,
        contactName: (dto.contactName ?? '').trim(),
        contactPhone: (dto.contactPhone ?? '').trim(),
        contactEmail: (dto.contactEmail ?? '').trim().toLowerCase(),
        contactUnlockPrice: Math.max(0, Math.trunc(dto.contactUnlockPrice ?? 100)),
        isShorts,
      },
    });
    await this.syncShortsProperty(post);
    return this.getPostForViewer(post.id, userId);
  }

  async updatePost(userId: string, postId: string, dto: UpdateTiparPostDto) {
    const existing = await this.prisma.tiparPost.findFirst({
      where: { id: postId, userId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Tip nenalezen');

    const isShorts = dto.isShorts ?? existing.isShorts;
    const videoUrl =
      dto.videoUrl !== undefined ? dto.videoUrl?.trim() || null : existing.videoUrl;
    if (isShorts && !videoUrl) {
      throw new BadRequestException('Shorts tip vyžaduje video URL.');
    }

    const post = await this.prisma.tiparPost.update({
      where: { id: postId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.images !== undefined
          ? { images: dto.images.filter((u) => typeof u === 'string' && u.trim().length > 0) }
          : {}),
        ...(dto.videoUrl !== undefined ? { videoUrl } : {}),
        ...(dto.city !== undefined ? { city: dto.city.trim() || 'Neuvedeno' } : {}),
        ...(dto.propertyPrice !== undefined
          ? { propertyPrice: Math.max(0, Math.trunc(dto.propertyPrice)) }
          : {}),
        ...(dto.sourceUrl !== undefined ? { sourceUrl: dto.sourceUrl?.trim() || null } : {}),
        ...(dto.ownerNote !== undefined ? { ownerNote: dto.ownerNote?.trim() || null } : {}),
        ...(dto.contactName !== undefined ? { contactName: dto.contactName.trim() } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone.trim() } : {}),
        ...(dto.contactEmail !== undefined
          ? { contactEmail: dto.contactEmail.trim().toLowerCase() }
          : {}),
        ...(dto.contactUnlockPrice !== undefined
          ? { contactUnlockPrice: Math.max(0, Math.trunc(dto.contactUnlockPrice)) }
          : {}),
        ...(dto.isShorts !== undefined ? { isShorts } : {}),
      },
    });
    await this.syncShortsProperty(post);
    return this.getPostForViewer(post.id, userId);
  }

  async deletePost(userId: string, postId: string) {
    const existing = await this.prisma.tiparPost.findFirst({
      where: { id: postId, userId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Tip nenalezen');

    await this.prisma.tiparPost.update({
      where: { id: postId },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (existing.publishedPropertyId) {
      await this.prisma.property.update({
        where: { id: existing.publishedPropertyId },
        data: { isActive: false, deletedAt: new Date() },
      });
    }
    return { success: true, deletedId: postId };
  }

  async listMyPosts(userId: string) {
    const rows = await this.prisma.tiparPost.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatar: true, isTipar: true } },
        _count: { select: { contactUnlocks: true } },
      },
    });
    return rows.map((r) => this.serializePostPublic(r, userId, true, true));
  }

  async listPublicByUser(tiparUserId: string, viewerId?: string) {
    const rows = await this.prisma.tiparPost.findMany({
      where: { userId: tiparUserId, ...activeTiparPostWhere },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatar: true, isTipar: true } },
        _count: { select: { contactUnlocks: true } },
      },
    });
    const out = [];
    for (const r of rows) {
      const unlocked = viewerId ? await this.hasUnlocked(viewerId, r.id) : false;
      const isOwner = viewerId === r.userId;
      out.push(this.serializePostPublic(r, viewerId, isOwner, unlocked || isOwner));
    }
    return out;
  }

  async getPostForViewer(postId: string, viewerId?: string) {
    const row = await this.prisma.tiparPost.findFirst({
      where: { id: postId, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, avatar: true, isTipar: true } },
        _count: { select: { contactUnlocks: true } },
      },
    });
    if (!row) throw new NotFoundException('Tip nenalezen');
    if (!row.isActive || !row.approved) {
      const isOwner = viewerId === row.userId;
      if (!isOwner) throw new NotFoundException('Tip nenalezen');
    }
    const unlocked = viewerId ? await this.hasUnlocked(viewerId, postId) : false;
    const isOwner = viewerId === row.userId;
    return this.serializePostPublic(row, viewerId, isOwner, unlocked || isOwner);
  }

  async unlockContact(buyerUserId: string, postId: string) {
    const post = await this.prisma.tiparPost.findFirst({
      where: { id: postId, ...activeTiparPostWhere },
    });
    if (!post) throw new NotFoundException('Tip nenalezen');
    if (post.userId === buyerUserId) {
      return {
        unlocked: true,
        alreadyOwned: true,
        cost: 0,
        contact: this.contactPayload(post),
        creditBalance: (
          await this.prisma.user.findUnique({
            where: { id: buyerUserId },
            select: { creditBalance: true },
          })
        )?.creditBalance,
      };
    }

    const existing = await this.prisma.contactUnlock.findUnique({
      where: { userId_tiparPostId: { userId: buyerUserId, tiparPostId: postId } },
    });
    if (existing) {
      const buyer = await this.prisma.user.findUnique({
        where: { id: buyerUserId },
        select: { creditBalance: true },
      });
      return {
        unlocked: true,
        alreadyOwned: true,
        cost: 0,
        contact: this.contactPayload(post),
        creditBalance: buyer?.creditBalance ?? 0,
      };
    }

    const price = Math.max(0, post.contactUnlockPrice);
    const buyer = await this.prisma.user.findUnique({
      where: { id: buyerUserId },
      select: { creditBalance: true },
    });
    if (!buyer) throw new NotFoundException('Uživatel nenalezen');
    if (buyer.creditBalance < price) {
      throw new ForbiddenException({
        message: 'Nemáte dostatek kreditu. Dobijte si kredit.',
        code: 'INSUFFICIENT_CREDIT',
        required: price,
        creditBalance: buyer.creditBalance,
      });
    }

    const newBalance = await this.prisma.$transaction(async (tx) => {
      await tx.contactUnlock.create({
        data: { userId: buyerUserId, tiparPostId: postId, amount: price },
      });
      await tx.creditTransaction.create({
        data: {
          buyerUserId,
          tiparUserId: post.userId,
          tiparPostId: postId,
          amount: price,
          type: 'CONTACT_UNLOCK',
        },
      });
      const updatedBuyer = await tx.user.update({
        where: { id: buyerUserId },
        data: { creditBalance: { decrement: price } },
        select: { creditBalance: true },
      });
      await tx.user.update({
        where: { id: post.userId },
        data: { creditBalance: { increment: price } },
      });
      return updatedBuyer.creditBalance;
    });

    return {
      unlocked: true,
      alreadyOwned: false,
      cost: price,
      contact: this.contactPayload(post),
      creditBalance: newBalance,
    };
  }

  async adminListPosts() {
    const rows = await this.prisma.tiparPost.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true, isTipar: true } },
        _count: { select: { contactUnlocks: true } },
      },
    });
    return rows.map((r) => ({
      ...this.serializePostPublic(r, undefined, false, false),
      contactHidden: true,
      userEmail: r.user.email,
      unlockCount: r._count.contactUnlocks,
    }));
  }

  async adminStats() {
    const [postsTotal, unlocksTotal, earningsAgg, tiparsCount] = await Promise.all([
      this.prisma.tiparPost.count({ where: { deletedAt: null } }),
      this.prisma.contactUnlock.count(),
      this.prisma.creditTransaction.aggregate({
        where: { type: 'CONTACT_UNLOCK' },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.user.count({ where: { isTipar: true } }),
    ]);
    const topTipars = await this.prisma.creditTransaction.groupBy({
      by: ['tiparUserId'],
      where: { type: 'CONTACT_UNLOCK' },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
      take: 20,
    });
    const tiparIds = topTipars.map((t) => t.tiparUserId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: tiparIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return {
      postsTotal,
      unlocksTotal,
      tiparsCount,
      totalCreditsEarned: earningsAgg._sum.amount ?? 0,
      transactionCount: earningsAgg._count,
      topTipars: topTipars.map((t) => ({
        userId: t.tiparUserId,
        name: userMap.get(t.tiparUserId)?.name ?? '',
        email: userMap.get(t.tiparUserId)?.email ?? '',
        unlockCount: t._count,
        totalEarned: t._sum.amount ?? 0,
      })),
    };
  }

  async adminHidePost(postId: string) {
    const post = await this.prisma.tiparPost.findFirst({ where: { id: postId, deletedAt: null } });
    if (!post) throw new NotFoundException('Tip nenalezen');
    await this.prisma.tiparPost.update({
      where: { id: postId },
      data: { isActive: false, approved: false },
    });
    if (post.publishedPropertyId) {
      await this.prisma.property.update({
        where: { id: post.publishedPropertyId },
        data: { isActive: false },
      });
    }
    return { ok: true };
  }

  async adminDeletePost(postId: string) {
    const post = await this.prisma.tiparPost.findFirst({ where: { id: postId } });
    if (!post) throw new NotFoundException('Tip nenalezen');
    await this.prisma.tiparPost.update({
      where: { id: postId },
      data: { deletedAt: new Date(), isActive: false, approved: false },
    });
    if (post.publishedPropertyId) {
      await this.prisma.property.update({
        where: { id: post.publishedPropertyId },
        data: { isActive: false, deletedAt: new Date() },
      });
    }
    return { success: true, deletedId: postId };
  }

  private async requireTipar(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isTipar: true },
    });
    if (!user?.isTipar) {
      throw new ForbiddenException('Nejdřív aktivujte roli tipaře v profilu.');
    }
  }

  private async hasUnlocked(userId: string, postId: string) {
    const row = await this.prisma.contactUnlock.findUnique({
      where: { userId_tiparPostId: { userId, tiparPostId: postId } },
    });
    return !!row;
  }

  private contactPayload(post: TiparPost) {
    return {
      contactName: post.contactName,
      contactPhone: post.contactPhone,
      contactEmail: post.contactEmail,
    };
  }

  private serializePostPublic(
    row: TiparPost & {
      user: { id: string; name: string; avatar: string | null; isTipar: boolean };
      _count?: { contactUnlocks: number };
    },
    viewerId: string | undefined,
    isOwner: boolean,
    contactUnlocked: boolean,
  ) {
    const showContact = isOwner || contactUnlocked;
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      description: row.description,
      images: row.images,
      videoUrl: row.videoUrl,
      city: row.city,
      propertyPrice: row.propertyPrice,
      sourceUrl: row.sourceUrl,
      ownerNote: row.ownerNote,
      contactUnlockPrice: row.contactUnlockPrice,
      isShorts: row.isShorts,
      publishedPropertyId: row.publishedPropertyId,
      isActive: row.isActive,
      approved: row.approved,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      isTiparTip: true,
      tiparBadge: 'Tip na nemovitost',
      contactUnlocked: showContact,
      unlockCount: row._count?.contactUnlocks ?? 0,
      contact: showContact
        ? this.contactPayload(row)
        : { contactName: null, contactPhone: null, contactEmail: null },
      author: {
        id: row.user.id,
        name: row.user.name,
        avatar: row.user.avatar,
        isTipar: row.user.isTipar,
      },
      isOwner,
      viewerId: viewerId ?? null,
    };
  }

  private async syncShortsProperty(post: TiparPost) {
    if (!post.isShorts || !(post.videoUrl ?? '').trim()) {
      if (post.publishedPropertyId) {
        await this.prisma.property.update({
          where: { id: post.publishedPropertyId },
          data: { isActive: false },
        });
        await this.prisma.tiparPost.update({
          where: { id: post.id },
          data: { publishedPropertyId: null },
        });
      }
      return;
    }

    const images = post.images.filter((u) => u.trim().length > 0);
    const data: Prisma.PropertyCreateInput | Prisma.PropertyUpdateInput = {
      title: post.title,
      description: post.description,
      price: post.propertyPrice,
      city: post.city,
      address: post.city,
      images,
      videoUrl: post.videoUrl,
      listingType: 'SHORTS',
      isTiparTip: true,
      approved: post.approved && post.isActive,
      isActive: post.isActive,
      status: 'APPROVED',
      publishedAt: new Date(),
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      user: { connect: { id: post.userId } },
    };

    if (post.publishedPropertyId) {
      await this.prisma.property.update({
        where: { id: post.publishedPropertyId },
        data: data as Prisma.PropertyUpdateInput,
      });
      return;
    }

    const created = await this.prisma.property.create({
      data: data as Prisma.PropertyCreateInput,
    });
    await this.prisma.tiparPost.update({
      where: { id: post.id },
      data: { publishedPropertyId: created.id },
    });
  }
}
