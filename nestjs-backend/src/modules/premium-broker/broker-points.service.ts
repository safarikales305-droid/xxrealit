import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BROKER_REWARD_CONFIG } from './broker-reward.config';

@Injectable()
export class BrokerPointsService {
  private readonly log = new Logger(BrokerPointsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private isBrokerRole(role: UserRole): boolean {
    return role === UserRole.AGENT;
  }

  /**
   * Přidá body makléři jednou za dedupeKey (např. `listing:<propertyId>`).
   * Po překročení prahu přičte free leady.
   */
  async awardPointsIfNew(
    userId: string,
    action: string,
    points: number,
    dedupeKey: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    if (points <= 0) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, brokerPoints: true },
    });
    if (!user || !this.isBrokerRole(user.role)) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.brokerPointsLedger.create({
          data: {
            userId,
            action,
            points,
            dedupeKey,
            meta: meta ?? undefined,
          },
        });
        const prev = user.brokerPoints;
        const next = prev + points;
        const { rewardThresholdPoints, freeLeadsPerThreshold } = BROKER_REWARD_CONFIG;
        const prevTiers = Math.floor(prev / rewardThresholdPoints);
        const nextTiers = Math.floor(next / rewardThresholdPoints);
        const bonusLeads =
          nextTiers > prevTiers ? (nextTiers - prevTiers) * freeLeadsPerThreshold : 0;
        await tx.user.update({
          where: { id: userId },
          data: {
            brokerPoints: next,
            ...(bonusLeads > 0 ? { brokerFreeLeads: { increment: bonusLeads } } : {}),
          },
        });
      });
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
      if (code === 'P2002') {
        this.log.debug(`Skip duplicate broker points: ${dedupeKey}`);
        return;
      }
      throw e;
    }
  }

  async onListingCreatedByBroker(
    userId: string,
    propertyId: string,
    listingType: string,
  ): Promise<void> {
    const isShorts = listingType === 'SHORTS';
    const pts = isShorts
      ? BROKER_REWARD_CONFIG.pointsPerAction.LISTING_CREATED_SHORTS
      : BROKER_REWARD_CONFIG.pointsPerAction.LISTING_CREATED_CLASSIC;
    await this.awardPointsIfNew(
      userId,
      isShorts ? 'LISTING_CREATED_SHORTS' : 'LISTING_CREATED_CLASSIC',
      pts,
      `listing:${propertyId}`,
      { propertyId, listingType },
    );
  }

  async onVideoPostCreated(userId: string, postId: string): Promise<void> {
    await this.awardPointsIfNew(
      userId,
      'VIDEO_POST',
      BROKER_REWARD_CONFIG.pointsPerAction.VIDEO_POST,
      `post:video:${postId}`,
      { postId },
    );
  }

  async getProgress(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        brokerPoints: true,
        brokerFreeLeads: true,
        isPremiumBroker: true,
      },
    });
    if (!u) return null;
    const { rewardThresholdPoints } = BROKER_REWARD_CONFIG;
    const pts = u.brokerPoints;
    const into = pts % rewardThresholdPoints;
    const toNext = rewardThresholdPoints - into;
    return {
      role: u.role,
      brokerPoints: pts,
      brokerFreeLeads: u.brokerFreeLeads,
      isPremiumBroker: u.isPremiumBroker,
      rewardThresholdPoints,
      pointsIntoCurrentTier: into,
      pointsToNextReward: toNext === rewardThresholdPoints ? 0 : toNext,
      freeLeadsPerThreshold: BROKER_REWARD_CONFIG.freeLeadsPerThreshold,
    };
  }
}
