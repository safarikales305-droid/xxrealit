import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hashPassword } from '@/lib/auth-password';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

const bodySchema = z
  .object({
    email: z
      .string()
      .min(1, 'E-mail je povinný')
      .transform((s) => s.trim().toLowerCase())
      .pipe(z.string().email('Neplatný e-mail')),
    password: z.string().min(6, 'Heslo musí mít alespoň 6 znaků'),
    confirmPassword: z.string().min(1, 'Potvrzení hesla je povinné'),
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
      const msg = parsed.error.flatten().fieldErrors;
      return NextResponse.json(
        { error: 'Validace selhala', details: msg },
        { status: 400 },
      );
    }

    const { email, password } = parsed.data;
    const hashed = await hashPassword(password);

    await prisma.user.create({
      data: {
        email,
        password: hashed,
        role: 'PRIVATE_SELLER',
      },
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error('[register]', e);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Tento e-mail je již registrován' }, { status: 409 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Chyba serveru' },
      { status: 500 },
    );
  }
}
