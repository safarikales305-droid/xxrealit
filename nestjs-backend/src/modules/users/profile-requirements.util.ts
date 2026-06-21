import { UserRole } from '@prisma/client';
import { isPropertySeeker } from '../../common/property-seeker.util';

export type ProfileRequirementsInput = {
  role: UserRole | string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  whatsappVerified?: boolean;
  city?: string | null;
  address?: string | null;
  postalCode?: string | null;
  profileIco?: string | null;
  isTipar?: boolean;
  tiparPayoutBankAccount?: string | null;
  professionalVerified?: boolean;
  professionalVerificationStatus?: string | null;
  brokerOfficeName?: string | null;
  agentProfile?: { fullName?: string; companyName?: string; ico?: string; city?: string } | null;
  companyProfile?: { companyName?: string; ico?: string; city?: string; contactFullName?: string } | null;
  agencyProfile?: { agencyName?: string; ico?: string; city?: string; contactFullName?: string } | null;
  financialAdvisorProfile?: { fullName?: string; ico?: string; city?: string } | null;
  investorProfile?: { fullName?: string; city?: string } | null;
};

export type ProfileRequirementChecklistItem = {
  id: string;
  label: string;
  missingLabel: string;
  satisfied: boolean;
};

function str(v: string | null | undefined): string {
  return (v ?? '').trim();
}

export function resolveProfileName(input: ProfileRequirementsInput): string {
  if (str(input.name)) return str(input.name);
  const combined = `${str(input.firstName)} ${str(input.lastName)}`.trim();
  if (combined) return combined;
  if (str(input.agentProfile?.fullName)) return str(input.agentProfile?.fullName);
  if (str(input.companyProfile?.contactFullName)) return str(input.companyProfile?.contactFullName);
  if (str(input.agencyProfile?.contactFullName)) return str(input.agencyProfile?.contactFullName);
  if (str(input.financialAdvisorProfile?.fullName)) return str(input.financialAdvisorProfile?.fullName);
  if (str(input.investorProfile?.fullName)) return str(input.investorProfile?.fullName);
  return '';
}

export function resolveProfileAddress(input: ProfileRequirementsInput): string {
  if (str(input.address)) return str(input.address);
  return (
    str(input.city) ||
    str(input.agentProfile?.city) ||
    str(input.companyProfile?.city) ||
    str(input.agencyProfile?.city) ||
    str(input.financialAdvisorProfile?.city) ||
    str(input.investorProfile?.city)
  );
}

export function resolveProfileCity(input: ProfileRequirementsInput): string {
  return (
    str(input.city) ||
    str(input.agentProfile?.city) ||
    str(input.companyProfile?.city) ||
    str(input.agencyProfile?.city) ||
    str(input.financialAdvisorProfile?.city) ||
    str(input.investorProfile?.city)
  );
}

export function resolveProfileIco(input: ProfileRequirementsInput): string {
  if (str(input.profileIco)) return str(input.profileIco);
  const role = String(input.role ?? '').toUpperCase();
  if (role === UserRole.COMPANY) return str(input.companyProfile?.ico);
  if (role === UserRole.AGENCY) return str(input.agencyProfile?.ico);
  if (role === UserRole.AGENT) return str(input.agentProfile?.ico);
  if (role === UserRole.FINANCIAL_ADVISOR) return str(input.financialAdvisorProfile?.ico);
  return '';
}

export function resolveCompanyName(input: ProfileRequirementsInput): string {
  const role = String(input.role ?? '').toUpperCase();
  if (role === UserRole.COMPANY) {
    return str(input.companyProfile?.companyName) || str(input.brokerOfficeName);
  }
  if (role === UserRole.AGENCY) {
    return str(input.agencyProfile?.agencyName) || str(input.brokerOfficeName);
  }
  if (role === UserRole.AGENT) {
    return str(input.agentProfile?.companyName) || str(input.brokerOfficeName);
  }
  return '';
}

const PROFESSIONAL_ROLES = new Set<string>([
  UserRole.AGENT,
  UserRole.COMPANY,
  UserRole.AGENCY,
  UserRole.CRAFTSMAN,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
]);

const ICO_ROLES = new Set<string>([
  UserRole.AGENT,
  UserRole.COMPANY,
  UserRole.AGENCY,
  UserRole.FINANCIAL_ADVISOR,
]);

function checklistItem(
  id: string,
  label: string,
  missingLabel: string,
  satisfied: boolean,
): ProfileRequirementChecklistItem {
  return { id, label, missingLabel, satisfied };
}

export function buildProfileRequirementsChecklist(
  input: ProfileRequirementsInput,
): ProfileRequirementChecklistItem[] {
  const role = String(input.role ?? '').toUpperCase();
  const items: ProfileRequirementChecklistItem[] = [];

  items.push(
    checklistItem(
      'whatsapp',
      'WhatsApp číslo ověřeno',
      'WhatsApp číslo není ověřeno',
      input.whatsappVerified === true,
    ),
    checklistItem(
      'name',
      'Jméno vyplněno',
      'Chybí jméno',
      Boolean(resolveProfileName(input)),
    ),
    checklistItem(
      'email',
      'E-mail ověřen',
      'E-mail není ověřen',
      input.emailVerified === true,
    ),
  );

  const needsAddress = PROFESSIONAL_ROLES.has(role) || input.isTipar === true;
  if (needsAddress) {
    items.push(
      checklistItem(
        'address',
        'Adresa / město vyplněno',
        'Chybí adresa / město',
        Boolean(resolveProfileAddress(input)),
      ),
    );
  }

  if (ICO_ROLES.has(role)) {
    items.push(
      checklistItem('ico', 'IČO vyplněno', 'Chybí IČO', Boolean(resolveProfileIco(input))),
    );
  }

  if (role === UserRole.COMPANY || role === UserRole.AGENCY) {
    items.push(
      checklistItem(
        'company',
        'Název firmy vyplněn',
        'Chybí název firmy',
        Boolean(resolveCompanyName(input)),
      ),
    );
  }

  if (input.isTipar === true) {
    items.push(
      checklistItem(
        'bank',
        'Bankovní účet pro tipaře',
        'Chybí bankovní účet pro výplatu provizí',
        Boolean(str(input.tiparPayoutBankAccount)),
      ),
    );
  }

  if (PROFESSIONAL_ROLES.has(role)) {
    items.push(
      checklistItem(
        'admin',
        'Schváleno administrátorem',
        'Požádejte o ověření a počkejte na schválení administrátorem',
        input.professionalVerificationStatus === 'APPROVED' &&
          input.professionalVerified === true,
      ),
    );
  }

  return items;
}

function unsatisfiedLabels(
  checklist: ProfileRequirementChecklistItem[],
  ids: string[],
): string[] {
  return checklist
    .filter((item) => ids.includes(item.id) && !item.satisfied)
    .map((item) => item.missingLabel);
}

export function collectProfessionalRequirementIssues(input: ProfileRequirementsInput): string[] {
  const role = String(input.role ?? '').toUpperCase();
  if (!PROFESSIONAL_ROLES.has(role)) return [];

  const checklist = buildProfileRequirementsChecklist(input);
  const ids = ['name', 'email', 'whatsapp', 'address', 'ico', 'company', 'admin'];
  return unsatisfiedLabels(checklist, ids);
}

export function collectTiparRequirementIssues(input: ProfileRequirementsInput): string[] {
  const checklist = buildProfileRequirementsChecklist({ ...input, isTipar: true });
  return unsatisfiedLabels(checklist, ['name', 'email', 'whatsapp', 'address', 'bank']);
}

export function collectCreditRequirementIssues(input: ProfileRequirementsInput): string[] {
  const checklist = buildProfileRequirementsChecklist(input);
  return unsatisfiedLabels(checklist, ['whatsapp', 'email', 'name']);
}

export function canUseTiparFeatures(input: ProfileRequirementsInput): boolean {
  if (isPropertySeeker(input.role)) return false;
  return input.isTipar === true && collectTiparRequirementIssues(input).length === 0;
}

export function canTopUpCredits(input: ProfileRequirementsInput): boolean {
  if (isPropertySeeker(input.role)) return false;
  return collectCreditRequirementIssues(input).length === 0;
}

export function showVerifiedProfessionalBadge(input: ProfileRequirementsInput): boolean {
  if (input.professionalVerificationStatus !== 'APPROVED' || !input.professionalVerified) {
    return false;
  }
  return collectProfessionalRequirementIssues(input).filter(
    (x) => !x.includes('administrátorem'),
  ).length === 0;
}

export function showVerifiedTiparBadge(input: ProfileRequirementsInput): boolean {
  return input.isTipar === true && collectTiparRequirementIssues(input).length === 0;
}
