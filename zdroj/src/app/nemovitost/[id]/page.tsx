import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { normalizePropertyDetailPayload } from '@/lib/property-detail';

type Props = { params: Promise<{ id: string }> };

async function fetchPropertyDetail(id: string): Promise<unknown | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const cookie = h.get('cookie') ?? '';
  const url = `${proto}://${host}/api/properties/${encodeURIComponent(id)}`;

  const res = await fetch(url, {
    cache: 'no-store',
    headers: cookie ? { cookie } : {},
  });

  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

const PRICE_FMT = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
});

export default async function NemovitostDetailPage({ params }: Props) {
  const { id } = await params;
  const raw = await fetchPropertyDetail(id);
  const parsed = normalizePropertyDetailPayload(raw);

  if (!parsed?.property || !parsed.user) {
    notFound();
  }

  const { property: p, user: author, other } = parsed;
  const avatarSrc =
    author.avatar && author.avatar.trim().length > 0
      ? nestAbsoluteAssetUrl(author.avatar)
      : null;

  return (
    <div>
      <section className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-md">
        <div className="relative aspect-[21/9] w-full max-h-[380px] bg-zinc-100">
          {p.videoUrl ? (
            <video
              src={p.videoUrl}
              className="h-full w-full object-cover"
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-sm text-zinc-500">
              Bez náhledu videa
            </div>
          )}
        </div>

        <div className="p-6 sm:p-8">
          <p className="text-sm font-medium text-zinc-500">🏠 Detail inzerátu</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            {p.title}
          </h1>
          <p className="mt-4 text-2xl font-bold text-[#e85d00]">{PRICE_FMT.format(p.price)}</p>
          <p className="mt-2 text-[15px] font-medium text-zinc-700">
            <span className="text-zinc-500">Lokalita:</span> {p.location}
          </p>
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">👤 Inzerent</h2>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-xl font-bold text-zinc-600">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt=""
                width={64}
                height={64}
                className="size-full object-cover"
              />
            ) : (
              author.email.trim().charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            {author.name ? (
              <p className="font-semibold text-zinc-900">{author.name}</p>
            ) : null}
            <p className="truncate text-sm text-zinc-600">{author.email}</p>
          </div>
        </div>
      </section>

      {other.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-zinc-900">
            📄 Další inzeráty od stejného uživatele
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {other.map((item) => (
              <Link
                key={item.id}
                href={`/nemovitost/${item.id}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-sm transition hover:border-zinc-300 hover:shadow-md"
              >
                <div className="relative aspect-[4/3] bg-zinc-100">
                  {item.videoUrl ? (
                    <video
                      src={item.videoUrl}
                      className="h-full w-full object-cover"
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      aria-hidden
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-sm text-zinc-400">
                      Bez náhledu
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-zinc-900 group-hover:text-[#e85d00]">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[13px] text-zinc-500">{item.location}</p>
                  <p className="mt-auto pt-3 text-lg font-bold tabular-nums text-[#e85d00]">
                    {PRICE_FMT.format(item.price)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
