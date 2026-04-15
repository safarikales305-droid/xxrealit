import { NextResponse } from 'next/server';
import { z } from 'zod';
import { API_BASE_URL } from '@/lib/api';

export const runtime = 'nodejs';

const ALLOWED_ROLES = ['PRIVATE_SELLER', 'AGENT', 'DEVELOPER'] as const;

const bodySchema = z
  .object({
    name: z.string().min(2, 'Jméno je povinné').max(120, 'Jméno je příliš dlouhé').transform((s) => s.trim()),
    email: z
      .string()
      .min(1, 'E-mail je povinný')
      .transform((s) => s.trim().toLowerCase())
      .pipe(z.string().email('Neplatný e-mail')),
    password: z.string().min(6, 'Heslo musí mít alespoň 6 znaků'),
    confirmPassword: z.string().min(1, 'Potvrzení hesla je povinné'),
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/, 'Telefon musí být ve formátu +420123456789'),
    role: z.enum(ALLOWED_ROLES, { message: 'Vyberte platnou roli' }),
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
      const flat = parsed.error.flatten();
      return NextResponse.json(
        {
          error: 'Zkontrolujte údaje ve formuláři',
          fieldErrors: flat.fieldErrors,
        },
        { status: 400 },
      );
    }

    if (!API_BASE_URL) {
      return NextResponse.json({ error: 'API není nakonfigurováno' }, { status: 500 });
    }
    const upstream = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    const raw = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    if (!upstream.ok) {
      return NextResponse.json(
        {
          error:
            typeof raw.error === 'string' ? raw.error : 'Registrace selhala',
          code: raw.code,
          fieldErrors: raw.fieldErrors,
        },
        { status: upstream.status },
      );
    }
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error('[register]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Chyba serveru' },
      { status: 500 },
    );
  }
}
