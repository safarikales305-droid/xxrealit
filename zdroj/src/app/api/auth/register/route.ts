import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const BCRYPT_ROUNDS = 10;

const bodySchema = z.object({
  name: z
    .string()
    .optional()
    .transform((s) => (s == null || s.trim() === '' ? undefined : s.trim().slice(0, 120))),
  email: z
    .string()
    .min(1, 'Email is required')
    .transform((s) => s.trim())
    .pipe(z.string().email('Invalid email')),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.string().min(1, 'Role is required'),
});

function validationError(error: z.ZodError) {
  return NextResponse.json(
    { error: 'Validation failed', details: error.message },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: 'Invalid JSON body',
        },
        { status: 400 },
      );
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const email = parsed.data.email.trim();
    const role = parsed.data.role.trim();
    const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);

    try {
      await prisma.user.create({
        data: {
          email,
          password: passwordHash,
          name: parsed.data.name ?? null,
          role,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return NextResponse.json(
          {
            error: 'Duplicate email',
            details: 'An account with this email already exists',
          },
          { status: 400 },
        );
      }
      console.error('[register]', e);
      return NextResponse.json(
        { error: 'Server error', details: 'Could not create account' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('[register]', err);
    return NextResponse.json(
      { error: 'Server error', details: 'Something went wrong' },
      { status: 500 },
    );
  }
}
