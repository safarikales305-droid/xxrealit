import { Resend } from 'resend';

/** Resend testovací odesílatel (bez vlastní domény). Po ověření domény nastav RESEND_FROM. */
const DEFAULT_RESEND_FROM = 'onboarding@resend.dev';

function getResendFrom(): string {
  return process.env.RESEND_FROM?.trim() || DEFAULT_RESEND_FROM;
}

/**
 * Odešle e-mail přes Resend (Railway / produkce).
 * Vyžaduje RESEND_API_KEY — kontrola je v route před voláním.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY');
  }

  const resend = new Resend(apiKey);
  const from = getResendFrom();
  const subject = 'Obnovení hesla — XXrealit';
  const html = `<p>Dobrý den,</p><p>Pro nastavení nového hesla použijte odkaz:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Platnost odkazu je omezená.</p><p>XXrealit</p>`;

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Minimální testovací e-mail (Resend / Railway) — předmět „Test email“.
 */
export async function sendResendTestEmail(to: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY');
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: getResendFrom(),
    to,
    subject: 'Test email',
    html: '<p>Test funguje</p>',
  });

  if (error) {
    throw new Error(error.message);
  }
}
