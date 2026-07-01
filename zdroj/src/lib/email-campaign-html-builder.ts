/** Kopie backend builderu pro náhled v administraci. */
export type EmailCampaignCtaButton = {
  label: string;
  url: string;
};

export type EmailCampaignBenefitItem = {
  title: string;
  text: string;
};

export type EmailCampaignEditorBlocks = {
  logoUrl?: string;
  bannerUrl?: string;
  headline: string;
  bodyHtml: string;
  creditAmount?: string;
  creditLabel?: string;
  ctas: EmailCampaignCtaButton[];
  benefits?: EmailCampaignBenefitItem[];
  footerContact?: string;
  showUnsubscribe?: boolean;
};

export const DEFAULT_LOGO_URL = 'https://xxrealit.cz/logo-xxrealit.png';

export const CAMPAIGN_VARIABLE_HINTS = [
  '{{firstName}}',
  '{{lastName}}',
  '{{email}}',
  '{{phone}}',
  '{{senderName}}',
  '{{registrationLink}}',
  '{{creditAmount}}',
  '{{portalName}}',
];

export function buildXxrealitCampaignHtml(blocks: EmailCampaignEditorBlocks): string {
  const logo = blocks.logoUrl?.trim() || DEFAULT_LOGO_URL;
  const banner = blocks.bannerUrl?.trim();
  const headline = blocks.headline.trim() || 'Zpráva z XXrealit';
  const body = blocks.bodyHtml.trim() || '<p>Dobrý den {{firstName}},</p>';
  const credit = blocks.creditAmount?.trim();
  const creditLabel = blocks.creditLabel?.trim() || 'Bonusový kredit na propagaci';
  const footerContact =
    blocks.footerContact?.trim() ||
    'XXrealit · info@xxrealit.cz · <a href="https://xxrealit.cz" style="color:#e85d00;text-decoration:none">xxrealit.cz</a>';
  const showUnsubscribe = blocks.showUnsubscribe !== false;

  const bannerBlock = banner
    ? `<tr><td style="padding:0"><img src="${escapeAttr(banner)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0" /></td></tr>`
    : '';

  const creditBlock = credit
    ? `<tr><td style="padding:0 24px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px">
          <tr><td style="padding:16px 20px;text-align:center">
            <div style="font-size:12px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:0.05em">${escapeHtml(creditLabel)}</div>
            <div style="font-size:28px;font-weight:800;color:#e85d00;margin-top:4px">${escapeHtml(credit)}</div>
          </td></tr>
        </table>
      </td></tr>`
    : '';

  const ctaButtons = (blocks.ctas ?? []).filter((c) => c.label.trim() && c.url.trim());
  const ctaBlock =
    ctaButtons.length > 0
      ? `<tr><td style="padding:8px 24px 20px;text-align:center">${ctaButtons
          .map(
            (c) =>
              `<a href="${escapeAttr(c.url)}" style="display:inline-block;background:#e85d00;color:#ffffff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:700;font-size:16px;margin:6px 4px">${escapeHtml(c.label)}</a>`,
          )
          .join('')}</td></tr>`
      : '';

  const benefits = blocks.benefits?.filter((b) => b.title.trim() || b.text.trim()) ?? [];
  const benefitsBlock =
    benefits.length > 0
      ? `<tr><td style="padding:0 24px 20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${benefits
            .map(
              (b) =>
                `<tr><td style="padding:10px 0;border-top:1px solid #f3f4f6">
              <div style="font-weight:700;color:#111827;font-size:15px">${escapeHtml(b.title)}</div>
              <div style="color:#4b5563;font-size:14px;margin-top:4px;line-height:1.5">${escapeHtml(b.text)}</div>
            </td></tr>`,
            )
            .join('')}
        </table>
      </td></tr>`
      : '';

  const unsubscribeBlock = showUnsubscribe
    ? `<p style="margin:8px 0 0"><a href="{{unsubscribeLink}}" style="color:#9ca3af;text-decoration:underline">Odhlásit odběr</a></p>`
    : '';

  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
<tr><td style="padding:20px 24px;text-align:center;border-bottom:1px solid #f3f4f6">
  <img src="${escapeAttr(logo)}" alt="XXrealit" height="40" style="display:inline-block;height:40px;width:auto;border:0" />
</td></tr>
${bannerBlock}
<tr><td style="padding:24px 24px 12px">
  <h1 style="margin:0;font-size:24px;line-height:1.3;color:#111827;font-weight:800">${escapeHtml(headline)}</h1>
</td></tr>
<tr><td style="padding:0 24px 16px;font-size:16px;line-height:1.6;color:#374151">${body}</td></tr>
${creditBlock}
${ctaBlock}
${benefitsBlock}
<tr><td style="padding:20px 24px;background:#fafafa;border-top:1px solid #f3f4f6;font-size:12px;line-height:1.6;color:#6b7280;text-align:center">
  ${footerContact}
  ${unsubscribeBlock}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildXxrealitCampaignText(blocks: EmailCampaignEditorBlocks): string {
  const lines: string[] = [];
  lines.push(blocks.headline.trim());
  lines.push('');
  const plainBody = blocks.bodyHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
  if (plainBody) lines.push(plainBody);
  if (blocks.creditAmount?.trim()) {
    lines.push('');
    lines.push(`${blocks.creditLabel?.trim() || 'Bonus'}: ${blocks.creditAmount.trim()}`);
  }
  for (const cta of blocks.ctas ?? []) {
    if (cta.label.trim() && cta.url.trim()) {
      lines.push('');
      lines.push(`${cta.label.trim()}: ${cta.url.trim()}`);
    }
  }
  lines.push('');
  lines.push('— XXrealit');
  lines.push('{{unsubscribeLink}}');
  return lines.join('\n');
}

export function defaultEditorBlocks(partial?: Partial<EmailCampaignEditorBlocks>): EmailCampaignEditorBlocks {
  return {
    headline: partial?.headline ?? '',
    bodyHtml: partial?.bodyHtml ?? '<p>Dobrý den {{firstName}},</p>',
    logoUrl: partial?.logoUrl ?? DEFAULT_LOGO_URL,
    bannerUrl: partial?.bannerUrl ?? '',
    creditAmount: partial?.creditAmount ?? '',
    creditLabel: partial?.creditLabel ?? 'Bonusový kredit na propagaci',
    ctas: partial?.ctas ?? [{ label: 'Zaregistrovat se', url: '{{registrationLink}}' }],
    benefits: partial?.benefits ?? [],
    footerContact: partial?.footerContact,
    showUnsubscribe: partial?.showUnsubscribe ?? true,
  };
}

export function compileStepFromBlocks(
  blocks: EmailCampaignEditorBlocks,
  subject: string,
): { subject: string; htmlContent: string; textContent: string } {
  return {
    subject,
    htmlContent: buildXxrealitCampaignHtml(blocks),
    textContent: buildXxrealitCampaignText(blocks),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
