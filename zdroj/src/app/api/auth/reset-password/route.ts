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
      return NextResponse.json(
        { error: 'Validace selhala', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const tokenHash = hashResetToken(parsed.data.token);

    const user = await prisma.user.findFirst({
      where: {
        resetToken: tokenHash,
        resetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Neplatný nebo expirovaný odkaz' },
        { status: 400 },
      );
    }

    const hashed = await hashPassword(parsed.data.password);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetToken: null,
        resetExpires: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[reset-password]', e);
    return NextResponse.json({ error: 'Obnova hesla se nezdařila' }, { status: 500 });
  }
}
