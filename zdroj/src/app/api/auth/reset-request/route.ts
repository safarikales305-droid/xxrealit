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

function jsonErrorString(e: unknown): string {
  try {
    return JSON.stringify(e);
  } catch {
    return e instanceof Error ? e.message : String(e);
  }
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
      return NextResponse.json(
        { success: false, error: JSON.stringify({ message: 'Missing email' }) },
        { status: 200 },
      );
    }

    logEnvCheck();

    console.log('EMAIL (request):', email);

    const user = await prisma.user.findUnique({ where: { email } });

    const genericOk = NextResponse.json({
      success: true,
      message: 'Pokud účet existuje, odeslali jsme instrukce na e-mail.',
    });

    if (!user) {
      return genericOk;
    }

    if (!user.email || !user.email.trim()) {
      console.error('Missing email (user record)');
      return NextResponse.json(
        { success: false, error: JSON.stringify({ message: 'Missing email on user' }) },
        { status: 200 },
      );
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

    console.log('RESET LINK:', resetUrl);
    console.log('SENDING TO:', user.email);

    const emailResult = await sendPasswordResetFlowWithDebug(user.email, resetUrl);

    if (!emailResult.success) {
      console.error('FULL EMAIL ERROR (flow):', emailResult.error);
      return NextResponse.json(
        {
          success: false,
          error: emailResult.error,
          message:
            'Účet je připraven, ale e-mail se nepodařilo odeslat. Odkaz na obnovu je v logu serveru (RESET LINK).',
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Pokud účet existuje, odeslali jsme instrukce na e-mail.',
    });
  } catch (e: unknown) {
    console.error('[reset-request]', e);
    const errStr = jsonErrorString(e);
    console.error('FULL EMAIL ERROR (route):', e);
    return NextResponse.json(
      {
        success: false,
        error: errStr,
        message: 'Požadavek se nepodařilo dokončit.',
      },
      { status: 200 },
    );
  }
}
