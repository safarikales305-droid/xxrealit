import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PostCategory, ReactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BrokerPointsService } from '../premium-broker/broker-points.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

function isPublicMediaUrl(url: string | null | undefined): boolean {
  const v = (url ?? '').trim();
  return /^https?:\/\//i.test(v);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    try {
      const n = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  return null;
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brokerPoints: BrokerPointsService,
  ) {}

  async deletePost(id: string) {
    return this.prisma.post.delete({
      where: { id },
    });
  }

  async deletePostByOwner(id: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException();
    }
    if (post.userId !== userId) {
      throw new ForbiddenException();
    }
    await this.prisma.post.delete({ where: { id } });
    return { success: true };
  }

  async updatePostByOwner(id: string, userId: string, dto: UpdatePostDto) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException();
    }
    if (post.userId !== userId) {
      throw new ForbiddenException();
    }
    const nextText = (dto.content ?? dto.description ?? '').trim();
    const updated = await this.prisma.post.update({
      where: { id },
      data: {
        content: nextText || null,
        description: nextText,
      },
      include: {
        media: { orderBy: { order: 'asc' } },
      },
    });
    return { success: true, post: updated };
  }

  async toggleFavorite(postId: string, userId: string) {
    const existing = await this.prisma.favorite.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
      const likeCount = await this.prisma.favorite.count({ where: { postId } });
      return { liked: false, likeCount };
    }

    await this.prisma.favorite.create({
      data: {
        userId,
        postId,
      },
    });
    const likeCount = await this.prisma.favorite.count({ where: { postId } });
    return { liked: true, likeCount };
  }

  addComment(postId: string, userId: string, content: string) {
    return this.prisma.comment.create({
      data: {
        content,
        userId,
        postId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });
  }

  getComments(postId: string) {
    return this.prisma.comment.findMany({
      where: { postId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(userId: string, dto: CreatePostDto) {
    const text = (dto.description ?? dto.content ?? '').trim();
    return this.prisma.post.create({
      data: {
        type: 'post',
        category: (dto.category as PostCategory | undefined) ?? PostCategory.MAKLERI,
        title: '',
        price: 0,
        city: '',
        userId,
        content: text || null,
        description: text || '',
      },
      include: {
        media: { orderBy: { order: 'asc' } },
        reactions: true,
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
  }

  async createMediaPost(
    userId: string,
    opts: {
      kind: 'video' | 'image';
      url: string;
      description: string;
    },
  ) {
    const text = opts.description.trim();
    const isVideo = opts.kind === 'video';
    const created = await this.prisma.post.create({
      data: {
        type: 'post',
        title: '',
        price: 0,
        city: '',
        description: text || '',
        content: text || null,
        userId,
        media: {
          create: [
            {
              url: opts.url,
              type: isVideo ? 'video' : 'image',
              order: isVideo ? 0 : 1,
            },
          ],
        },
      },
      include: {
        media: {
          orderBy: { order: 'asc' },
        },
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
    if (isVideo) {
      await this.brokerPoints.onVideoPostCreated(userId, created.id);
    }
    return created;
  }

  async createListingPost(
    userId: string,
    input: {
      title: string;
      description: string;
      price: number;
      city: string;
      type: 'post' | 'short';
      media: Array<{ url: string; type: 'video' | 'image'; order: number }>;
      category?: PostCategory;
      latitude?: number;
      longitude?: number;
    },
  ) {
    const created = await this.prisma.post.create({
      data: {
        title: input.title,
        description: input.description,
        price: input.price,
        city: input.city,
        type: input.type,
        category: input.category ?? PostCategory.MAKLERI,
        latitude: Number.isFinite(input.latitude) ? input.latitude : null,
        longitude: Number.isFinite(input.longitude) ? input.longitude : null,
        content: input.description,
        userId,
        media: {
          create: input.media,
        },
      },
      include: {
        media: {
          orderBy: { order: 'asc' },
        },
        reactions: true,
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
    if (input.media.some((m) => m.type === 'video')) {
      await this.brokerPoints.onVideoPostCreated(userId, created.id);
    }
    return created;
  }

  async getPostDetail(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        media: {
          orderBy: { order: 'asc' },
        },
        reactions: true,
        _count: {
          select: {
            favorites: true,
            comments: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
    if (!post) return null;
    const media = post.media.filter((m) => isPublicMediaUrl(m.url));
    return {
      ...post,
      media,
    };
  }

  async listCommunityPosts(
    category?: PostCategory,
    radiusKm?: number,
    lat?: number,
    lng?: number,
  ) {
    const rows = await this.prisma.post.findMany({
      where: category ? { category } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        media: { orderBy: { order: 'asc' } },
        reactions: true,
        _count: { select: { comments: true } },
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
    const userLat = toNumberOrNull(lat);
    const userLng = toNumberOrNull(lng);
    const radiusNum = toNumberOrNull(radiusKm);
    if (userLat === null || userLng === null || radiusNum === null) {
      return rows;
    }
    const maxKm = Math.max(1, radiusNum);
    return rows
      .map((row) => {
        const rowLat = toNumberOrNull(row.latitude);
        const rowLng = toNumberOrNull(row.longitude);
        if (rowLat === null || rowLng === null) {
          // Keep posts without geolocation visible in category feed.
          return row;
        }
        const distanceKm = haversineKm(userLat, userLng, rowLat, rowLng);
        if (distanceKm > maxKm) return null;
        return { ...row, distanceKm: Number(distanceKm.toFixed(1)) };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }

  async toggleReaction(postId: string, userId: string, type: ReactionType) {
    const existing = await this.prisma.postReaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    if (existing && existing.type === type) {
      await this.prisma.postReaction.delete({ where: { id: existing.id } });
    } else if (existing) {
      await this.prisma.postReaction.update({
        where: { id: existing.id },
        data: { type },
      });
    } else {
      await this.prisma.postReaction.create({
        data: { postId, userId, type },
      });
    }
    const [likeCount, dislikeCount] = await Promise.all([
      this.prisma.postReaction.count({ where: { postId, type: ReactionType.LIKE } }),
      this.prisma.postReaction.count({ where: { postId, type: ReactionType.DISLIKE } }),
    ]);
    const mine = await this.prisma.postReaction.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { type: true },
    });
    return { likeCount, dislikeCount, reaction: mine?.type ?? null };
  }
}
