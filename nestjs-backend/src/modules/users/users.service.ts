import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { User, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ensureUserRole } from '../auth/user-role.util';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: {
    email: string;
    password: string;
    name?: string | null;
    role: UserRole;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  setPasswordResetToken(
    userId: string,
    token: string,
    resetExpires: Date,
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { resetToken: token, resetExpires },
    });
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        createdAt: true,
      },
    });
    return { ...updated, role: ensureUserRole(updated.role) };
  }

  async getMeProfile(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        createdAt: true,
      },
    });
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: ensureUserRole(u.role),
      createdAt: u.createdAt,
      avatarUrl: u.avatar ?? null,
    };
  }

  async getPublicProfile(userId: string, viewerId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        avatar: true,
        bio: true,
        city: true,
        rating: true,
        createdAt: true,
        _count: { select: { followers: true, following: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let isFollowedByViewer: boolean | null = null;
    if (viewerId && viewerId !== userId) {
      const row = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewerId,
            followingId: userId,
          },
        },
      });
      isFollowedByViewer = !!row;
    }

    return {
      id: user.id,
      name: user.name,
      role: ensureUserRole(user.role),
      avatar: user.avatar,
      bio: user.bio,
      city: user.city,
      rating: user.rating,
      createdAt: user.createdAt,
      followersCount: user._count.followers,
      followingCount: user._count.following,
      isFollowedByViewer,
    };
  }

  async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('Cannot follow yourself');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: followingId },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    try {
      await this.prisma.follow.create({
        data: { followerId, followingId },
      });
      const followersCount = await this.prisma.follow.count({
        where: { followingId },
      });
      return { ok: true, followersCount };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Already following');
      }
      throw e;
    }
  }

  async unfollowUser(followerId: string, followingId: string) {
    await this.prisma.follow.deleteMany({
      where: { followerId, followingId },
    });
    const followersCount = await this.prisma.follow.count({
      where: { followingId },
    });
    return { ok: true, followersCount };
  }
}
