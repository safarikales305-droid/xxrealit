import type { NestMeProfile } from '@/lib/nest-client';

export type ListingContactPrefill = {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  region: string;
  district: string;
};

function displayName(profile: NestMeProfile): string {
  const fromParts = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
  if (fromParts) return fromParts;
  if (profile.name?.trim()) return profile.name.trim();
  const agent = profile.agentProfile;
  if (agent?.fullName?.trim()) return agent.fullName.trim();
  const company = profile.companyProfile;
  if (company?.contactFullName?.trim()) return company.contactFullName.trim();
  const agency = profile.agencyProfile;
  if (agency?.contactFullName?.trim()) return agency.contactFullName.trim();
  return '';
}

function displayPhone(profile: NestMeProfile): string {
  const broker = profile.brokerPhonePublic?.trim();
  if (broker) return broker;
  const agent = profile.agentProfile?.phone?.trim();
  if (agent) return agent;
  const company = profile.companyProfile?.phone?.trim();
  if (company) return company;
  const agency = profile.agencyProfile?.phone?.trim();
  if (agency) return agency;
  return profile.phone?.trim() ?? '';
}

function displayEmail(profile: NestMeProfile): string {
  const broker = profile.brokerEmailPublic?.trim();
  if (broker) return broker;
  const company = profile.companyProfile?.email?.trim();
  if (company) return company;
  const agency = profile.agencyProfile?.email?.trim();
  if (agency) return agency;
  return profile.email?.trim() ?? '';
}

function displayRegion(profile: NestMeProfile): string {
  if (profile.brokerRegionLabel?.trim()) return profile.brokerRegionLabel.trim();
  const regions = profile.brokerPreferredRegions?.filter(Boolean) ?? [];
  if (regions[0]) return regions[0];
  return '';
}

function displayDistrict(profile: NestMeProfile): string {
  return (
    profile.agentProfile?.city?.trim() ||
    profile.companyProfile?.city?.trim() ||
    profile.agencyProfile?.city?.trim() ||
    profile.city?.trim() ||
    ''
  );
}

export function buildListingContactPrefill(profile: NestMeProfile | null | undefined): ListingContactPrefill {
  if (!profile) {
    return { contactName: '', contactPhone: '', contactEmail: '', region: '', district: '' };
  }
  return {
    contactName: displayName(profile),
    contactPhone: displayPhone(profile),
    contactEmail: displayEmail(profile),
    region: displayRegion(profile),
    district: displayDistrict(profile),
  };
}
