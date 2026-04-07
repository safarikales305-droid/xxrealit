import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';

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

  create(userId: string, dto: CreatePostDto) {
    const text = (dto.description ?? dto.content ?? '').trim();
    return this.prisma.post.create({
      data: {
        type: 'text',
        userId,
        content: text || null,
        description: text || null,
      },
      include: {
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

  createVideoPost(userId: string, videoUrl: string, description: string) {
    const text = description.trim();
    return this.prisma.post.create({
      data: {
        type: 'video',
        videoUrl,
        description: text || null,
        content: text || null,
        userId,
      },
      include: {
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
}
