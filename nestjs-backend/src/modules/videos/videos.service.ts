import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateVideoDto } from './dto/create-video.dto';

@Injectable()
export class VideosService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateVideoDto) {
    return this.prisma.video.create({
      data: {
        userId,
        url: dto.url,
        description: dto.description?.trim() || null,
      },
    });
  }

  listFeed() {
    return this.prisma.video.findMany({
      orderBy: { createdAt: 'desc' },
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
}
