import { Injectable } from '@nestjs/common';
import { AiSalesContactVerificationStatus } from '@prisma/client';

export type ContactPick = {
  email: string | null;
  phone: string | null;
  verificationStatus: AiSalesContactVerificationStatus;
};

@Injectable()
export class ContactVerificationService {
  resolveVerificationStatus(input: {
    hasWebsite: boolean;
    websiteReachable: boolean;
    blocked: boolean;
    emailCount: number;
    phoneCount: number;
    hasCompanyName: boolean;
  }): AiSalesContactVerificationStatus {
    if (input.blocked) return AiSalesContactVerificationStatus.BLOCKED_BY_WEBSITE;
    if (input.hasWebsite && !input.websiteReachable) {
      return AiSalesContactVerificationStatus.WEBSITE_UNAVAILABLE;
    }
    if (input.emailCount > 0 || input.phoneCount > 0) {
      if (input.hasCompanyName && input.hasWebsite) {
        return AiSalesContactVerificationStatus.VERIFIED;
      }
      return AiSalesContactVerificationStatus.CONTACT_FOUND;
    }
    if (input.hasWebsite && input.websiteReachable && input.hasCompanyName) {
      return AiSalesContactVerificationStatus.PARTIALLY_VERIFIED;
    }
    if (input.hasWebsite) {
      return AiSalesContactVerificationStatus.NO_PUBLIC_CONTACT;
    }
    return AiSalesContactVerificationStatus.NOT_CHECKED;
  }

  pickPrimaryContacts<T extends { type: string; normalizedValue: string | null; value: string; confidence: number }>(
    contacts: T[],
  ): { email: string | null; phone: string | null } {
    const emails = contacts
      .filter((c) => c.type === 'EMAIL')
      .sort((a, b) => b.confidence - a.confidence);
    const phones = contacts
      .filter((c) => c.type === 'PHONE')
      .sort((a, b) => b.confidence - a.confidence);
    return {
      email: emails[0]?.normalizedValue ?? emails[0]?.value ?? null,
      phone: phones[0]?.normalizedValue ?? phones[0]?.value ?? null,
    };
  }
}
