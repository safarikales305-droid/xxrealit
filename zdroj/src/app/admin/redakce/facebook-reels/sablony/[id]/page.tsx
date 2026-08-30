'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import {
  nestEditorialReelMusic,
  nestEditorialReelTemplates,
  nestEditorialTestReelTemplate,
  nestEditorialUpdateReelTemplate,
  type EditorialReelTemplate,
} from '@/lib/editorial-center-client';

type MusicTrack = {
  id: string;
  title: string;
  fileUrl: string;
  previewUrl?: string | null;
};

function trackAudioUrl(t: MusicTrack): string {
  const u = (t.previewUrl || t.fileUrl || '').trim();
  if (!u) return '';
  return nestAbsoluteAssetUrl(u) || u;
}

export default function ReelSablonaEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [template, setTemplate] = useState<EditorialReelTemplate | null>(null);
  const [music, setMusic] = useState<MusicTrack[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testJobId, setTestJobId] = useState<string | null>(null);
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!apiAccessToken || !id) return;
    void Promise.all([
      nestEditorialReelTemplates(apiAccessToken),
      nestEditorialReelMusic(apiAccessToken),
    ]).then(([templates, tracks]) => {
      const t = templates?.find((x) => x.id === id) ?? null;
      setTemplate(t);
      if (tracks) setMusic(tracks);
    });
  }, [apiAccessToken, id]);

  const preview = useMemo(() => {
    if (!template) return null;
    const total =
      template.introSec + template.segmentSec * 3 + template.outroSec;
    return { total };
  }, [template]);

  const save = async (patch: Partial<EditorialReelTemplate>) => {
    if (!apiAccessToken || !template) return;
    setSaving(true);
    const next = { ...template, ...patch };
    setTemplate(next);
    const saved = await nestEditorialUpdateReelTemplate(apiAccessToken, template.id, patch);
    if (saved) setTemplate(saved);
    setSaving(false);
  };

  const runTest = async () => {
    if (!apiAccessToken || !template) return;
    setTesting(true);
    const job = await nestEditorialTestReelTemplate(apiAccessToken, template.id);
    if (job?.id) setTestJobId(job.id);
    setTesting(false);
  };

  if (isLoading || !user || !template) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell title={`Šablona: ${template.name}`} subtitle="Editor s live náhledem 9:16">
      <Link href="/admin/redakce/facebook-reels/sablony" className="text-sm text-orange-700 underline">
        ← Zpět na šablony
      </Link>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex justify-center">
          <div
            className="relative w-full max-w-[270px] overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-900 shadow-xl"
            style={{ aspectRatio: '9/16' }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-950" />
            {template.showLogo ? (
              <div className="absolute left-1/2 top-8 -translate-x-1/2 rounded bg-orange-600 px-3 py-1 text-xs font-bold text-white">
                XXREALIT
              </div>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-16">
              {template.showVideoTitle ? (
                <p className="text-sm font-bold text-white">Ukázkový název videa</p>
              ) : null}
              {template.showChannelTitle ? (
                <p className="mt-1 text-xs text-orange-400">Honza reality</p>
              ) : null}
              {template.showCategory ? (
                <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-300">Makléři</p>
              ) : null}
            </div>
            <div className="absolute inset-0 flex items-center justify-center text-center text-xs text-zinc-500">
              {preview ? `~${Math.round(preview.total)}s` : ''}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
          <label className="block text-sm">
            <span className="font-medium">Název šablony</span>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={template.name}
              onChange={(e) => void save({ name: e.target.value })}
            />
          </label>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <label>
              Intro (s)
              <input
                type="number"
                min={1}
                step={0.5}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                value={template.introSec}
                onChange={(e) => void save({ introSec: Number(e.target.value) })}
              />
            </label>
            <label>
              Segment (s)
              <input
                type="number"
                min={2}
                step={0.5}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                value={template.segmentSec}
                onChange={(e) => void save({ segmentSec: Number(e.target.value) })}
              />
            </label>
            <label>
              Outro (s)
              <input
                type="number"
                min={1}
                step={0.5}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                value={template.outroSec}
                onChange={(e) => void save({ outroSec: Number(e.target.value) })}
              />
            </label>
          </div>

          <label className="block text-sm">
            Přechod
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={template.transition}
              onChange={(e) => void save({ transition: e.target.value })}
            >
              <option value="FADE">Fade</option>
              <option value="ZOOM">Zoom</option>
              <option value="SLIDE">Slide</option>
              <option value="CROSSFADE">Crossfade</option>
            </select>
          </label>

          <div className="space-y-2 text-sm">
            {[
              ['showLogo', 'Logo'],
              ['showVideoTitle', 'Název videa'],
              ['showChannelTitle', 'Kanál'],
              ['showCategory', 'Kategorie'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={template[key as keyof EditorialReelTemplate] as boolean}
                  onChange={(e) => void save({ [key]: e.target.checked } as Partial<EditorialReelTemplate>)}
                />
                {label}
              </label>
            ))}
          </div>

          <label className="block text-sm">
            Intro text
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={template.introText ?? ''}
              onChange={(e) => void save({ introText: e.target.value })}
            />
          </label>

          <label className="block text-sm">
            CTA text
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={template.ctaText}
              onChange={(e) => void save({ ctaText: e.target.value })}
            />
          </label>

          <label className="block text-sm">
            Hudba
            <select
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={template.musicTrackId ?? ''}
              onChange={(e) => void save({ musicTrackId: e.target.value || null })}
            >
              <option value="">Bez hudby</option>
              {music.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {template.musicTrackId ? (
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-3 py-1.5"
                onClick={() => {
                  const track = music.find((m) => m.id === template.musicTrackId);
                  if (!track) return;
                  const url = trackAudioUrl(track);
                  if (!url) return;
                  if (previewTrackId === track.id && audioRef.current && !audioRef.current.paused) {
                    audioRef.current.pause();
                    setPreviewTrackId(null);
                    return;
                  }
                  if (audioRef.current) {
                    audioRef.current.src = url;
                    void audioRef.current.play();
                    setPreviewTrackId(track.id);
                  }
                }}
              >
                {previewTrackId === template.musicTrackId ? '⏸ Zastavit' : '▶ Přehrát ukázku'}
              </button>
            ) : null}
            <Link href="/admin/hudba" className="text-orange-700 underline">
              Spravovat hudební knihovnu
            </Link>
          </div>
          <audio ref={audioRef} className="hidden" onEnded={() => setPreviewTrackId(null)} />

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={testing || saving}
              onClick={() => void runTest()}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {testing ? 'Renderuji…' : 'Vytvořit testovací náhled'}
            </button>
            {testJobId ? (
              <Link
                href={`/admin/redakce/facebook-reels/${testJobId}`}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm"
              >
                Zobrazit testovací Reel
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </EditorialCenterShell>
  );
}
