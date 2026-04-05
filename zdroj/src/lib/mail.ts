import { Resend } from 'resend';

/** Výchozí odesílatel (Resend sandbox). Po ověření domény nastav celý řetězec v RESEND_FROM, např. `XXrealit <noreply@tvoje-domena.cz>`. */
const DEFAULT_RESEND_FROM = 'XXrealit <onboarding@resend.dev>';

export function getResendFrom(): string {
  return process.env.RESEND_FROM?.trim() || DEFAULT_RESEND_FROM;
}

export type EmailSendResult = { success: true } | { success: false; error: string };

function stringifyForResponse(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify({ name: error.name, message: error.message, stack: error.stack });
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Jedno odeslání obnovy hesla přes Resend (Railway).
 * Při chybějícím klíči vyhodí výjimku — route ji zachytí a vrátí 200 + success: false.
 */
export async function sendPasswordResetFlowWithDebug(
  to: string,
  resetUrl: string,
): Promise<EmailSendResult> {
  if (!process.env.RESEND_API_KEY?.trim()) {
    throw new Error('Missing RESEND_API_KEY');
  }

  console.log('SENDING TO:', to);
  console.log('API KEY:', 'OK');

  if (!to || !String(to).trim()) {
    return { success: false, error: JSON.stringify({ message: 'Missing email' }) };
  }

  const resend = new Resend(process.env.RESEND_API_KEY.trim());
  const from = getResendFrom();
  console.log('RESEND_FROM:', from);

  const html = `<h2>Obnova hesla</h2><p>Klikni na odkaz:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`;

  try {
    const response = await resend.emails.send({
      from,
      to: to.trim(),
      subject: 'Obnova hesla',
      html,
    });

    console.log('RESEND RESPONSE:', response);

    if (response.error) {
      console.error('RESEND ERROR:', response.error);
      return { success: false, error: JSON.stringify(response.error) };
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('RESEND ERROR:', error);
    return { success: false, error: stringifyForResponse(error) };
  }
}
