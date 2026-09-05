export type SrealityBrokerPrefill = {
  agentName: string | null;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
  profileUrl: string | null;
  sourceExternalId: string | null;
};

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t || null;
}

function pickPhone(obj: Record<string, unknown>): string | null {
  return (
    cleanText(obj.phone) ??
    cleanText(obj.phoneNumber) ??
    cleanText(obj.tel) ??
    cleanText(obj.mobile) ??
    null
  );
}

function pickEmail(obj: Record<string, unknown>): string | null {
  return cleanText(obj.email) ?? cleanText(obj.mail) ?? null;
}

function pickName(obj: Record<string, unknown>): string | null {
  return (
    cleanText(obj.name) ??
    cleanText(obj.fullName) ??
    cleanText(obj.agentName) ??
    cleanText(obj.brokerName) ??
    null
  );
}

function normalizeImageUrl(url: string): string {
  const s = url.trim();
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('http')) return s;
  return `https://${s}`;
}

function extractFromObject(raw: Record<string, unknown>): Partial<SrealityBrokerPrefill> {
  const company =
    cleanText(raw.companyName) ??
    cleanText(raw.company) ??
    cleanText(raw.agencyName) ??
    cleanText(raw.officeName) ??
    null;

  const photo =
    typeof raw.photo === 'string'
      ? normalizeImageUrl(raw.photo)
      : typeof raw.image === 'string'
        ? normalizeImageUrl(raw.image)
        : typeof raw.photoUrl === 'string'
          ? normalizeImageUrl(raw.photoUrl)
          : null;

  const logo =
    typeof raw.logo === 'string'
      ? normalizeImageUrl(raw.logo)
      : typeof raw.logoUrl === 'string'
        ? normalizeImageUrl(raw.logoUrl)
        : null;

  const profileUrl =
    cleanText(raw.url) ??
    cleanText(raw.profileUrl) ??
    cleanText(raw.web) ??
    cleanText(raw.website) ??
    null;

  const externalId =
    cleanText(raw.id) ??
    cleanText(raw.brokerId) ??
    cleanText(raw.agentId) ??
    cleanText(raw.rkId) ??
    null;

  return {
    agentName: pickName(raw),
    companyName: company,
    phone: pickPhone(raw),
    email: pickEmail(raw),
    photoUrl: photo,
    logoUrl: logo,
    profileUrl: profileUrl?.startsWith('http') ? profileUrl : null,
    sourceExternalId: externalId,
  };
}

function mergeBroker(parts: Array<Partial<SrealityBrokerPrefill>>): SrealityBrokerPrefill {
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
    if (!out.phone && p.phone) out.phone = p.phone;
    if (!out.email && p.email) out.email = p.email;
    if (!out.photoUrl && p.photoUrl) out.photoUrl = p.photoUrl;
    if (!out.logoUrl && p.logoUrl) out.logoUrl = p.logoUrl;
    if (!out.profileUrl && p.profileUrl) out.profileUrl = p.profileUrl;
    if (!out.sourceExternalId && p.sourceExternalId) out.sourceExternalId = p.sourceExternalId;
  }
  return out;
}

/** Pokus o extrakci makléře / RK z raw API/HTML payloadu Sreality. */
export function extractSrealityBrokerFromRaw(
  rawSourceData: Record<string, unknown> | null | undefined,
): SrealityBrokerPrefill {
  if (!rawSourceData || typeof rawSourceData !== 'object') {
    return mergeBroker([]);
  }

  const parts: Array<Partial<SrealityBrokerPrefill>> = [];
  const root = rawSourceData as Record<string, unknown>;

  for (const key of ['broker', 'seller', 'contact', 'agent', 'makler', 'realtor']) {
    const v = root[key];
    if (v && typeof v === 'object') parts.push(extractFromObject(v as Record<string, unknown>));
  }

  const embedded = root._embedded;
  if (embedded && typeof embedded === 'object') {
    const emb = embedded as Record<string, unknown>;
    for (const key of ['broker', 'seller', 'company', 'agency']) {
      const v = emb[key];
      if (v && typeof v === 'object') parts.push(extractFromObject(v as Record<string, unknown>));
    }
  }

  const client = root.client;
  if (client && typeof client === 'object') {
    parts.push(extractFromObject(client as Record<string, unknown>));
  }

  const rk = root.rk;
  if (rk && typeof rk === 'object') {
    const rkObj = rk as Record<string, unknown>;
    parts.push({
      companyName: pickName(rkObj) ?? cleanText(rkObj.title),
      logoUrl:
        typeof rkObj.logo === 'string'
          ? normalizeImageUrl(rkObj.logo)
          : typeof rkObj.logoUrl === 'string'
            ? normalizeImageUrl(rkObj.logoUrl)
            : null,
      profileUrl: cleanText(rkObj.url) ?? cleanText(rkObj.web),
      sourceExternalId: cleanText(rkObj.id),
    });
  }

  if (typeof root.contact_name === 'string' || typeof root.contact_phone === 'string') {
    parts.push({
      agentName: cleanText(root.contact_name),
      phone: cleanText(root.contact_phone),
      email: cleanText(root.contact_email),
    });
  }

  return mergeBroker(parts);
}

export function hasSrealityBrokerData(broker: SrealityBrokerPrefill): boolean {
  return Boolean(
    broker.agentName ||
      broker.companyName ||
      broker.phone ||
      broker.email ||
      broker.profileUrl,
  );
}

export function formatImportedContactName(broker: SrealityBrokerPrefill): string {
  const person = broker.agentName?.trim() ?? '';
  const company = broker.companyName?.trim() ?? '';
  if (person && company) return `${person} · ${company}`.slice(0, 200);
  return (person || company || '').slice(0, 200);
}
