import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ensureUserRole } from '../auth/user-role.util';
import { classicPublicListingWhere } from '../properties/property-listing-scope';
import { serializeProperty } from '../properties/properties.serializer';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

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
        coverImage: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
    this.logger.log(
      `[profile-media] updateAvatar userId=${userId} avatarLen=${(updated.avatar ?? '').length} coverSet=${Boolean(updated.coverImage)}`,
    );
    return { ...updated, role: ensureUserRole(updated.role) };
  }

  async updateCoverImage(userId: string, coverImageUrl: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { coverImage: coverImageUrl },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        coverImage: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
    this.logger.log(
      `[profile-media] updateCover userId=${userId} coverLen=${(updated.coverImage ?? '').length} avatarKept=${Boolean(updated.avatar)}`,
    );
    return { ...updated, role: ensureUserRole(updated.role) };
  }

  async clearCoverImage(userId: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { coverImage: null },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        coverImage: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
    return { ...updated, role: ensureUserRole(updated.role) };
  }

  async updateProfileBio(userId: string, bio: string | null | undefined) {
    if (bio === undefined) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          coverImage: true,
          bio: true,
          role: true,
          createdAt: true,
        },
      });
      if (!u) {
        throw new NotFoundException('User not found');
      }
      return { ...u, role: ensureUserRole(u.role) };
    }
    const normalized =
      bio === null || (typeof bio === 'string' && bio.trim().length === 0)
        ? null
        : String(bio).trim().slice(0, 500);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { bio: normalized },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        coverImage: true,
        bio: true,
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
        coverImage: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
    if (!u) return null;
    const profile = {
      id: u.id,
      email: u.email,
      name: u.name,
      role: ensureUserRole(u.role),
      createdAt: u.createdAt,
      avatarUrl: u.avatar ?? null,
      coverImageUrl: u.coverImage ?? null,
      bio: u.bio ?? null,
    };
    this.logger.log(
      `[profile-media] getMeProfile userId=${u.id} hasAvatar=${Boolean(profile.avatarUrl)} hasCover=${Boolean(profile.coverImageUrl)}`,
    );
    return profile;
  }

  async getPublicProfile(userId: string, viewerId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        avatar: true,
        coverImage: true,
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

    let viewerIsAdmin = false;
    if (viewerId) {
      const vu = await this.prisma.user.findUnique({
        where: { id: viewerId },
        select: { role: true },
      });
      viewerIsAdmin = vu?.role === UserRole.ADMIN;
    }

    const [videos, posts, properties] = await Promise.all([
      this.prisma.video.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.post.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.property.findMany({
        where:
          viewerId === userId || viewerIsAdmin
            ? { userId, deletedAt: null }
            : { userId, ...classicPublicListingWhere },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { likes: true } },
          user: { select: { id: true, city: true } },
        },
      }),
    ]);

    return {
      user: {
      id: user.id,
      name: user.name,
      role: ensureUserRole(user.role),
      avatar: user.avatar,
      coverImage: user.coverImage,
      bio: user.bio,
      city: user.city,
      rating: user.rating,
      createdAt: user.createdAt,
      followersCount: user._count.followers,
      followingCount: user._count.following,
      isFollowedByViewer,
      },
      videos,
      posts,
      properties: properties.map((p) =>
        serializeProperty({ ...p, likes: [] }, viewerId),
      ),
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
