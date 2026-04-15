import { ForbiddenException, Injectable } from '@nestjs/common';
import { StoryType, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { uploadPostMedia } from '../posts/cloudinary-upload';

const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.COMPANY,
  UserRole.AGENCY,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
];

@Injectable()
export class StoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private isProfessionalPublicWhere() {
    return {
      OR: [
        {
          role: UserRole.AGENT,
          isPublicBrokerProfile: true,
          agentProfile: { is: { isPublic: true } },
        },
        {
          role: UserRole.COMPANY,
          companyProfile: { is: { isPublic: true } },
        },
        {
          role: UserRole.AGENCY,
          agencyProfile: { is: { isPublic: true } },
        },
        {
          role: UserRole.FINANCIAL_ADVISOR,
          financialAdvisorProfile: { is: { isPublic: true } },
        },
        {
          role: UserRole.INVESTOR,
          investorProfile: { is: { isPublic: true } },
        },
      ],
    };
  }

  async createStory(userId: string, file: Express.Multer.File) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || !PROFESSIONAL_ROLES.includes(user.role)) {
      throw new ForbiddenException('Příběhy mohou vytvářet pouze profesionální účty.');
    }
    const uploaded = await uploadPostMedia(file);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.story.create({
      data: {
        userId,
        type: uploaded.kind === 'video' ? StoryType.VIDEO : StoryType.IMAGE,
        mediaUrl: uploaded.url,
        isPublic: true,
        createdAt: now,
        expiresAt,
      },
    });
  }

  async listActiveStories() {
    const now = new Date();
    const rows = await this.prisma.story.findMany({
      where: {
        isPublic: true,
        expiresAt: { gt: now },
        user: { is: this.isProfessionalPublicWhere() },
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        type: true,
        mediaUrl: true,
        thumbnailUrl: true,
        createdAt: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            brokerProfileSlug: true,
          },
        },
      },
    });
    return rows;
  }

  async listActiveStoriesByUser(userId: string) {
    const now = new Date();
    return this.prisma.story.findMany({
      where: {
        userId,
        isPublic: true,
        expiresAt: { gt: now },
        user: { is: this.isProfessionalPublicWhere() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        mediaUrl: true,
        thumbnailUrl: true,
        createdAt: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            brokerProfileSlug: true,
          },
        },
      },
    });
  }
}
