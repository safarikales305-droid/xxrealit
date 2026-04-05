import { Resend } from 'resend';

/** Resend testovací odesílatel (bez vlastní domény). Po ověření domény nastav RESEND_FROM. */
const DEFAULT_RESEND_FROM = 'onboarding@resend.dev';

export function getResendFrom(): string {
  return process.env.RESEND_FROM?.trim() || DEFAULT_RESEND_FROM;
}

type SendLabel = 'test' | 'reset';

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

async function resendSendWithDebug(
  resend: Resend,
  label: SendLabel,
  payload: { from: string; to: string; subject: string; html: string },
): Promise<EmailSendResult> {
  try {
    const response = await resend.emails.send(payload);
    console.log('RESEND RESPONSE:', response);

    if (response.error) {
      const err = response.error;
      console.error('FULL EMAIL ERROR:', err);
      return { success: false, error: JSON.stringify(err) };
    }

    console.log(`EMAIL OK (${label})`);
    return { success: true };
  } catch (error: unknown) {
    console.error('FULL EMAIL ERROR:', error);
    return { success: false, error: stringifyForResponse(error) };
  }
}

/**
 * Odešle test + obnovu hesla přes Resend. Nevyhazuje výjimky — vrací { success, error? }.
 */
export async function sendPasswordResetFlowWithDebug(
  to: string,
  resetUrl: string,
  options: { skipTest?: boolean },
): Promise<EmailSendResult> {
  console.log('SENDING TO:', to);
  console.log('API KEY:', process.env.RESEND_API_KEY ? 'OK' : 'MISSING');

  if (!to || !String(to).trim()) {
    return { success: false, error: JSON.stringify({ message: 'Missing email' }) };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error('Missing RESEND_API_KEY (send)');
    return { success: false, error: JSON.stringify({ message: 'Missing RESEND_API_KEY' }) };
  }

  const resend = new Resend(apiKey);
  const from = getResendFrom();
  console.log('RESEND_FROM:', from);

  const skipTest = options.skipTest === true;

  if (!skipTest) {
    const testResult = await resendSendWithDebug(resend, 'test', {
      from,
      to: to.trim(),
      subject: 'Test email',
      html: '<p>Test funguje</p>',
    });
    if (!testResult.success) {
      return testResult;
    }
  }

  const resetHtml = `<p>Dobrý den,</p><p>Pro nastavení nového hesla použijte odkaz:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Platnost odkazu je omezená.</p><p>XXrealit</p>`;

  const resetResult = await resendSendWithDebug(resend, 'reset', {
    from,
    to: to.trim(),
    subject: 'Obnova hesla',
    html: resetHtml,
  });

  if (!resetResult.success) {
    return resetResult;
  }

  console.log('EMAIL OK (all sends finished)');
  return { success: true };
}
