import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiSalesContactType,
  AiSalesContactVerificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EMAIL_RE } from './ai-sales-prospect.service';
import { AiSalesSuppressionService } from './ai-sales-suppression.service';
import { AiSalesAdminException, buildSalesAdminError } from './ai-sales-errors.util';

export type SaveSearchResultOptions = {
  selectedContactIds?: string[];
  primaryEmailContactId?: string;
  primaryPhoneContactId?: string;
};

@Injectable()
export class AiSalesPublicContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppression: AiSalesSuppressionService,
  ) {}

  async listForProspect(prospectId: string) {
    await this.assertProspect(prospectId);
    return this.prisma.aiSalesPublicContact.findMany({
      where: { prospectId },
      orderBy: [{ isPrimary: 'desc' }, { isSelectedForOutreach: 'desc' }, { confidence: 'desc' }],
    });
  }

  async createForProspect(
    prospectId: string,
    data: {
      type: AiSalesContactType | 'EMAIL' | 'PHONE' | 'CONTACT_FORM' | 'OTHER';
      value: string;
      label?: string;
      contactPersonName?: string;
      contactPersonRole?: string;
      sourceUrl?: string;
      isPrimary?: boolean;
      isSelectedForOutreach?: boolean;
    },
    userId?: string,
  ) {
    const prospect = await this.assertProspect(prospectId);
    if (prospect.doNotContact) throw new ForbiddenException('Kontakt je v DO_NOT_CONTACT.');

    const contactType = data.type as AiSalesContactType;
    const normalized = this.normalizeValue(contactType, data.value);
    if (contactType === AiSalesContactType.EMAIL && !EMAIL_RE.test(normalized)) {
      throw new BadRequestException('Neplatný e-mail.');
    }

    if (contactType === AiSalesContactType.EMAIL) {
      const sup = await this.suppression.isSuppressed(normalized);
      if (sup.suppressed) throw new ForbiddenException(`E-mail je v seznamu zákazu: ${sup.reason}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.aiSalesPublicContact.findFirst({
        where: { prospectId, type: contactType, normalizedValue: normalized },
      });
      if (existing) {
        return tx.aiSalesPublicContact.update({
          where: { id: existing.id },
          data: {
            label: data.label ?? existing.label,
            contactPersonName: data.contactPersonName ?? existing.contactPersonName,
            contactPersonRole: data.contactPersonRole ?? existing.contactPersonRole,
            sourceUrl: data.sourceUrl ?? existing.sourceUrl,
            isSelectedForOutreach: data.isSelectedForOutreach ?? existing.isSelectedForOutreach,
            isPrimary: data.isPrimary ?? existing.isPrimary,
          },
        });
      }

      if (data.isPrimary) {
        await tx.aiSalesPublicContact.updateMany({
          where: { prospectId, type: contactType },
          data: { isPrimary: false },
        });
      }

      const row = await tx.aiSalesPublicContact.create({
        data: {
          prospectId,
          type: contactType,
          value: data.value,
          normalizedValue: normalized,
          label: data.label,
          contactPersonName: data.contactPersonName,
          contactPersonRole: data.contactPersonRole,
          sourceUrl: data.sourceUrl,
          verificationStatus: AiSalesContactVerificationStatus.MANUALLY_VERIFIED,
          isPrimary: data.isPrimary ?? false,
          isSelectedForOutreach: data.isSelectedForOutreach ?? false,
          verifiedById: userId,
          verifiedAt: userId ? new Date() : undefined,
        },
      });

      await this.syncProspectPrimaryFields(tx, prospectId);
      return row;
    });
  }

  async updateContact(
    prospectId: string,
    contactId: string,
    patch: {
      value?: string;
      label?: string | null;
      contactPersonName?: string | null;
      contactPersonRole?: string | null;
      sourceUrl?: string | null;
      isSelectedForOutreach?: boolean;
    },
  ) {
    await this.assertProspect(prospectId);
    const contact = await this.prisma.aiSalesPublicContact.findFirst({
      where: { id: contactId, prospectId },
    });
    if (!contact) throw new NotFoundException('Kontakt nenalezen.');

    const normalized =
      patch.value !== undefined ? this.normalizeValue(contact.type, patch.value) : contact.normalizedValue;

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.aiSalesPublicContact.update({
        where: { id: contactId },
        data: {
          ...(patch.value !== undefined ? { value: patch.value, normalizedValue: normalized } : {}),
          ...(patch.label !== undefined ? { label: patch.label } : {}),
          ...(patch.contactPersonName !== undefined ? { contactPersonName: patch.contactPersonName } : {}),
          ...(patch.contactPersonRole !== undefined ? { contactPersonRole: patch.contactPersonRole } : {}),
          ...(patch.sourceUrl !== undefined ? { sourceUrl: patch.sourceUrl } : {}),
          ...(patch.isSelectedForOutreach !== undefined
            ? { isSelectedForOutreach: patch.isSelectedForOutreach }
            : {}),
        },
      });
      await this.syncProspectPrimaryFields(tx, prospectId);
      return row;
    });
  }

  async deleteContact(prospectId: string, contactId: string) {
    await this.assertProspect(prospectId);
    const contact = await this.prisma.aiSalesPublicContact.findFirst({
      where: { id: contactId, prospectId },
    });
    if (!contact) throw new NotFoundException('Kontakt nenalezen.');

    return this.prisma.$transaction(async (tx) => {
      await tx.aiSalesPublicContact.delete({ where: { id: contactId } });
      await this.syncProspectPrimaryFields(tx, prospectId);
      return { success: true };
    });
  }

  async setPrimary(prospectId: string, contactId: string, userId?: string) {
    await this.assertProspect(prospectId);
    const contact = await this.prisma.aiSalesPublicContact.findFirst({
      where: { id: contactId, prospectId },
    });
    if (!contact) throw new NotFoundException('Kontakt nenalezen.');

    return this.prisma.$transaction(async (tx) => {
      await tx.aiSalesPublicContact.updateMany({
        where: { prospectId, type: contact.type },
        data: { isPrimary: false },
      });
      await tx.aiSalesPublicContact.update({
        where: { id: contactId },
        data: { isPrimary: true, verifiedById: userId, verifiedAt: new Date() },
      });
      await this.syncProspectPrimaryFields(tx, prospectId);
      return tx.aiSalesPublicContact.findMany({ where: { prospectId } });
    });
  }

  async toggleOutreach(prospectId: string, contactId: string, enabled: boolean) {
    await this.assertProspect(prospectId);
    const contact = await this.prisma.aiSalesPublicContact.findFirst({
      where: { id: contactId, prospectId },
    });
    if (!contact) throw new NotFoundException('Kontakt nenalezen.');
    if (contact.type !== AiSalesContactType.EMAIL) {
      throw new BadRequestException('Pro oslovení lze vybrat pouze e-mailové kontakty.');
    }

    const prospect = await this.assertProspect(prospectId);
    if (prospect.doNotContact && enabled) {
      throw new ForbiddenException('Kontakt je v DO_NOT_CONTACT.');
    }

    if (enabled && contact.normalizedValue) {
      const sup = await this.suppression.isSuppressed(contact.normalizedValue);
      if (sup.suppressed) throw new ForbiddenException(`E-mail je v seznamu zákazu: ${sup.reason}`);
    }

    return this.prisma.aiSalesPublicContact.update({
      where: { id: contactId },
      data: { isSelectedForOutreach: enabled },
    });
  }

  async validateContactSelectionForSave(
    tx: Prisma.TransactionClient,
    searchResultId: string,
    options?: SaveSearchResultOptions & { explicitEmptySelection?: boolean },
  ): Promise<{
    contactsToTransfer: Array<Awaited<ReturnType<Prisma.TransactionClient['aiSalesPublicContact']['findMany']>>[number]>;
    outreachIds: Set<string>;
  }> {
    const explicitEmpty =
      options?.explicitEmptySelection === true ||
      (Array.isArray(options?.selectedContactIds) && options.selectedContactIds.length === 0);

    if (explicitEmpty) {
      return { contactsToTransfer: [], outreachIds: new Set() };
    }

    const enrichedContacts = await tx.aiSalesPublicContact.findMany({
      where: { searchResultId },
      orderBy: [{ isPrimary: 'desc' }, { confidence: 'desc' }],
    });

    if (!options?.selectedContactIds?.length) {
      return {
        contactsToTransfer: enrichedContacts,
        outreachIds: new Set(enrichedContacts.map((c) => c.id)),
      };
    }

    const validSet = new Set(enrichedContacts.map((c) => c.id));
    const validContactIds: string[] = [];
    const invalidContactIds: string[] = [];

    for (const id of options.selectedContactIds) {
      if (validSet.has(id)) validContactIds.push(id);
      else invalidContactIds.push(id);
    }

    if (invalidContactIds.length > 0) {
      throw new AiSalesAdminException(
        buildSalesAdminError(
          'CONTACT_RESULT_MISMATCH',
          'Některé vybrané kontakty nepatří k ukládané firmě.',
          400,
          'SAVE_PROSPECT_WITH_CONTACTS',
          undefined,
          { validContactIds, invalidContactIds, searchResultId },
        ),
      );
    }

    const contactsToTransfer = await tx.aiSalesPublicContact.findMany({
      where: {
        id: { in: validContactIds },
        searchResultId,
      },
    });

    if (contactsToTransfer.length !== validContactIds.length) {
      const found = new Set(contactsToTransfer.map((c) => c.id));
      const missing = validContactIds.filter((id) => !found.has(id));
      throw new AiSalesAdminException(
        buildSalesAdminError(
          'CONTACT_RESULT_MISMATCH',
          'Některé vybrané kontakty nepatří k ukládané firmě.',
          400,
          'SAVE_PROSPECT_WITH_CONTACTS',
          undefined,
          {
            validContactIds: [...found],
            invalidContactIds: missing,
            searchResultId,
          },
        ),
      );
    }

    return { contactsToTransfer, outreachIds: new Set(validContactIds) };
  }

  async transferSearchContactsToProspect(
    tx: Prisma.TransactionClient,
    prospectId: string,
    searchResultId: string,
    options?: SaveSearchResultOptions & { explicitEmptySelection?: boolean },
  ): Promise<{ contactsSaved: number; emailsSaved: number; phonesSaved: number }> {
    const { contactsToTransfer, outreachIds } = await this.validateContactSelectionForSave(
      tx,
      searchResultId,
      options,
    );

    if (contactsToTransfer.length === 0) {
      return { contactsSaved: 0, emailsSaved: 0, phonesSaved: 0 };
    }

    let contactsSaved = 0;
    let emailsSaved = 0;
    let phonesSaved = 0;

    for (const contact of contactsToTransfer) {
      const normalized =
        contact.normalizedValue ?? this.normalizeValue(contact.type, contact.value);
      const isSelectedForOutreach = outreachIds.has(contact.id);

      const existingOnProspect = await tx.aiSalesPublicContact.findFirst({
        where: { prospectId, type: contact.type, normalizedValue: normalized },
      });

      if (existingOnProspect) {
        await tx.aiSalesPublicContact.update({
          where: { id: existingOnProspect.id },
          data: {
            label: contact.label ?? existingOnProspect.label,
            contactPersonName: contact.contactPersonName ?? existingOnProspect.contactPersonName,
            contactPersonRole: contact.contactPersonRole ?? existingOnProspect.contactPersonRole,
            sourceUrl: contact.sourceUrl ?? existingOnProspect.sourceUrl,
            sourcePageTitle: contact.sourcePageTitle ?? existingOnProspect.sourcePageTitle,
            sourceTextSnippet: contact.sourceTextSnippet ?? existingOnProspect.sourceTextSnippet,
            confidence: Math.max(contact.confidence, existingOnProspect.confidence),
            verificationStatus: contact.verificationStatus,
            isSelectedForOutreach: isSelectedForOutreach || existingOnProspect.isSelectedForOutreach,
            searchResultId: contact.searchResultId ?? existingOnProspect.searchResultId,
          },
        });
        if (contact.id !== existingOnProspect.id) {
          await tx.aiSalesPublicContact.delete({ where: { id: contact.id } }).catch(() => undefined);
        }
      } else {
        await tx.aiSalesPublicContact.update({
          where: { id: contact.id },
          data: {
            prospectId,
            isSelectedForOutreach,
          },
        });
        contactsSaved += 1;
        if (contact.type === AiSalesContactType.EMAIL) emailsSaved += 1;
        if (contact.type === AiSalesContactType.PHONE) phonesSaved += 1;
      }
    }

    if (options?.primaryEmailContactId) {
      const primaryValid = contactsToTransfer.some((c) => c.id === options.primaryEmailContactId);
      if (!primaryValid) {
        throw new AiSalesAdminException(
          buildSalesAdminError(
            'CONTACT_RESULT_MISMATCH',
            'Primární e-mail nepatří k vybraným kontaktům této firmy.',
            400,
            'SAVE_PROSPECT_WITH_CONTACTS',
            undefined,
            { searchResultId },
          ),
        );
      }
      await tx.aiSalesPublicContact.updateMany({
        where: { prospectId, type: AiSalesContactType.EMAIL },
        data: { isPrimary: false },
      });
      await tx.aiSalesPublicContact.updateMany({
        where: { id: options.primaryEmailContactId, prospectId },
        data: { isPrimary: true },
      });
    }

    if (options?.primaryPhoneContactId) {
      const primaryValid = contactsToTransfer.some((c) => c.id === options.primaryPhoneContactId);
      if (!primaryValid) {
        throw new AiSalesAdminException(
          buildSalesAdminError(
            'CONTACT_RESULT_MISMATCH',
            'Primární telefon nepatří k vybraným kontaktům této firmy.',
            400,
            'SAVE_PROSPECT_WITH_CONTACTS',
            undefined,
            { searchResultId },
          ),
        );
      }
      await tx.aiSalesPublicContact.updateMany({
        where: { prospectId, type: AiSalesContactType.PHONE },
        data: { isPrimary: false },
      });
      await tx.aiSalesPublicContact.updateMany({
        where: { id: options.primaryPhoneContactId, prospectId },
        data: { isPrimary: true },
      });
    }

    await this.syncProspectPrimaryFields(tx, prospectId);
    return { contactsSaved, emailsSaved, phonesSaved };
  }

  async importSearchContactsForProspect(
    prospectId: string,
    options?: SaveSearchResultOptions & { explicitEmptySelection?: boolean },
  ) {
    const prospect = await this.assertProspect(prospectId);
    if (!prospect.sourceSearchResultId) {
      throw new BadRequestException('Partner nemá propojený výsledek vyhledávání.');
    }

    return this.prisma.$transaction(async (tx) => {
      const stats = await this.transferSearchContactsToProspect(
        tx,
        prospectId,
        prospect.sourceSearchResultId!,
        options,
      );
      const contacts = await tx.aiSalesPublicContact.findMany({
        where: { prospectId },
        orderBy: [{ isPrimary: 'desc' }, { type: 'asc' }, { createdAt: 'asc' }],
      });
      const updated = await tx.aiSalesProspect.findUnique({ where: { id: prospectId } });
      return {
        success: true,
        prospectId,
        contactsSaved: stats.contactsSaved,
        emailsSaved: stats.emailsSaved,
        phonesSaved: stats.phonesSaved,
        primaryEmail: updated?.primaryEmail ?? updated?.email ?? null,
        primaryPhone: updated?.primaryPhone ?? updated?.phone ?? null,
        contacts,
        prospect: { ...updated, publicContacts: contacts },
      };
    });
  }

  async syncProspectPrimaryFields(
    tx: Prisma.TransactionClient,
    prospectId: string,
  ): Promise<void> {
    const contacts = await tx.aiSalesPublicContact.findMany({ where: { prospectId } });
    const primaryEmail =
      contacts.find((c) => c.type === AiSalesContactType.EMAIL && c.isPrimary) ??
      contacts.find((c) => c.type === AiSalesContactType.EMAIL);
    const primaryPhone =
      contacts.find((c) => c.type === AiSalesContactType.PHONE && c.isPrimary) ??
      contacts.find((c) => c.type === AiSalesContactType.PHONE);

    await tx.aiSalesProspect.update({
      where: { id: prospectId },
      data: {
        primaryEmail: primaryEmail?.normalizedValue ?? primaryEmail?.value ?? null,
        primaryPhone: primaryPhone?.normalizedValue ?? primaryPhone?.value ?? null,
        email: primaryEmail?.normalizedValue ?? primaryEmail?.value ?? null,
        phone: primaryPhone?.normalizedValue ?? primaryPhone?.value ?? null,
      },
    });
  }

  normalizeValue(type: AiSalesContactType, value: string): string {
    const trimmed = value.trim();
    if (type === AiSalesContactType.EMAIL) return trimmed.toLowerCase();
    return trimmed.replace(/\s+/g, ' ');
  }

  private async assertProspect(prospectId: string) {
    const prospect = await this.prisma.aiSalesProspect.findUnique({ where: { id: prospectId } });
    if (!prospect) throw new NotFoundException('Partner nenalezen.');
    return prospect;
  }
}
