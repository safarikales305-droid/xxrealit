import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isUserRole } from '@/lib/roles';

const BCRYPT_ROUNDS = 10;

const bodySchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().min(1, 'Email is required').email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.string().refine(isUserRole, { message: 'Invalid role' }),
});

export async function POST(request: Request) {
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          fieldErrors: flat.fieldErrors,
          formErrors: flat.formErrors,
        },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);

    try {
      await prisma.user.create({
        data: {
          email: parsed.data.email,
          password: passwordHash,
          name: parsed.data.name?.length ? parsed.data.name : null,
          role: parsed.data.role,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return NextResponse.json(
          { success: false, error: 'Email already registered' },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { success: false, error: 'Could not create account' },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Request could not be processed' },
      { status: 400 },
    );
  }
}
