import type { SrealityBrokerPrefill } from './sreality-broker-extract.util';

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t || null;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.length < 9) return null;
  if (digits.startsWith('420') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('+')) return digits;
  if (digits.length === 9) return `+420${digits}`;
  return digits.startsWith('0') ? `+420${digits.slice(1)}` : `+420${digits}`;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

const PHONE_RE =
  /(?:\+420\s?)?(?:\d{3}\s?){2}\d{3}|\+\d{10,15}|tel:[+\d]+/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export function extractSrealityBrokerFromHtml(html: string): Partial<SrealityBrokerPrefill> {
  const out: Partial<SrealityBrokerPrefill> = {};
  const sample = html.slice(0, 500_000);

  const mailto = sample.match(/mailto:([^\s"'<>]+)/i)?.[1];
  if (mailto) out.email = normalizeEmail(decodeURIComponent(mailto));

  const tel = sample.match(/href=["']tel:([^"']+)["']/i)?.[1];
  if (tel) out.phone = normalizePhone(decodeURIComponent(tel));

  if (!out.phone) {
    const phoneMatch = sample.match(PHONE_RE);
    if (phoneMatch) out.phone = normalizePhone(phoneMatch[0].replace(/^tel:/i, ''));
  }

  if (!out.email) {
    const emailMatch = sample.match(EMAIL_RE);
    if (emailMatch) out.email = normalizeEmail(emailMatch[0]);
  }

  const agentPatterns = [
    /data-e2e=["']detail-contact-name["'][^>]*>([^<]+)/i,
    /class=["'][^"']*contact[^"']*name[^"']*["'][^>]*>([^<]{2,80})</i,
    /"brokerName"\s*:\s*"([^"]+)"/i,
    /"agentName"\s*:\s*"([^"]+)"/i,
    /"contactName"\s*:\s*"([^"]+)"/i,
    /"sellerName"\s*:\s*"([^"]+)"/i,
  ];
  for (const re of agentPatterns) {
    const m = sample.match(re);
    if (m?.[1]) {
      out.agentName = cleanText(m[1]);
      break;
    }
  }

  const companyPatterns = [
    /data-e2e=["']detail-contact-company["'][^>]*>([^<]+)/i,
    /"companyName"\s*:\s*"([^"]+)"/i,
    /"premiseName"\s*:\s*"([^"]+)"/i,
    /"rkName"\s*:\s*"([^"]+)"/i,
  ];
  for (const re of companyPatterns) {
    const m = sample.match(re);
    if (m?.[1]) {
      out.companyName = cleanText(m[1]);
      break;
    }
  }

  const profileMatch = sample.match(/href=["'](https:\/\/www\.sreality\.cz\/[^"']*(?:makler|broker|premise)[^"']*)["']/i);
  if (profileMatch?.[1]) out.profileUrl = profileMatch[1];

  return out;
}

export function mergeBrokerParts(
  parts: Array<Partial<SrealityBrokerPrefill>>,
): SrealityBrokerPrefill {
  const out: SrealityBrokerPrefill = {
    agentName: null,
    companyName: null,
    phone: null,
    email: null,
    photoUrl: null,
    logoUrl: null,
    profileUrl: null,
    sourceExternalId: null,
  };
  for (const p of parts) {
    if (!out.agentName && p.agentName) out.agentName = p.agentName;
    if (!out.companyName && p.companyName) out.companyName = p.companyName;
    if (!out.phone && p.phone) out.phone = normalizePhone(p.phone) ?? p.phone;
    if (!out.email && p.email) out.email = normalizeEmail(p.email) ?? p.email;
    if (!out.photoUrl && p.photoUrl) out.photoUrl = p.photoUrl;
    if (!out.logoUrl && p.logoUrl) out.logoUrl = p.logoUrl;
    if (!out.profileUrl && p.profileUrl) out.profileUrl = p.profileUrl;
    if (!out.sourceExternalId && p.sourceExternalId) out.sourceExternalId = p.sourceExternalId;
  }
  return out;
}
