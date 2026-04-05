import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppOrigin } from '@/lib/app-url';
import { sendPasswordResetEmail } from '@/lib/mail';
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
    const user = await prisma.user.findUnique({ where: { email } });

    // Vždy stejná odpověď (bez odhalení existence účtu)
    const generic = NextResponse.json({
      success: true,
      message: 'Pokud účet existuje, odeslali jsme instrukce na e-mail.',
    });

    if (!user) {
      return generic;
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
    await sendPasswordResetEmail(user.email, resetUrl);

    return generic;
  } catch (e) {
    console.error('[reset-request]', e);
    return NextResponse.json({ error: 'Nepodařilo se odeslat požadavek' }, { status: 500 });
  }
}
