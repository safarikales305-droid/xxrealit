import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from './notifications.service';

type PropertyRow = {
  id: string;
  title: string;
  city: string;
  region: string;
  district: string;
  propertyType: string;
  isOwnerListing: boolean;
};

@Injectable()
export class OwnerListingNotifyService {
  private readonly log = new Logger(OwnerListingNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private matchesPreferences(
    broker: {
      brokerPreferredRegions: string[];
      brokerPreferredPropertyTypes: string[];
    },
    property: PropertyRow,
  ): boolean {
    const regs = broker.brokerPreferredRegions.map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (regs.length > 0) {
      const city = property.city.toLowerCase();
      const region = (property.region ?? '').toLowerCase();
      const district = (property.district ?? '').toLowerCase();
      const hit = regs.some(
        (r) => city.includes(r) || region.includes(r) || district.includes(r) || r === city,
      );
      if (!hit) return false;
    }
    const types = broker.brokerPreferredPropertyTypes.map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (types.length > 0) {
      const pt = property.propertyType.toLowerCase();
      if (!types.includes(pt)) return false;
    }
    return true;
  }

  async notifyPremiumBrokersForNewOwnerListing(property: PropertyRow): Promise<void> {
    if (!property.isOwnerListing) return;

    const brokers = await this.prisma.user.findMany({
      where: {
        role: UserRole.AGENT,
        isPremiumBroker: true,
        brokerLeadNotificationEnabled: true,
      },
      select: {
        id: true,
        brokerPreferredRegions: true,
        brokerPreferredPropertyTypes: true,
      },
    });

    const title = 'Nový inzerát od přímého vlastníka';
    const bodyBase = `${property.title} — ${property.city}`;

    let sent = 0;
    for (const b of brokers) {
      if (!this.matchesPreferences(b, property)) continue;
      try {
        await this.notifications.create(
          b.id,
          'OWNER_LISTING_NEW',
          title,
          bodyBase,
          { propertyId: property.id, city: property.city, propertyType: property.propertyType },
        );
        sent += 1;
      } catch (e) {
        this.log.warn(`notify broker ${b.id}: ${e}`);
      }
    }
    this.log.log(`Owner listing ${property.id}: notified ${sent} premium broker(s)`);
  }
}
