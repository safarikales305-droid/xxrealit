import nodemailer from 'nodemailer';

function createTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number.parseInt(process.env.SMTP_PORT ?? '587', 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<{ sent: boolean; logged?: string }> {
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || 'noreply@localhost';
  const subject = 'Obnovení hesla — XXrealit';
  const text = `Dobrý den,\n\nPro nastavení nového hesla otevřete odkaz:\n${resetUrl}\n\nPlatnost odkazu je omezená.\n\nXXrealit`;
  const html = `<p>Dobrý den,</p><p>Pro nastavení nového hesla použijte odkaz:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Platnost odkazu je omezená.</p><p>XXrealit</p>`;

  const transport = createTransport();
  if (!transport) {
    const msg = `[mail] SMTP není nastaveno — reset odkaz pro ${to}: ${resetUrl}`;
    console.warn(msg);
    return { sent: false, logged: resetUrl };
  }

  await transport.sendMail({ from, to, subject, text, html });
  return { sent: true };
}
