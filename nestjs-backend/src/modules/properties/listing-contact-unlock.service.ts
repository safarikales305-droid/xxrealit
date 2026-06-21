import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { MessagesService } from '../messages/messages.service';
import { NotificationsService } from '../premium-broker/notifications.service';
import { CreditWalletService } from '../credits/credit-wallet.service';
import type { ContactUnlockSourceType } from '../credits/credit-wallet.types';
import { ContactMonetizationService } from './contact-monetization.service';
import {
  isContactComplete,
  resolveListingContact,
  type ResolvedContact,
} from './contact-resolve.util';
import { UnlockListingContactDto } from './dto/unlock-listing-contact.dto';
import { ListingLeadWhatsAppNotifyService } from '../whatsapp/listing-lead-whatsapp-notify.service';

const MISSING_CONTACT_MSG = 'Kontakt u tohoto inzerátu není vyplněný.';
const LEAD_DEDUP_MS = 24 * 60 * 60 * 1000;

function normalizePhone(phone: string): string {
  return phone.trim();
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

@Injectable()
export class ListingContactUnlockService {
  private readonly logger = new Logger(ListingContactUnlockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly messages: MessagesService,
    private readonly emails: EmailsService,
    private readonly config: ConfigService,
    private readonly monetization: ContactMonetizationService,
    private readonly wallet: CreditWalletService,
    private readonly listingLeadWhatsApp: ListingLeadWhatsAppNotifyService,
  ) {}

  async resolveUnlockPrice(property: {
    id: string;
    isTiparTip: boolean;
    isContactPaid: boolean;
    isOwnerListing: boolean;
    contactUnlockPrice: number;
  }): Promise<number> {
    if (property.isOwnerListing && !property.isTiparTip) {
      return 0;
    }
    if (property.isTiparTip) {
      const tip = await this.prisma.tiparPost.findFirst({
        where: { publishedPropertyId: property.id, deletedAt: null },
        select: { contactUnlockPrice: true },
      });
      return Math.max(0, tip?.contactUnlockPrice ?? 0);
    }
    if (property.isContactPaid) {
      return Math.max(0, property.contactUnlockPrice);
    }
    return 0;
  }

  async hasUnlocked(
    userId: string | undefined,
    propertyId: string,
    isTiparTip: boolean,
  ): Promise<boolean> {
    if (!userId) return false;
    const listingUnlock = await this.prisma.listingContactUnlock.findUnique({
      where: { userId_propertyId: { userId, propertyId } },
    });
    if (listingUnlock) return true;

    const unlockedLead = await this.prisma.contactLead.findFirst({
      where: {
        listingId: propertyId,
        interestedUserId: userId,
        tipId: null,
        status: 'UNLOCKED',
      },
      select: { id: true },
    });
    if (unlockedLead) return true;

    if (!isTiparTip) return false;
    const tip = await this.prisma.tiparPost.findFirst({
      where: { publishedPropertyId: propertyId, deletedAt: null },
      select: { id: true },
    });
    if (!tip) return false;
    return this.hasUnlockedTip(userId, tip.id);
  }

  async hasUnlockedTip(userId: string, tipId: string): Promise<boolean> {
    const tipUnlock = await this.prisma.contactUnlock.findUnique({
      where: { userId_tiparPostId: { userId, tiparPostId: tipId } },
    });
    return Boolean(tipUnlock);
  }

  async isContactUnlockAvailableForProperty(propertyId: string): Promise<boolean> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: {
        id: true,
        isTiparTip: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        userId: true,
      },
    });
    if (!property) return false;

    const tip = property.isTiparTip
      ? await this.prisma.tiparPost.findFirst({
          where: { publishedPropertyId: property.id, deletedAt: null },
          select: {
            contactName: true,
            contactPhone: true,
            contactEmail: true,
            userId: true,
          },
        })
      : null;

    const ownerId = tip?.userId ?? property.userId;
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { name: true, phone: true, email: true },
    });

    const contact = resolveListingContact({
      listing: property,
      tip,
      owner,
    });
    return isContactComplete(contact);
  }

  private validateLead(dto: UnlockListingContactDto) {
    const name = dto.name?.trim() ?? '';
    const email = dto.email?.trim().toLowerCase() ?? '';
    const phone = normalizePhone(dto.phone ?? '');
    const message = dto.message?.trim() || null;
    if (name.length < 2) {
      throw new BadRequestException('Vyplňte jméno.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Vyplňte platný e-mail.');
    }
    if (!phone || !isValidPhone(phone)) {
      throw new BadRequestException('Vyplňte platné telefonní číslo.');
    }
    return { name, email, phone, message };
  }

  private assertContactAvailable(contact: ResolvedContact) {
    if (!contact.phone && !contact.email) {
      throw new BadRequestException(MISSING_CONTACT_MSG);
    }
    if (!isContactComplete(contact)) {
      throw new BadRequestException(MISSING_CONTACT_MSG);
    }
  }

  private contactResponse(contact: ResolvedContact) {
    return {
      phone: contact.phone,
      email: contact.email,
      contactName: contact.contactName,
    };
  }

  async unlockContact(buyerUserId: string, propertyId: string, dto: UnlockListingContactDto) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: {
        id: true,
        userId: true,
        title: true,
        city: true,
        listingType: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        isTiparTip: true,
        isContactPaid: true,
        isOwnerListing: true,
        contactUnlockPrice: true,
        user: { select: { role: true } },
      },
    });
    if (!property) throw new NotFoundException('Inzerát nenalezen');

    if (!property.isTiparTip) {
      return this.submitAdvertiserListingInterest(buyerUserId, property, dto);
    }

    return this.unlockTipListingContact(buyerUserId, property, dto);
  }

  async getBuyerAdvertiserLeadState(buyerUserId: string | undefined, propertyId: string) {
    if (!buyerUserId) {
      return { submitted: false, sellerContactVisible: false, status: null as string | null };
    }
    const lead = await this.prisma.contactLead.findFirst({
      where: {
        listingId: propertyId,
        interestedUserId: buyerUserId,
        tipId: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    const sellerContactVisible = Boolean(lead) && lead!.status === 'UNLOCKED';
    return {
      submitted: Boolean(lead),
      status: lead?.status ?? null,
      sellerContactVisible,
    };
  }

  private async resolvePropertySellerContact(propertyId: string): Promise<ResolvedContact | null> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: {
        id: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        userId: true,
        isTiparTip: true,
      },
    });
    if (!property || property.isTiparTip) return null;

    const owner = await this.prisma.user.findUnique({
      where: { id: property.userId },
      select: { name: true, phone: true, email: true },
    });
    const contact = resolveListingContact({ listing: property, tip: null, owner });
    return isContactComplete(contact) ? contact : null;
  }

  private sellerContactPayload(contact: ResolvedContact) {
    return this.contactResponse(contact);
  }

  private async ensureBuyerListingUnlock(
    tx: import('@prisma/client').Prisma.TransactionClient,
    buyerUserId: string,
    propertyId: string,
  ) {
    await tx.listingContactUnlock.upsert({
      where: { userId_propertyId: { userId: buyerUserId, propertyId } },
      create: { userId: buyerUserId, propertyId, amount: 0 },
      update: {},
    });
  }

  async listAdvertiserLeads(ownerUserId: string) {
    const rows = await this.prisma.contactLead.findMany({
      where: {
        ownerUserId,
        tipId: null,
        listingId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        listing: {
          select: { id: true, title: true, city: true },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      listingId: row.listingId,
      listingTitle: row.listing?.title ?? null,
      listingCity: row.listing?.city ?? null,
      buyerName: row.name,
      buyerPhone: row.status === 'UNLOCKED' ? row.phone : null,
      buyerEmail: row.status === 'UNLOCKED' ? row.email : null,
      message: row.status === 'UNLOCKED' ? row.message : null,
      leadSource: row.leadSource,
      status: row.status,
      creditCharged: row.creditCharged,
      leadPrice: row.ownerChargedAmount,
      unlockedAt: row.unlockedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async unlockPendingLeadsForUser(ownerUserId: string) {
    const pending = await this.prisma.contactLead.findMany({
      where: {
        ownerUserId,
        status: 'WAITING_FOR_CREDIT',
        tipId: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    let unlocked = 0;
    for (const lead of pending) {
      const price = Math.max(0, lead.ownerChargedAmount);
      const canAfford = await this.monetization.ownerCanAffordLead(ownerUserId, price);
      if (!canAfford) break;

      const listing = lead.listingId
        ? await this.prisma.property.findUnique({
            where: { id: lead.listingId },
            select: { title: true },
          })
        : null;

      await this.prisma.$transaction(async (tx) => {
        if (price > 0) {
          await this.monetization.chargeOwnerForLead(
            tx,
            ownerUserId,
            price,
            lead.listingId ?? lead.id,
            lead.id,
            listing?.title ?? 'inzerát',
          );
        }
        await tx.contactLead.update({
          where: { id: lead.id },
          data: {
            status: 'UNLOCKED',
            creditCharged: price > 0,
            unlockedAt: new Date(),
          },
        });
        if (lead.interestedUserId && lead.listingId) {
          await this.ensureBuyerListingUnlock(tx, lead.interestedUserId, lead.listingId);
        }
      });

      await this.notifyOwner({
        buyerUserId: lead.interestedUserId,
        ownerUserId,
        propertyId: lead.listingId ?? lead.id,
        propertyTitle: listing?.title ?? 'inzerát',
        lead: {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          message: lead.message,
        },
        waitingForCredit: false,
        skipWhatsApp: true,
      });
      unlocked += 1;
    }

    return { unlocked, remaining: Math.max(0, pending.length - unlocked) };
  }

  private async submitAdvertiserListingInterest(
    buyerUserId: string,
    property: {
      id: string;
      userId: string;
      title: string;
      listingType: string;
      user: { role: import('@prisma/client').UserRole };
    },
    dto: UnlockListingContactDto,
  ) {
    if (property.userId === buyerUserId) {
      throw new BadRequestException('U vlastního inzerátu nelze projevit zájem.');
    }

    const lead = this.validateLead(dto);
    const existingUnlocked = await this.prisma.contactLead.findFirst({
      where: {
        listingId: property.id,
        interestedUserId: buyerUserId,
        tipId: null,
        status: 'UNLOCKED',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existingUnlocked) {
      await this.prisma.$transaction(async (tx) => {
        await this.ensureBuyerListingUnlock(tx, buyerUserId, property.id);
      });
      const sellerContact = await this.resolvePropertySellerContact(property.id);
      return {
        submitted: true,
        duplicate: false,
        alreadyUnlocked: true,
        status: 'UNLOCKED',
        contactUnlocked: true,
        sellerContactVisible: true,
        message: 'Kontakt je již odemčený.',
        ...(sellerContact ? this.sellerContactPayload(sellerContact) : {}),
      };
    }

    const since = new Date(Date.now() - LEAD_DEDUP_MS);
    const duplicate = await this.prisma.contactLead.findFirst({
      where: {
        listingId: property.id,
        tipId: null,
        createdAt: { gte: since },
        OR: [{ phone: lead.phone }, { email: lead.email }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (duplicate) {
      if (duplicate.status === 'UNLOCKED' && duplicate.interestedUserId === buyerUserId) {
        await this.prisma.$transaction(async (tx) => {
          await this.ensureBuyerListingUnlock(tx, buyerUserId, property.id);
        });
      }
      const sellerContact =
        duplicate.status === 'UNLOCKED'
          ? await this.resolvePropertySellerContact(property.id)
          : null;
      return {
        submitted: true,
        duplicate: true,
        status: duplicate.status,
        contactUnlocked: duplicate.status === 'UNLOCKED',
        sellerContactVisible: duplicate.status === 'UNLOCKED',
        message:
          duplicate.status === 'UNLOCKED'
            ? 'Děkujeme, prodejce vás bude brzy kontaktovat.'
            : 'Děkujeme, prodejce se vám brzy ozve.',
        ...(sellerContact ? this.sellerContactPayload(sellerContact) : {}),
      };
    }

    const settings = await this.monetization.getSettings();
    const leadSource = this.monetization.resolveLeadSource({
      listingType: property.listingType,
      ownerRole: property.user.role,
    });
    const leadPrice = this.monetization.resolveLeadPrice(settings, leadSource);
    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      let ownerChargedAmount = leadPrice;
      let creditCharged = false;
      let status: 'UNLOCKED' | 'WAITING_FOR_CREDIT' = 'UNLOCKED';
      let unlockedAt: Date | null = now;
      let canAfford = leadPrice === 0;

      if (leadPrice > 0) {
        canAfford = await this.monetization.ownerCanAffordLeadTx(
          tx,
          property.userId,
          leadPrice,
        );
      }

      if (!canAfford && leadPrice > 0) {
        status = 'WAITING_FOR_CREDIT';
        creditCharged = false;
        unlockedAt = null;
      } else if (leadPrice === 0) {
        ownerChargedAmount = 0;
        creditCharged = false;
      }

      const leadRow = await tx.contactLead.create({
        data: {
          listingId: property.id,
          sourceType: 'LISTING',
          sourceId: property.id,
          leadSource,
          interestedUserId: buyerUserId,
          ownerUserId: property.userId,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          message: lead.message,
          status,
          unlockPrice: 0,
          ownerChargedAmount: status === 'WAITING_FOR_CREDIT' ? leadPrice : ownerChargedAmount,
          creditCharged,
          unlockedAt,
        },
      });

      if (canAfford && leadPrice > 0) {
        const charged = await this.monetization.chargeOwnerForLead(
          tx,
          property.userId,
          leadPrice,
          property.id,
          leadRow.id,
          property.title,
        );
        ownerChargedAmount = charged;
        creditCharged = charged > 0;
        await tx.contactLead.update({
          where: { id: leadRow.id },
          data: { ownerChargedAmount: charged, creditCharged: charged > 0 },
        });
      }

      if (status === 'UNLOCKED') {
        await this.ensureBuyerListingUnlock(tx, buyerUserId, property.id);
      }

      return { ...leadRow, ownerChargedAmount, creditCharged, status };
    });

    const waitingForCredit = created.status === 'WAITING_FOR_CREDIT';
    await this.notifyOwner({
      buyerUserId,
      ownerUserId: property.userId,
      propertyId: property.id,
      propertyTitle: property.title,
      lead,
      waitingForCredit,
    });

    const sellerContact = !waitingForCredit
      ? await this.resolvePropertySellerContact(property.id)
      : null;

    return {
      submitted: true,
      duplicate: false,
      status: created.status,
      contactUnlocked: !waitingForCredit,
      sellerContactVisible: !waitingForCredit,
      message: waitingForCredit
        ? 'Děkujeme, prodejce se vám brzy ozve.'
        : 'Děkujeme, prodejce vás bude brzy kontaktovat.',
      leadPriceCharged: created.creditCharged ? created.ownerChargedAmount : 0,
      ...(sellerContact ? this.sellerContactPayload(sellerContact) : {}),
    };
  }

  private async unlockTipListingContact(
    buyerUserId: string,
    property: {
      id: string;
      userId: string;
      title: string;
      city: string;
      contactName: string | null;
      contactPhone: string | null;
      contactEmail: string | null;
      isTiparTip: boolean;
      isContactPaid: boolean;
      isOwnerListing: boolean;
      contactUnlockPrice: number;
    },
    dto: UnlockListingContactDto,
  ) {
    const propertyId = property.id;
    const tip = await this.prisma.tiparPost.findFirst({
      where: { publishedPropertyId: property.id, deletedAt: null },
      select: {
        id: true,
        userId: true,
        isShorts: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        contactUnlockPrice: true,
      },
    });

    const ownerUser = await this.prisma.user.findUnique({
      where: { id: tip?.userId ?? property.userId },
      select: { id: true, name: true, phone: true, email: true },
    });

    const contact = resolveListingContact({
      listing: property,
      tip,
      owner: ownerUser,
    });
    this.assertContactAvailable(contact);

    if (property.userId === buyerUserId) {
      return {
        ...this.contactResponse(contact),
        alreadyUnlocked: true,
        creditCharged: 0,
      };
    }

    const alreadyUnlocked = await this.hasUnlocked(
      buyerUserId,
      propertyId,
      property.isTiparTip,
    );
    if (alreadyUnlocked) {
      return {
        ...this.contactResponse(contact),
        alreadyUnlocked: true,
        creditCharged: 0,
      };
    }

    const lead = this.validateLead(dto);
    const settings = await this.monetization.getSettings();
    const buyerPrice = await this.resolveUnlockPrice(property);
    const ownerCharge =
      property.isOwnerListing && !property.isTiparTip
        ? settings.ownerListingContactPrice
        : 0;
    const sourceType: ContactUnlockSourceType = property.isTiparTip
      ? tip?.isShorts
        ? 'TIP_SHORTS'
        : 'TIP'
      : 'LISTING';
    const tipSplit =
      property.isTiparTip && buyerPrice > 0
        ? this.monetization.computeTipSplit(buyerPrice, settings)
        : { portalAmount: 0, tipsterAmount: buyerPrice };

    const buyer = await this.prisma.user.findUnique({
      where: { id: buyerUserId },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
        name: true,
        email: true,
      },
    });
    if (!buyer) throw new NotFoundException('Uživatel nenalezen');

    if (buyerPrice > 0) {
      const creditSettings = await this.prisma.creditTopUpSetting.findUnique({
        where: { id: 'default' },
      });
      this.wallet.assertContactUnlockAffordable(buyer, buyerPrice, sourceType, {
        allowBonusCreditOnListingContacts:
          creditSettings?.allowBonusCreditOnListingContacts ?? true,
        allowBonusCreditOnTipContacts:
          creditSettings?.allowBonusCreditOnTipContacts ?? false,
        allowPendingCreditSpending: creditSettings?.allowPendingCreditSpending ?? false,
        allowPendingForInternalServices:
          creditSettings?.allowPendingForInternalServices ?? false,
      });
    }

    const tipsterUserId = tip?.userId ?? null;
    const notifyUserId = tipsterUserId ?? property.userId;

    await this.prisma.$transaction(async (tx) => {
      await tx.listingContactUnlock.create({
        data: {
          userId: buyerUserId,
          propertyId,
          amount: buyerPrice,
        },
      });

      if (tip) {
        await tx.contactUnlock.create({
          data: {
            userId: buyerUserId,
            tiparPostId: tip.id,
            amount: buyerPrice,
          },
        });
      }

      if (buyerPrice > 0) {
        await this.wallet.spendForContactUnlock(
          tx,
          buyerUserId,
          buyerPrice,
          sourceType,
          propertyId,
          `Odemčení kontaktu: ${property.title}`,
        );

        if (property.isTiparTip && tipsterUserId) {
          if (tipSplit.tipsterAmount > 0) {
            await this.wallet.creditReal(
              tx,
              tipsterUserId,
              tipSplit.tipsterAmount,
              'TIPSTER_EARNING',
              tip?.id ?? propertyId,
              `Výdělek tipaře za odemčení kontaktu: ${property.title}`,
            );
          }
          if (tip) {
            await tx.creditTransaction.create({
              data: {
                buyerUserId,
                tiparUserId: tipsterUserId,
                tiparPostId: tip.id,
                amount: buyerPrice,
                type: 'TIP_UNLOCK',
                sourceType,
                sourceId: propertyId,
                counterpartyUserId: tipsterUserId,
                portalAmount: tipSplit.portalAmount,
                tipsterAmount: tipSplit.tipsterAmount,
                description: `Odemčení kontaktu tipu: ${property.title}`,
              },
            });
          }
        } else if (!property.isTiparTip && buyerPrice > 0) {
          await this.wallet.creditReal(
            tx,
            property.userId,
            buyerPrice,
            'LISTING_CONTACT_UNLOCK',
            propertyId,
            `Odemčení kontaktu inzerátu: ${property.title}`,
          );
        }
      }

      let ownerChargedAmount = 0;
      if (ownerCharge > 0) {
        const leadRow = await tx.contactLead.create({
          data: {
            listingId: propertyId,
            tipId: tip?.id ?? null,
            sourceType,
            sourceId: propertyId,
            interestedUserId: buyerUserId,
            ownerUserId: property.userId,
            tipsterUserId,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            unlockPrice: buyerPrice,
            portalAmount: property.isTiparTip ? tipSplit.portalAmount : 0,
            tipsterAmount: property.isTiparTip ? tipSplit.tipsterAmount : 0,
            ownerChargedAmount: 0,
            creditCharged: buyerPrice > 0,
            status: 'UNLOCKED',
            unlockedAt: new Date(),
          },
        });
        ownerChargedAmount = await this.monetization.chargeOwnerForLead(
          tx,
          property.userId,
          ownerCharge,
          propertyId,
          leadRow.id,
          property.title,
        );
        await tx.contactLead.update({
          where: { id: leadRow.id },
          data: { ownerChargedAmount },
        });
      } else {
        await tx.contactLead.create({
          data: {
            listingId: propertyId,
            tipId: tip?.id ?? null,
            sourceType,
            sourceId: propertyId,
            interestedUserId: buyerUserId,
            ownerUserId: property.userId,
            tipsterUserId,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            unlockPrice: buyerPrice,
            portalAmount: property.isTiparTip ? tipSplit.portalAmount : 0,
            tipsterAmount: property.isTiparTip ? tipSplit.tipsterAmount : 0,
            ownerChargedAmount: 0,
            creditCharged: buyerPrice > 0,
            status: 'UNLOCKED',
            unlockedAt: new Date(),
          },
        });
      }
    });

    await this.notifyOwner({
      buyerUserId,
      ownerUserId: notifyUserId,
      propertyId: property.id,
      propertyTitle: property.title,
      lead,
    });

    return {
      ...this.contactResponse(contact),
      alreadyUnlocked: false,
      creditCharged: buyerPrice,
    };
  }

  async unlockTipContact(buyerUserId: string, tipId: string, dto: UnlockListingContactDto) {
    const tip = await this.prisma.tiparPost.findFirst({
      where: { id: tipId, deletedAt: null, isActive: true, approved: true },
      select: {
        id: true,
        userId: true,
        title: true,
        isShorts: true,
        publishedPropertyId: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        contactUnlockPrice: true,
      },
    });
    if (!tip) throw new NotFoundException('Tip nenalezen');

    if (tip.publishedPropertyId) {
      return this.unlockContact(buyerUserId, tip.publishedPropertyId, dto);
    }

    const tipster = await this.prisma.user.findUnique({
      where: { id: tip.userId },
      select: { name: true, phone: true, email: true },
    });
    const contact = resolveListingContact({ tip, owner: tipster });
    this.assertContactAvailable(contact);

    if (tip.userId === buyerUserId) {
      return {
        unlocked: true,
        alreadyOwned: true,
        cost: 0,
        contact: {
          contactName: contact.contactName,
          contactPhone: contact.phone,
          contactEmail: contact.email,
        },
        creditBalance: (
          await this.prisma.user.findUnique({
            where: { id: buyerUserId },
            select: { creditBalance: true },
          })
        )?.creditBalance,
      };
    }

    if (await this.hasUnlockedTip(buyerUserId, tipId)) {
      const buyer = await this.prisma.user.findUnique({
        where: { id: buyerUserId },
        select: { creditBalance: true },
      });
      return {
        unlocked: true,
        alreadyOwned: true,
        cost: 0,
        contact: {
          contactName: contact.contactName,
          contactPhone: contact.phone,
          contactEmail: contact.email,
        },
        creditBalance: buyer?.creditBalance ?? 0,
      };
    }

    const lead = this.validateLead(dto);
    const settings = await this.monetization.getSettings();
    const buyerPrice = Math.max(0, tip.contactUnlockPrice);
    const tipSplit = this.monetization.computeTipSplit(buyerPrice, settings);
    const sourceType: ContactUnlockSourceType = tip.isShorts ? 'TIP_SHORTS' : 'TIP';

    const buyer = await this.prisma.user.findUnique({
      where: { id: buyerUserId },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
      },
    });
    if (!buyer) throw new NotFoundException('Uživatel nenalezen');
    if (buyerPrice > 0) {
      const creditSettings = await this.prisma.creditTopUpSetting.findUnique({
        where: { id: 'default' },
      });
      this.wallet.assertContactUnlockAffordable(buyer, buyerPrice, sourceType, {
        allowBonusCreditOnListingContacts:
          creditSettings?.allowBonusCreditOnListingContacts ?? true,
        allowBonusCreditOnTipContacts:
          creditSettings?.allowBonusCreditOnTipContacts ?? false,
        allowPendingCreditSpending: creditSettings?.allowPendingCreditSpending ?? false,
        allowPendingForInternalServices:
          creditSettings?.allowPendingForInternalServices ?? false,
      });
    }

    const newBalance = await this.prisma.$transaction(async (tx) => {
      await tx.contactUnlock.create({
        data: { userId: buyerUserId, tiparPostId: tipId, amount: buyerPrice },
      });

      if (buyerPrice > 0) {
        const spent = await this.wallet.spendForContactUnlock(
          tx,
          buyerUserId,
          buyerPrice,
          sourceType,
          tipId,
          `Odemčení kontaktu tipu: ${tip.title}`,
        );

        if (tipSplit.tipsterAmount > 0) {
          await this.wallet.creditReal(
            tx,
            tip.userId,
            tipSplit.tipsterAmount,
            'TIPSTER_EARNING',
            tipId,
            `Výdělek tipaře za odemčení kontaktu: ${tip.title}`,
          );
        }

        await tx.creditTransaction.create({
          data: {
            buyerUserId,
            tiparUserId: tip.userId,
            tiparPostId: tipId,
            amount: buyerPrice,
            type: 'TIP_UNLOCK',
            sourceType,
            sourceId: tipId,
            counterpartyUserId: tip.userId,
            portalAmount: tipSplit.portalAmount,
            tipsterAmount: tipSplit.tipsterAmount,
            description: `Odemčení kontaktu tipu: ${tip.title}`,
          },
        });

        await tx.contactLead.create({
          data: {
            tipId,
            sourceType,
            sourceId: tipId,
            interestedUserId: buyerUserId,
            ownerUserId: tip.userId,
            tipsterUserId: tip.userId,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            unlockPrice: buyerPrice,
            portalAmount: tipSplit.portalAmount,
            tipsterAmount: tipSplit.tipsterAmount,
            creditCharged: true,
          },
        });

        return spent.creditBalance;
      }

      await tx.contactLead.create({
        data: {
          tipId,
          sourceType,
          sourceId: tipId,
          interestedUserId: buyerUserId,
          ownerUserId: tip.userId,
          tipsterUserId: tip.userId,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          unlockPrice: 0,
          creditCharged: false,
        },
      });

      return buyer.creditBalance;
    });

    await this.notifyOwner({
      buyerUserId,
      ownerUserId: tip.userId,
      propertyId: tipId,
      propertyTitle: tip.title,
      lead,
      listingPath: `/tipar/${tipId}`,
    });

    return {
      unlocked: true,
      alreadyOwned: false,
      cost: buyerPrice,
      contact: {
        contactName: contact.contactName,
        contactPhone: contact.phone,
        contactEmail: contact.email,
      },
      creditBalance: newBalance,
    };
  }

  private async notifyOwner(input: {
    buyerUserId: string;
    ownerUserId: string;
    propertyId: string;
    propertyTitle: string;
    lead: { name: string; email: string; phone: string; message?: string | null };
    listingPath?: string;
    waitingForCredit?: boolean;
    skipWhatsApp?: boolean;
  }) {
    const listingUrl = this.listingUrl(input.propertyId, input.listingPath);
    const now = new Date();
    const dateStr = now.toLocaleDateString('cs-CZ');
    const timeStr = now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    const waiting = input.waitingForCredit === true;

    try {
      await this.notifications.create(
        input.ownerUserId,
        'CONTACT_LEAD',
        waiting ? 'Nový zájemce – dobijte kredit' : 'Zájemce o váš inzerát',
        waiting
          ? 'Máte nového zájemce. Pro zobrazení kontaktu dobijte kredit.'
          : `Máte nového zájemce o inzerát ${input.propertyTitle}.`,
        {
          propertyId: input.propertyId,
          listingUrl,
          leadName: input.lead.name,
          leadEmail: waiting ? null : input.lead.email,
          leadPhone: waiting ? null : input.lead.phone,
          status: waiting ? 'WAITING_FOR_CREDIT' : 'UNLOCKED',
          date: dateStr,
          time: timeStr,
        },
      );
    } catch (err) {
      this.logger.warn(`Notification failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!waiting) {
      try {
        const buyerConv = await this.messages.getOrCreateConversation(
          input.buyerUserId,
          input.propertyId,
        );
        await this.messages.sendMessage(
          input.buyerUserId,
          buyerConv.id,
          [
            '[Nový zájemce]',
            `Jméno: ${input.lead.name}`,
            `E-mail: ${input.lead.email}`,
            `Telefon: ${input.lead.phone}`,
            input.lead.message ? `Zpráva: ${input.lead.message}` : '',
            '',
            `Inzerát: ${listingUrl}`,
            `Datum: ${dateStr} ${timeStr}`,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      } catch (err) {
        this.logger.warn(`Internal message failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    try {
      const owner = await this.prisma.user.findUnique({
        where: { id: input.ownerUserId },
        select: { email: true, name: true },
      });
      if (owner?.email?.trim()) {
        if (waiting) {
          await this.emails.sendContactLeadWaitingCreditEmail({
            to: owner.email.trim(),
            ownerName: owner.name || 'inzerente',
            listingTitle: input.propertyTitle,
            listingUrl,
          });
        } else {
          await this.emails.sendContactLeadEmail({
            to: owner.email.trim(),
            ownerName: owner.name || 'inzerente',
            listingTitle: input.propertyTitle,
            listingUrl,
            leadName: input.lead.name,
            leadEmail: input.lead.email,
            leadPhone: input.lead.phone,
            date: dateStr,
            time: timeStr,
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Lead email failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!input.skipWhatsApp) {
      try {
        await this.listingLeadWhatsApp.notifyAdvertiser({
          ownerUserId: input.ownerUserId,
          listingTitle: input.propertyTitle,
          leadName: input.lead.name,
          leadPhone: input.lead.phone,
          leadEmail: input.lead.email,
          waitingForCredit: waiting,
        });
      } catch (err) {
        this.logger.warn(`Lead WhatsApp failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private listingUrl(propertyId: string, path?: string): string {
    const base =
      this.config.get<string>('FRONTEND_URL')?.trim() ||
      this.config.get<string>('NEXT_PUBLIC_SITE_URL')?.trim() ||
      'https://www.xxrealit.cz';
    const suffix = path ?? `/nemovitost/${propertyId}`;
    return `${base.replace(/\/+$/, '')}${suffix}`;
  }
}
