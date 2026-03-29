import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
/** Singleton — see `src/lib/db.ts`; uses `process.env.DATABASE_URL` from Prisma schema. */
import { prisma } from '@/lib/db';
import { normalizeRole } from '@/lib/normalize-role';

export const runtime = 'nodejs';

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
  role: z
    .string()
    .min(1, 'Role is required')
    .transform((s) => normalizeRole(s))
    .pipe(z.string().min(1, 'Role is required')),
});

function validationError(error: z.ZodError) {
  return NextResponse.json(
    { error: 'Validation failed', details: error.message },
    { status: 400 },
  );
}

function logRequestBody(body: unknown) {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const copy = { ...(body as Record<string, unknown>) };
    if ('password' in copy) {
      copy.password = '[redacted]';
    }
    console.log('[register] request body', copy);
  } else {
    console.log('[register] request body', body);
  }
}

function jsonError(error: string, details: string): NextResponse {
  return NextResponse.json({ error, details }, { status: 400 });
}

export async function POST(request: Request) {
  console.log('[register] route start', {
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
    nodeEnv: process.env.NODE_ENV,
  });

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseErr) {
      console.error('[register] JSON parse failed', parseErr);
      return jsonError('Validation failed', 'Invalid JSON body');
    }

    logRequestBody(body);

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const email = parsed.data.email.trim();
    const role = parsed.data.role;

    let passwordHash: string;
    try {
      passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);
    } catch (hashErr) {
      console.error('[register] bcrypt.hash failed', hashErr);
      return jsonError(
        'Registration failed',
        'Could not process password',
      );
    }

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
      console.error('[register] prisma.user.create failed', e);
      if (e instanceof Error) {
        console.error('[register] error message:', e.message);
        console.error('[register] error stack:', e.stack);
      }

      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return jsonError(
          'Duplicate email',
          'An account with this email already exists',
        );
      }

      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        return jsonError(
          'Registration failed',
          'Database rejected the request',
        );
      }

      if (e instanceof Prisma.PrismaClientInitializationError) {
        return jsonError(
          'Registration failed',
          'Database is not available. Check DATABASE_URL on Vercel.',
        );
      }

      return jsonError(
        'Registration failed',
        'Could not create account. Please try again.',
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('[register] unhandled route error', err);
    if (err instanceof Error) {
      console.error('[register] unhandled message:', err.message);
      console.error('[register] unhandled stack:', err.stack);
    }
    return jsonError(
      'Registration failed',
      'Something went wrong. Please try again.',
    );
  }
}
