import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingViewSource } from '@prisma/client';
import { propertyTotalViews } from '../../common/listing-statistics.util';
import { PrismaService } from '../../database/prisma.service';
import { StatisticsSettingsService } from './statistics-settings.service';

@Injectable()
export class ListingViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: StatisticsSettingsService,
  ) {}

  async recordView(
    listingId: string,
    source: ListingViewSource,
    opts: { userId?: string | null; visitorId?: string | null },
  ) {
    const userId = opts.userId?.trim() || null;
    const visitorId = opts.visitorId?.trim() || null;
    if (!userId && !visitorId) {
      throw new BadRequestException('Chybí identifikátor návštěvníka.');
    }

    const property = await this.prisma.property.findFirst({
      where: { id: listingId, deletedAt: null },
      select: {
        id: true,
        realViews: true,
        manualViews: true,
        autopilotViews: true,
        viewsCount: true,
        isActive: true,
        approved: true,
      },
    });
    if (!property) {
      throw new NotFoundException('Inzerát nenalezen.');
    }

    const global = await this.settings.get();
    const dedupHours = Math.max(1, global.viewDedupHours ?? 24);
    const since = new Date(Date.now() - dedupHours * 3_600_000);

    const recent = await this.prisma.listingView.findFirst({
      where: {
        listingId,
        createdAt: { gte: since },
        ...(userId ? { userId } : { visitorId: visitorId! }),
      },
      select: { id: true },
    });
    if (recent) {
      return {
        recorded: false,
        totalViews: propertyTotalViews(property),
        realViews: property.realViews,
        manualViews: property.manualViews,
        autopilotViews: property.autopilotViews,
      };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.listingView.create({
        data: {
          listingId,
          userId,
          visitorId: userId ? null : visitorId,
          source,
        },
      });
      const nextReal = property.realViews + 1;
      const total = propertyTotalViews({
        realViews: nextReal,
        manualViews: property.manualViews,
        autopilotViews: property.autopilotViews,
      });
      return tx.property.update({
        where: { id: listingId },
        data: {
          realViews: { increment: 1 },
          viewsCount: total,
        },
        select: {
          realViews: true,
          manualViews: true,
          autopilotViews: true,
          viewsCount: true,
        },
      });
    });

    return {
      recorded: true,
      totalViews: propertyTotalViews(updated),
      realViews: updated.realViews,
      manualViews: updated.manualViews,
      autopilotViews: updated.autopilotViews,
    };
  }

  syncPropertyViewsCount(propertyId: string) {
    return this.prisma.property
      .findUnique({
        where: { id: propertyId },
        select: { realViews: true, manualViews: true, autopilotViews: true },
      })
      .then((row) => {
        if (!row) return null;
        const total = propertyTotalViews(row);
        return this.prisma.property.update({
          where: { id: propertyId },
          data: { viewsCount: total },
        });
      });
  }
}
