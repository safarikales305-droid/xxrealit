import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hashPassword } from '@/lib/auth-password';
import { prisma } from '@/lib/db';
import { hashResetToken } from '@/lib/reset-token';

export const runtime = 'nodejs';

const bodySchema = z
  .object({
    token: z.string().min(1, 'Token je povinný'),
    password: z.string().min(6, 'Heslo musí mít alespoň 6 znaků'),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Hesla se neshodují',
    path: ['confirmPassword'],
  });

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
      console.warn('[reset-password] validation failed');
      return NextResponse.json(
        { error: 'Validace selhala', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const rawToken = parsed.data.token.trim();
    const tokenHash = hashResetToken(rawToken);
    console.log(
      `[reset-password] token received; rawLength=${rawToken.length} hashLength=${tokenHash.length}`,
    );

    // Backward compatibility:
    // - current backend reset-request stores raw token in DB
    // - older versions may store hashed token
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ resetToken: rawToken }, { resetToken: tokenHash }],
        resetExpires: { gt: new Date() },
      },
      select: { id: true, email: true, resetExpires: true },
    });

    if (!user) {
      const tokenExistsWithoutExpiryCheck = await prisma.user.findFirst({
        where: { OR: [{ resetToken: rawToken }, { resetToken: tokenHash }] },
        select: { id: true, resetExpires: true },
      });
      if (!tokenExistsWithoutExpiryCheck) {
        console.warn('[reset-password] rejected: token not found');
      } else {
        console.warn(
          `[reset-password] rejected: token expired; userId=${tokenExistsWithoutExpiryCheck.id} expiresAt=${tokenExistsWithoutExpiryCheck.resetExpires?.toISOString() ?? 'null'}`,
        );
      }
      return NextResponse.json(
        {
          error: tokenExistsWithoutExpiryCheck
            ? 'Reset odkaz vypršel. Požádejte o nový.'
            : 'Neplatný reset odkaz.',
        },
        { status: 400 },
      );
    }
    console.log(`[reset-password] token matched userId=${user.id} email=${user.email}`);

    const hashed = await hashPassword(parsed.data.password);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetToken: null,
        resetExpires: null,
      },
    });
    console.log(`[reset-password] password updated and token invalidated for userId=${user.id}`);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[reset-password]', e);
    return NextResponse.json(
      { error: 'Obnova hesla se nezdařila kvůli chybě serveru.' },
      { status: 500 },
    );
  }
}
