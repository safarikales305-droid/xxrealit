'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  SOCIAL_PUBLISH_TEMPLATE_ROLE_LABELS,
  nestAdminSocialPublishTemplatesGet,
  nestAdminSocialPublishTemplatesPatch,
  type SocialPublishTemplateRole,
  type SocialPublishTemplatesSettings,
} from '@/lib/social-autopost-admin-api';

const TEMPLATE_VARS = [
  '{authorName}',
  '{authorRole}',
  '{listingTitle}',
  '{city}',
  '{portalUrl}',
  '{postText}',
];

const ROLE_KEYS = Object.keys(SOCIAL_PUBLISH_TEMPLATE_ROLE_LABELS) as SocialPublishTemplateRole[];

export default function AdminSocialPublishTemplatesPage() {
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [templates, setTemplates] = useState<SocialPublishTemplatesSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const rows = await nestAdminSocialPublishTemplatesGet(token);
    if (!rows) {
      setLoadError('Nepodařilo se načíst šablony publikování.');
      return;
    }
    setTemplates(rows);
    setLoadError(null);
  }, [token]);

  useEffect(() => {
    if (!isLoading && user?.role === 'ADMIN' && token) void refresh();
  }, [isLoading, user?.role, token, refresh]);

  if (isLoading) return <p className="p-6 text-sm text-zinc-500">Načítám…</p>;
  if (user?.role !== 'ADMIN') {
    return (
      <p className="p-6 text-sm text-zinc-600">
        Přístup pouze pro administrátory. <Link href="/admin">Zpět</Link>
      </p>
    );
  }

  async function save() {
    if (!token || !templates) return;
    setBusy(true);
    setMsg(null);
    const next = await nestAdminSocialPublishTemplatesPatch(token, templates);
    setBusy(false);
    if (!next) {
      setMsg('Uložení šablon se nezdařilo.');
      return;
    }
    setTemplates(next);
    setMsg('Šablony publikování uloženy.');
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <p className="text-sm text-zinc-500">
          <Link href="/admin/bonusove-akce" className="hover:underline">
            Marketing
          </Link>{' '}
          /{' '}
          <Link href="/admin/marketing/socialni-site" className="hover:underline">
            Sociální sítě
          </Link>{' '}
          / Šablony publikování
        </p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">Šablony publikování</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Texty pro Facebook podle typu autora. Podporované proměnné:{' '}
          {TEMPLATE_VARS.join(', ')}
        </p>
      </div>

      {loadError ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{loadError}</p> : null}
      {msg ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p> : null}

      {templates ? (
        <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          {ROLE_KEYS.map((role) => (
            <label key={role} className="block">
              <span className="mb-1 block text-sm font-semibold text-zinc-800">
                {SOCIAL_PUBLISH_TEMPLATE_ROLE_LABELS[role]}
              </span>
              <textarea
                rows={6}
                value={templates[role] ?? ''}
                onChange={(e) =>
                  setTemplates((prev) =>
                    prev ? { ...prev, [role]: e.target.value } : prev,
                  )
                }
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 font-mono text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
              />
            </label>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Uložit šablony
          </button>
        </section>
      ) : null}
    </div>
  );
}
