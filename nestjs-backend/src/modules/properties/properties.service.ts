import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.property.findMany({
      orderBy: { createdAt: 'desc' },
    });
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
