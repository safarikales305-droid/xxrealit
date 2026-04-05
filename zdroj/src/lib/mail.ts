import { Resend } from 'resend';

/** Resend testovací odesílatel (bez vlastní domény). Po ověření domény nastav RESEND_FROM. */
const DEFAULT_RESEND_FROM = 'onboarding@resend.dev';

export function getResendFrom(): string {
  return process.env.RESEND_FROM?.trim() || DEFAULT_RESEND_FROM;
}

type SendLabel = 'test' | 'reset';

async function resendSendWithDebug(
  resend: Resend,
  label: SendLabel,
  payload: { from: string; to: string; subject: string; html: string },
): Promise<void> {
  let response: Awaited<ReturnType<Resend['emails']['send']>>;
  try {
    response = await resend.emails.send(payload);
  } catch (error) {
    console.error('EMAIL ERROR FULL (network/exception):', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  }

  console.log(`EMAIL SUCCESS (${label}):`, JSON.stringify(response));
  if (response.error) {
    console.error('EMAIL ERROR FULL (API):', JSON.stringify(response.error, null, 2));
    const e = response.error;
    throw new Error(`${e.message} [${e.name}] status:${String(e.statusCode ?? 'n/a')}`);
  }
}

/**
 * Odešle test + obnovu hesla přes Resend s podrobným logováním (Railway).
 * Vyhodí výjimku při chybě — route má vrátit 500 s `detail`.
 */
export async function sendPasswordResetFlowWithDebug(
  to: string,
  resetUrl: string,
  options: { skipTest?: boolean },
): Promise<void> {
  console.log('EMAIL:', to);
  console.log('API KEY:', process.env.RESEND_API_KEY ? 'OK' : 'MISSING');

  if (!to || !String(to).trim()) {
    throw new Error('Missing email');
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error('Missing RESEND_API_KEY (send)');
    throw new Error('Missing RESEND_API_KEY');
  }

  const resend = new Resend(apiKey);
  const from = getResendFrom();
  console.log('RESEND_FROM:', from);

  const skipTest = options.skipTest === true;

  if (!skipTest) {
    await resendSendWithDebug(resend, 'test', {
      from,
      to: to.trim(),
      subject: 'Test email',
      html: '<p>Test funguje</p>',
    });
  }

  const resetHtml = `<p>Dobrý den,</p><p>Pro nastavení nového hesla použijte odkaz:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Platnost odkazu je omezená.</p><p>XXrealit</p>`;

  await resendSendWithDebug(resend, 'reset', {
    from,
    to: to.trim(),
    subject: 'Obnova hesla',
    html: resetHtml,
  });

  console.log('EMAIL OK (all sends finished)');
}
