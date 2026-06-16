'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CommunicationShell } from '@/components/communication/CommunicationShell';
import { useAuth } from '@/hooks/use-auth';
import { canAccessCommunication } from '@/lib/communication-roles';
import {
  nestCommunicationCampaigns,
  nestCommunicationCreateCampaign,
  nestCommunicationSendCampaign,
  type MarketingCampaignRow,
} from '@/lib/communication-api';

const AUDIENCES = [
  { value: 'ALL_USERS', label: 'Všichni uživatelé' },
  { value: 'AGENTS', label: 'Makléři' },
  { value: 'INVESTORS', label: 'Investoři' },
  { value: 'FINANCIAL_ADVISORS', label: 'Finanční poradci' },
  { value: 'CONSTRUCTION_COMPANIES', label: 'Stavební firmy' },
  { value: 'CRAFTSMEN', label: 'Řemeslníci' },
  { value: 'BY_REGION', label: 'Podle kraje' },
  { value: 'BY_CITY', label: 'Podle města' },
];

const CHANNELS = [
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'INTERNAL_MESSAGE', label: 'Interní zpráva' },
];

export default function MarketingPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const token = apiAccessToken;
  const [campaigns, setCampaigns] = useState<MarketingCampaignRow[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState('EMAIL');
  const [audience, setAudience] = useState('AGENTS');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setCampaigns(await nestCommunicationCampaigns(token));
  }, [token]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/prihlaseni?redirect=/profil/marketing');
    else if (!canAccessCommunication(user.role)) router.replace('/profil/dashboard');
    else void refresh();
  }, [user, isLoading, router, refresh]);

  async function handleCreate() {
    if (!token) return;
    setBusy(true);
    const res = await nestCommunicationCreateCampaign(token, {
      title,
      body,
      channel,
      audience,
      audienceRegion: audience === 'BY_REGION' ? region : undefined,
      audienceCity: audience === 'BY_CITY' ? city : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg('Kampaň vytvořena.');
    setTitle('');
    setBody('');
    void refresh();
  }

  async function handleSend(id: string) {
    if (!token) return;
    setBusy(true);
    const res = await nestCommunicationSendCampaign(token, id);
    setBusy(false);
    setMsg(res.ok ? 'Kampaň odeslána.' : res.error);
    void refresh();
  }

  return (
    <CommunicationShell title="Hromadné kampaně">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-zinc-900">Nová kampaň</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
            placeholder="Název kampaně"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          >
            {AUDIENCES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          {audience === 'BY_REGION' ? (
            <input
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
              placeholder="Kraj"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            />
          ) : null}
          {audience === 'BY_CITY' ? (
            <input
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
              placeholder="Město"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          ) : null}
          <textarea
            className="min-h-[100px] rounded-lg border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
            placeholder="Text kampaně"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={busy || !title || !body}
          className="mt-3 rounded-full bg-[#ff6a00] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => void handleCreate()}
        >
          Vytvořit kampaň
        </button>
      </section>

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-zinc-900">Kampaně</h2>
        <ul className="mt-4 space-y-3">
          {campaigns.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50 p-4"
            >
              <div>
                <p className="font-semibold text-zinc-900">{c.title}</p>
                <p className="text-xs text-zinc-500">
                  {c.channel} · {c.audience} · {c.status} · doručeno {c.deliveredCount}/
                  {c.recipientCount}
                </p>
              </div>
              {c.status === 'DRAFT' || c.status === 'SCHEDULED' ? (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-semibold"
                  onClick={() => void handleSend(c.id)}
                >
                  Odeslat
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </CommunicationShell>
  );
}
