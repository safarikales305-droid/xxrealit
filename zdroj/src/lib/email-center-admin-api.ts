const API_BASE_URL =
  process.env.NEXT_PUBLIC_NEST_API_URL?.replace(/\/$/, '') ?? 'http://localhost:3001/api';

async function emailCenterFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/email-center${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      return { ok: false, error: body.message ?? body.error ?? `HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Síťová chyba' };
  }
}

export type EmailCenterSettings = {
  id: string;
  defaultSenderName: string;
  defaultSenderEmail: string;
  defaultReplyToEmail: string;
  salesSenderName: string;
  salesSenderEmail: string;
  salesReplyToEmail: string;
  supportEmail: string;
  footerContactEmail: string;
  billingEmail: string;
  leadEmail: string;
  registrationEmail: string;
  systemNotificationEmail: string;
  contactFormEmail: string;
  provider: string;
  active: boolean;
  updatedAt: string;
};

export type EmailSenderRow = {
  id: string;
  name: string;
  email: string;
  domain: string;
  provider: string;
  verified: boolean;
  active: boolean;
  purpose: string;
  lastTestAt: string | null;
  lastTestSuccess: boolean | null;
  usage?: string;
};

export type EmailSignatureRow = {
  id: string;
  name: string;
  type: string;
  personName: string;
  position: string;
  team: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  html: string;
  plainText: string;
  active: boolean;
};

export type EmailLogRow = {
  id: string;
  type: string;
  templateKey: string | null;
  subject: string;
  recipientEmail: string;
  senderEmail: string | null;
  senderName: string | null;
  replyToEmail: string | null;
  status: string;
  provider: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type EmailInboundRow = {
  id: string;
  fromEmail: string;
  toEmail: string;
  replyToEmail: string | null;
  subject: string;
  bodyText: string | null;
  status: string;
  aiSalesMessageId: string | null;
  classification: string | null;
  receivedAt: string;
};

export type ReplyToOption = { value: string; label: string; email: string };

export async function nestEmailCenterOverview(token: string) {
  return emailCenterFetch<{
    settings: EmailCenterSettings;
    provider: { provider: string; apiKeyConfigured: boolean };
    counts: Record<string, number>;
  }>(token, '/settings');
}

export async function nestEmailCenterUpdateSettings(
  token: string,
  body: Partial<EmailCenterSettings> & { reason?: string },
) {
  return emailCenterFetch<{ success: boolean; settings: EmailCenterSettings }>(token, '/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function nestEmailCenterSenders(token: string) {
  return emailCenterFetch<EmailSenderRow[]>(token, '/senders');
}

export async function nestEmailCenterSignatures(token: string) {
  return emailCenterFetch<EmailSignatureRow[]>(token, '/signatures');
}

export async function nestEmailCenterTemplates(token: string) {
  return emailCenterFetch<
    Array<{
      id: string;
      key: string;
      name: string;
      category: string;
      subject: string;
      htmlContent: string;
      textContent: string;
      isActive: boolean;
      variables?: string[];
    }>
  >(token, '/templates');
}

export async function nestEmailCenterLogs(token: string, limit = 200) {
  return emailCenterFetch<EmailLogRow[]>(token, `/logs?limit=${limit}`);
}

export async function nestEmailCenterInbound(token: string, limit = 100) {
  return emailCenterFetch<EmailInboundRow[]>(token, `/inbound?limit=${limit}`);
}

export async function nestEmailCenterDiagnostics(token: string) {
  return emailCenterFetch<Record<string, unknown>>(token, '/diagnostics');
}

export async function nestEmailCenterAiSales(token: string) {
  return emailCenterFetch<Record<string, unknown>>(token, '/ai-sales');
}

export async function nestEmailCenterReplyToOptions(token: string) {
  return emailCenterFetch<ReplyToOption[]>(token, '/reply-to-options');
}

export async function nestEmailCenterSendTest(
  token: string,
  body: {
    toEmail: string;
    senderType?: 'default' | 'sales';
    replyTo?: string;
    signatureId?: string;
    templateId?: string;
  },
) {
  return emailCenterFetch<Record<string, unknown>>(token, '/test', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function nestEmailCenterUpdateTemplate(
  token: string,
  id: string,
  body: Record<string, unknown>,
) {
  return emailCenterFetch(token, `/templates/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function nestEmailCenterUpdateSignature(
  token: string,
  id: string,
  body: Record<string, unknown>,
) {
  return emailCenterFetch(token, `/signatures/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
