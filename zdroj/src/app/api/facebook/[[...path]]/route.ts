import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { getOptionalInternalApiBaseUrl } from '@/lib/server-api';

export const runtime = 'nodejs';

async function resolveAuthToken(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('Authorization')?.trim();
  if (header?.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim() || null;
  }
  const jar = await cookies();
  return jar.get(ACCESS_TOKEN_COOKIE)?.value ?? jar.get('token')?.value ?? null;
}

function mapToNestPath(pathSegments: string[]): string | null {
  if (pathSegments.length === 0) return null;
  if (pathSegments[0] === 'post') return '/facebook/post';
  if (pathSegments[0] === 'test-connection') return '/facebook/test-connection';
  if (pathSegments[0] === 'autopost') {
    const rest = pathSegments.slice(1).join('/');
    return `/social/autopost/admin/${rest}`;
  }
  return `/facebook/${pathSegments.join('/')}`;
}

async function proxy(req: NextRequest, pathSegments: string[]) {
  const nestBase = getOptionalInternalApiBaseUrl();
  if (!nestBase) {
    return NextResponse.json({ message: 'Nest API není nakonfigurováno' }, { status: 503 });
  }

  const nestPath = mapToNestPath(pathSegments);
  if (!nestPath) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const token = await resolveAuthToken(req);
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const target = `${nestBase}${nestPath}${url.search}`;

  const isMultipart = req.headers.get('content-type')?.includes('multipart/form-data');

  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(req.method !== 'GET' && req.method !== 'HEAD' && !isMultipart
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    cache: 'no-store',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (isMultipart) {
      init.body = await req.arrayBuffer();
      init.headers = {
        ...init.headers,
        'Content-Type': req.headers.get('content-type') ?? 'multipart/form-data',
      };
    } else {
      init.body = await req.text();
    }
  }

  const r = await fetch(target, init);
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { 'Content-Type': r.headers.get('Content-Type') ?? 'application/json' },
  });
}

type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx);
}
