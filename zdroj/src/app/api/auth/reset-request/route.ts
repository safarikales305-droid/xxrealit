import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppOrigin } from '@/lib/app-url';
import { sendPasswordResetFlowWithDebug } from '@/lib/mail';
import { prisma } from '@/lib/db';
import { generateResetPlainToken, hashResetToken } from '@/lib/reset-token';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z
    .string()
    .min(1)
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().email()),
});

const RESET_TTL_MS = 60 * 60 * 1000; // 1 h

function logEnvCheck() {
  console.log('ENV CHECK:');
  console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? 'OK' : 'MISSING');
  console.log('APP_URL:', process.env.NEXT_PUBLIC_APP_URL);
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'OK' : 'MISSING');
  console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'OK' : 'MISSING');
}

function emailFailedResponse(error: unknown) {
  console.error('EMAIL ERROR FULL:', error);
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
  return NextResponse.json({ error: 'Email failed', detail }, { status: 500 });
}

export async function POST(req: Request) {
  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'Neplatné JSON tělo' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Neplatný e-mail' }, { status: 400 });
    }

    const email = parsed.data.email;
    if (!email) {
      console.error('Missing email (post-parse)');
      throw new Error('Missing email');
    }

    logEnvCheck();

    console.log('EMAIL (request):', email);

    const user = await prisma.user.findUnique({ where: { email } });

    const generic = NextResponse.json({
      success: true,
      message: 'Pokud účet existuje, odeslali jsme instrukce na e-mail.',
    });

    if (!user) {
      return generic;
    }

    if (!user.email || !user.email.trim()) {
      console.error('Missing email (user record)');
      throw new Error('Missing email');
    }

    const plainToken = generateResetPlainToken();
    const tokenHash = hashResetToken(plainToken);
    const resetExpires = new Date(Date.now() + RESET_TTL_MS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: tokenHash,
        resetExpires,
      },
    });

    const resetUrl = `${getAppOrigin()}/reset-hesla?token=${encodeURIComponent(plainToken)}`;

    try {
      const skipTest =
        process.env.RESEND_SKIP_TEST === '1' || process.env.RESEND_SKIP_TEST === 'true';
      await sendPasswordResetFlowWithDebug(user.email, resetUrl, { skipTest });
    } catch (error) {
      return emailFailedResponse(error);
    }

    return generic;
  } catch (e) {
    console.error('[reset-request]', e);
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: 'Nepodařilo se odeslat požadavek', detail },
      { status: 500 },
    );
  }
}
