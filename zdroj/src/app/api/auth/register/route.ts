import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setAuthCookies } from '@/lib/auth-cookie';
import { API_BASE_URL } from '@/lib/api';
import {
  REGISTRATION_ACCOUNT_TYPES,
  type RegistrationAccountType,
} from '@/lib/registration-account-types';

export const runtime = 'nodejs';

const ALLOWED_ROLES = REGISTRATION_ACCOUNT_TYPES.map((t) => t.value) as [
  RegistrationAccountType,
  ...RegistrationAccountType[],
];

const bodySchema = z
  .object({
    name: z.string().max(120).transform((s) => s.trim()).optional(),
    firstName: z.string().max(60).transform((s) => s.trim()).optional(),
    lastName: z.string().max(60).transform((s) => s.trim()).optional(),
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
    role: z.enum(ALLOWED_ROLES, { message: 'Vyberte platnou roli' }).optional(),
    referralCode: z.string().max(32).optional(),
    wantsPortalWorker: z.boolean().optional(),
    wantsPropertySeeker: z.boolean().optional(),
    city: z.string().max(120).transform((s) => s.trim()).optional(),
    bio: z.string().max(500).transform((s) => s.trim()).optional(),
    portalWorkerCooperationConsent: z.boolean().optional(),
    marketingConsentWhatsApp: z.boolean().optional(),
    marketingConsentEmail: z.boolean().optional(),
    termsAccepted: z.boolean().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Hesla se neshodují',
    path: ['confirmPassword'],
  })
  .superRefine((d, ctx) => {
    if (d.termsAccepted !== true) {
      ctx.addIssue({
        code: 'custom',
        message: 'Musíte souhlasit s obchodními podmínkami a pravidly portálu',
        path: ['termsAccepted'],
      });
    }
  })
  .superRefine((d, ctx) => {
    if (d.wantsPropertySeeker) return;
    if (d.wantsPortalWorker) return;
    if (!d.name || d.name.length < 2) {
      ctx.addIssue({ code: 'custom', message: 'Jméno je povinné', path: ['name'] });
    }
    if (!d.role) {
      ctx.addIssue({ code: 'custom', message: 'Vyberte typ účtu', path: ['role'] });
    }
  })
  .superRefine((d, ctx) => {
    if (!d.wantsPortalWorker) return;
    if (!d.firstName || d.firstName.length < 2) {
      ctx.addIssue({ code: 'custom', message: 'Jméno je povinné', path: ['firstName'] });
    }
    if (!d.lastName || d.lastName.length < 2) {
      ctx.addIssue({ code: 'custom', message: 'Příjmení je povinné', path: ['lastName'] });
    }
    if (!d.city) {
      ctx.addIssue({ code: 'custom', message: 'Město je povinné', path: ['city'] });
    }
    if (!d.bio || d.bio.length < 20) {
      ctx.addIssue({
        code: 'custom',
        message: 'Krátké představení musí mít alespoň 20 znaků',
        path: ['bio'],
      });
    }
    if (d.portalWorkerCooperationConsent !== true) {
      ctx.addIssue({
        code: 'custom',
        message: 'Musíte souhlasit se spoluprací',
        path: ['portalWorkerCooperationConsent'],
      });
    }
  })
  .superRefine((d, ctx) => {
    if (!d.wantsPropertySeeker) return;
    if (d.wantsPortalWorker) {
      ctx.addIssue({
        code: 'custom',
        message: 'Nelze kombinovat oba typy registrace',
        path: ['wantsPropertySeeker'],
      });
    }
    if (!d.name || d.name.length < 2) {
      ctx.addIssue({ code: 'custom', message: 'Jméno je povinné', path: ['name'] });
    }
    if (d.marketingConsentWhatsApp !== true || d.marketingConsentEmail !== true) {
      ctx.addIssue({
        code: 'custom',
        message: 'Marketingový souhlas je povinný',
        path: ['marketingConsentWhatsApp'],
      });
    }
  });

type NestRegisterOk = {
  accessToken?: string;
  user?: {
    id?: string;
    email?: string;
    role?: string;
    avatar?: string | null;
    coverImage?: string | null;
    bio?: string | null;
    createdAt?: string;
  };
};

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

    const pw = parsed.data.wantsPortalWorker === true;
    const ps = parsed.data.wantsPropertySeeker === true;
    const displayName = pw
      ? `${parsed.data.firstName ?? ''} ${parsed.data.lastName ?? ''}`.trim()
      : (parsed.data.name ?? '');

    const userAgent = req.headers.get('user-agent');
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      null;

    const upstream = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(clientIp ? { 'x-forwarded-for': clientIp } : {}),
        ...(userAgent ? { 'user-agent': userAgent } : {}),
      },
      body: JSON.stringify({
        name: displayName,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        password: parsed.data.password,
        phone: parsed.data.phone,
        role: pw || ps ? 'USER' : parsed.data.role,
        city: parsed.data.city,
        bio: parsed.data.bio,
        referralCode: parsed.data.referralCode,
        wantsPortalWorker: pw,
        wantsPropertySeeker: ps,
        portalWorkerCooperationConsent: parsed.data.portalWorkerCooperationConsent,
        marketingConsentWhatsApp: parsed.data.marketingConsentWhatsApp,
        marketingConsentEmail: parsed.data.marketingConsentEmail,
        termsAccepted: parsed.data.termsAccepted === true,
      }),
    });
    const raw = (await upstream.json().catch(() => ({}))) as Record<string, unknown> & NestRegisterOk;
    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: typeof raw.error === 'string' ? raw.error : 'Registrace selhala',
          code: raw.code,
          fieldErrors: raw.fieldErrors,
        },
        { status: upstream.status },
      );
    }

    if (ps && typeof raw.accessToken === 'string' && raw.user) {
      const u = raw.user;
      if (typeof u.id === 'string' && typeof u.email === 'string' && typeof u.role === 'string') {
        const res = NextResponse.json({
          success: true,
          propertySeeker: true,
          session: {
            user: {
              id: u.id,
              email: u.email,
              role: u.role,
              avatar: u.avatar ?? null,
              coverImage: u.coverImage ?? null,
              bio: u.bio ?? null,
              createdAt:
                typeof u.createdAt === 'string' ? u.createdAt : new Date().toISOString(),
            },
          },
        });
        setAuthCookies(res, raw.accessToken);
        return res;
      }
    }

    return NextResponse.json({ success: true, portalWorker: pw, propertySeeker: ps });
  } catch (e: unknown) {
    console.error('[register]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Chyba serveru' },
      { status: 500 },
    );
  }
}
