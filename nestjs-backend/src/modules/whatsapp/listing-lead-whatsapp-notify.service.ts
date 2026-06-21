import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppCloudApiService } from './whatsapp-cloud-api.service';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { normalizeToE164 } from './whatsapp-phone.util';

@Injectable()
export class ListingLeadWhatsAppNotifyService {
  private readonly logger = new Logger(ListingLeadWhatsAppNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfigService,
    private readonly cloudApi: WhatsAppCloudApiService,
  ) {}

  async notifyAdvertiser(input: {
    ownerUserId: string;
    listingTitle: string;
    leadName: string;
    leadPhone: string;
    leadEmail: string;
    waitingForCredit: boolean;
  }): Promise<void> {
    if (!this.config.isCloudApiConfigured()) return;

    const owner = await this.prisma.user.findUnique({
      where: { id: input.ownerUserId },
      select: {
        name: true,
        phone: true,
        whatsappPhone: true,
        whatsappVerified: true,
        whatsappMarketingOptOut: true,
      },
    });
    if (!owner?.whatsappVerified || owner.whatsappMarketingOptOut) return;

    const rawPhone = owner.whatsappPhone?.trim() || owner.phone?.trim();
    if (!rawPhone) return;

    const phoneE164 = normalizeToE164(rawPhone);
    if (!phoneE164) return;

    const body = input.waitingForCredit
      ? [
          `Máte nového zájemce o vaši nemovitost na XXrealit.cz.`,
          `Inzerát: ${input.listingTitle}`,
          `Pro zobrazení kontaktu si prosím dobijte kredit.`,
          `Po dobití se vám ihned zobrazí kontakty na zájemce, kteří se zajímali o vaši nemovitost.`,
        ].join('\n')
      : [
          `Máte nového zájemce o inzerát ${input.listingTitle}.`,
          `Jméno: ${input.leadName}`,
          `Telefon: ${input.leadPhone}`,
          `E-mail: ${input.leadEmail}`,
        ].join('\n');

    try {
      await this.cloudApi.sendMessages(
        {
          messaging_product: 'whatsapp',
          to: phoneE164.replace(/^\+/, ''),
          type: 'text',
          text: { body, preview_url: false },
        },
        {
          recipientPhone: phoneE164,
          recipientName: owner.name ?? undefined,
          recipientUserId: input.ownerUserId,
          logLabel: input.waitingForCredit ? 'listing-lead-waiting-credit' : 'listing-lead-unlocked',
        },
      );
    } catch (err) {
      this.logger.warn(
        `Listing lead WhatsApp failed owner=${input.ownerUserId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
