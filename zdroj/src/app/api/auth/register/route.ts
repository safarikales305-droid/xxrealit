import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z
    .string()
    .min(1, 'Email je povinný')
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().email('Neplatný e-mail')),
  password: z.string().min(6, 'Heslo musí mít alespoň 6 znaků'),
  name: z.string().trim().max(120).optional(),
  role: z.string().trim().min(1).optional(),
});

const roleMap: Record<string, 'USER' | 'ADMIN'> = {
  'Soukromý inzerent': 'USER',
  'Makléř': 'ADMIN',
  soukromy_inzerent: 'USER',
  uzivatel: 'USER',
  makler: 'ADMIN',
  USER: 'USER',
  ADMIN: 'ADMIN',
};

function mapRole(inputRole?: string): 'USER' | 'ADMIN' {
  if (!inputRole) return 'USER';
  return roleMap[inputRole] ?? roleMap[inputRole.toLowerCase()] ?? 'USER';
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log('REGISTER BODY:', body);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, password, name, role } = parsed.data;
    const mappedRole = mapRole(role);
    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name: name && name.length > 0 ? name : null,
        role: mappedRole,
      },
    });

    return NextResponse.json({ success: true, user });
  } catch (e: unknown) {
    console.error('REGISTER ERROR:', e);

    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Email už je registrován' },
        { status: 400 }
      );
    }

    // Common in this case: P2021 (table does not exist)
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2021'
    ) {
      return NextResponse.json(
        {
          error: 'Databázová tabulka User neexistuje. Spusť prisma db push nebo migrate deploy.',
          code: e.code,
          meta: e.meta,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : 'Neočekávaná chyba při registraci',
        code:
          e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined,
        meta:
          e instanceof Prisma.PrismaClientKnownRequestError ? e.meta : undefined,
      },
      { status: 500 }
    );
  }
}
