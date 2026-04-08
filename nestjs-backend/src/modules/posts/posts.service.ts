import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PostCategory, ReactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';

function isPublicMediaUrl(url: string | null | undefined): boolean {
  const v = (url ?? '').trim();
  return /^https?:\/\//i.test(v);
}

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

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
            email: true,
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
            email: true,
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
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
  }

  createMediaPost(
    userId: string,
    opts: {
      kind: 'video' | 'image';
      url: string;
      description: string;
    },
  ) {
    const text = opts.description.trim();
    const isVideo = opts.kind === 'video';
    return this.prisma.post.create({
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
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
  }

  createListingPost(
    userId: string,
    input: {
      title: string;
      description: string;
      price: number;
      city: string;
      type: 'post' | 'short';
      media: Array<{ url: string; type: 'video' | 'image'; order: number }>;
      category?: PostCategory;
    },
  ) {
    return this.prisma.post.create({
      data: {
        title: input.title,
        description: input.description,
        price: input.price,
        city: input.city,
        type: input.type,
        category: input.category ?? PostCategory.MAKLERI,
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
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
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
            email: true,
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

  listCommunityPosts(category?: PostCategory) {
    return this.prisma.post.findMany({
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
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
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
