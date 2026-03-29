import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isUserRole } from '@/lib/roles';

const bodySchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().min(1, 'Email is required').email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.string().refine(isUserRole, { message: 'Invalid role' }),
});

/**
 * Simulated registration — no database or external API (Vercel-safe).
 * POST JSON: { name?, email, password, role }
 */
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

    const _simulated = {
      name: parsed.data.name?.length ? parsed.data.name : undefined,
      email: parsed.data.email,
      role: parsed.data.role,
      // Intentionally do not persist password or echo it back
    };
    void _simulated;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Request could not be processed' },
      { status: 400 },
    );
  }
}

export function GET() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed' },
    { status: 405 },
  );
}
