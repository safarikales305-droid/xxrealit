import { Injectable } from '@nestjs/common';
import type { OutreachAiOutput } from './ai-sales-outreach.types';
import { buildPlainTextFromParts } from './ai-sales-outreach.types';

const BRAND_ORANGE = '#ea580c';
const BRAND_DARK = '#1f2937';

@Injectable()
export class AiSalesMessageTemplateService {
  renderHtml(
    output: OutreachAiOutput,
    options?: { preview?: boolean; footerContactEmail?: string },
  ): string {
    const footerEmail = options?.footerContactEmail ?? 'podpora@xxrealit.cz';
    const plain = buildPlainTextFromParts(output);
    const benefitsHtml = output.benefits
      .map(
        (b) => `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #f3f4f6;">
            <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:${BRAND_DARK};font-family:Arial,Helvetica,sans-serif;">${escapeHtml(b.title)}</p>
            <p style="margin:0;font-size:14px;line-height:1.5;color:#4b5563;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(b.description)}</p>
          </td>
        </tr>`,
      )
      .join('');

    const preheaderHidden = output.preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(output.preheader)}</div>`
      : '';

    return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(output.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
  ${preheaderHidden}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:${BRAND_ORANGE};padding:20px 24px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">XXREALIT</p>
              <p style="margin:4px 0 0;font-size:12px;color:#ffedd5;">Portál pro realitní profesionály</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;">
              <p style="margin:0 0 16px;font-size:16px;color:${BRAND_DARK};line-height:1.5;">${escapeHtml(output.greeting)}</p>
              <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.65;">${escapeHtml(output.intro).replace(/\n/g, '<br/>')}</p>
            </td>
          </tr>
          ${
            benefitsHtml
              ? `<tr><td style="padding:0 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-radius:12px;overflow:hidden;">${benefitsHtml}</table></td></tr>`
              : ''
          }
          <tr>
            <td style="padding:24px;text-align:center;">
              <a href="${escapeAttr(output.ctaUrl)}" style="display:inline-block;background:${BRAND_ORANGE};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:999px;">${escapeHtml(output.ctaText)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;">
              <p style="margin:0 0 12px;font-size:14px;color:#4b5563;line-height:1.6;">${escapeHtml(output.closing)}</p>
              <p style="margin:0;font-size:14px;color:${BRAND_DARK};font-weight:600;">${escapeHtml(output.signature)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;text-align:center;">
                Pokud si nepřejete dostávat další obchodní sdělení, odpovězte „NEZÁJEM“ nebo nás kontaktujte na ${escapeHtml(footerEmail)}.
              </p>
            </td>
          </tr>
        </table>
        ${options?.preview ? `<p style="margin:12px 0 0;font-size:11px;color:#9ca3af;text-align:center;">Náhled e-mailu XXREALIT</p>` : ''}
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  renderManualFallbackHtml(companyName: string): string {
    return this.renderHtml({
      subject: `Možnost spolupráce s XXREALIT — ${companyName}`,
      preheader: 'Personalizovaná nabídka spolupráce',
      greeting: 'Dobrý den,',
      intro: `připravili jsme pro vás návrh prvního oslovení. Doplňte prosím text podle dostupných informací o firmě ${companyName}.`,
      benefits: [
        {
          title: 'Firemní profil na XXREALIT',
          description: 'Prezentace vaší firmy a služeb na specializovaném portálu.',
        },
      ],
      ctaText: 'Zjistit více',
      ctaUrl: 'https://www.xxrealit.cz',
      closing: 'Rádi vám představíme možnosti spolupráce.',
      signature: 'Tým XXREALIT',
      plainText: '',
      personalizationReasons: [],
      usedKnowledgeIds: [],
      confidence: 0,
    });
  }

  renderFromMessage(
    message: {
    subject?: string | null;
    preheader?: string | null;
    greeting?: string | null;
    intro?: string | null;
    benefitsJson?: unknown;
    ctaText?: string | null;
    ctaUrl?: string | null;
    closing?: string | null;
    signature?: string | null;
    plainText?: string | null;
    content?: string;
  },
    footerContactEmail?: string,
  ): string {
    const benefits = Array.isArray(message.benefitsJson)
      ? (message.benefitsJson as Array<{ title?: string; description?: string }>)
          .filter((b) => b?.title && b?.description)
          .map((b) => ({ title: String(b.title), description: String(b.description) }))
      : [];

    const intro = message.intro ?? message.plainText ?? message.content ?? '';
    return this.renderHtml(
      {
        subject: message.subject ?? 'Návrh nabídky XXREALIT',
        preheader: message.preheader ?? '',
        greeting: message.greeting ?? 'Dobrý den,',
        intro,
        benefits,
        ctaText: message.ctaText ?? 'Zjistit více o XXREALIT',
        ctaUrl: message.ctaUrl ?? 'https://www.xxrealit.cz',
        closing: message.closing ?? 'Těšíme se na případnou spolupráci.',
        signature: message.signature ?? 'Tým XXREALIT',
        plainText: message.plainText ?? message.content ?? intro,
        personalizationReasons: [],
        usedKnowledgeIds: [],
        confidence: 0.7,
      },
      { preview: true, footerContactEmail },
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
