'use client';

import { useEffect, useState } from 'react';
import {
  nestAiInfluencerMusic,
  nestAiInfluencerRenderSettings,
  nestAiInfluencerUpdateRenderSettings,
  nestAiInfluencerUpdateSettings,
  type AiInfluencerRenderSettings,
  type ShortsMusicOption,
} from '@/lib/ai-influencer-client';

const LAYOUTS = [
  ['SMART_AUTO', 'Smart auto'],
  ['AVATAR_FULLSCREEN', 'Avatar fullscreen'],
  ['AVATAR_BLUR', 'Avatar + blur'],
  ['AVATAR_CONTENT', 'Avatar + obsah'],
  ['PICTURE_IN_PICTURE', 'Picture in picture'],
] as const;

type Props = {
  apiAccessToken: string | null;
  dashboardSettings?: {
    autoPublishFacebook?: boolean;
    autoPublishInstagram?: boolean;
    autoPublishYoutube?: boolean;
    autoPublishPortal?: boolean;
    youtubePrivacyStatus?: string;
    defaultMusicTrackId?: string | null;
  };
  onSaved?: () => void;
};

export function AiInfluencerReelEditor({ apiAccessToken, dashboardSettings, onSaved }: Props) {
  const [settings, setSettings] = useState<AiInfluencerRenderSettings | null>(null);
  const [preset, setPreset] = useState('modern_xxrealit');
  const [music, setMusic] = useState<ShortsMusicOption[]>([]);
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [autoFb, setAutoFb] = useState(false);
  const [autoIg, setAutoIg] = useState(false);
  const [autoYt, setAutoYt] = useState(false);
  const [autoPortal, setAutoPortal] = useState(false);
  const [ytPrivacy, setYtPrivacy] = useState('private');
  const [musicTrackId, setMusicTrackId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!apiAccessToken) return;
    void nestAiInfluencerRenderSettings(apiAccessToken).then((r) => {
      if (!r) return;
      setPreset(r.preset);
      setSettings(r.settings);
      setMusicTrackId(r.settings.music?.trackId ?? dashboardSettings?.defaultMusicTrackId ?? '');
    });
    void nestAiInfluencerMusic(apiAccessToken).then((tracks) => {
      if (tracks) setMusic(tracks);
    });
    setAutoFb(dashboardSettings?.autoPublishFacebook ?? false);
    setAutoIg(dashboardSettings?.autoPublishInstagram ?? false);
    setAutoYt(dashboardSettings?.autoPublishYoutube ?? false);
    setAutoPortal(dashboardSettings?.autoPublishPortal ?? false);
    setYtPrivacy(dashboardSettings?.youtubePrivacyStatus ?? 'private');
  }, [apiAccessToken, dashboardSettings]);

  if (!settings) return null;

  const previewUrl = jobsPreviewPlaceholder(settings);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">Vzhled AI Reelu</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mx-auto w-[270px] rounded-[2rem] border-4 border-zinc-800 bg-black p-2 shadow-xl">
            <div className="relative aspect-[9/16] overflow-hidden rounded-[1.5rem] bg-zinc-900">
              {previewUrl ? (
                <video className="h-full w-full object-cover" src={previewUrl} controls muted playsInline />
              ) : (
                <div className="flex h-full flex-col items-center justify-center px-4 text-center text-xs text-zinc-400">
                  <p>Náhled layoutu</p>
                  <p className="mt-2 text-white">{settings.layout}</p>
                </div>
              )}
              {showSafeZones ? (
                <>
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-[180px] border-b border-dashed border-amber-400/60" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[330px] border-t border-dashed border-amber-400/60" />
                  <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-[150px] border-l border-dashed border-amber-400/40" />
                </>
              ) : null}
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={showSafeZones}
              onChange={(e) => setShowSafeZones(e.target.checked)}
            />
            Zobrazit bezpečné zóny
          </label>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <label className="font-medium text-zinc-700" htmlFor="reel-preset">
              Preset
            </label>
            <select
              id="reel-preset"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            >
              <option value="modern_xxrealit">Moderní XXREALIT</option>
              <option value="minimal">Minimal</option>
              <option value="bold_hook">Bold hook</option>
            </select>
          </div>

          <div>
            <label className="font-medium text-zinc-700" htmlFor="reel-layout">
              Layout
            </label>
            <select
              id="reel-layout"
              value={settings.layout}
              onChange={(e) => setSettings({ ...settings, layout: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            >
              {LAYOUTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-2 rounded-lg border border-zinc-200 p-3">
            <legend className="px-1 font-medium text-zinc-700">Titulky</legend>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.subtitles.enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    subtitles: { ...settings.subtitles, enabled: e.target.checked },
                  })
                }
              />
              Zapnout titulky
            </label>
            <label className="block">
              Velikost fontu
              <input
                type="range"
                min={40}
                max={64}
                value={settings.subtitles.fontSize}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    subtitles: { ...settings.subtitles, fontSize: Number(e.target.value) },
                  })
                }
                className="w-full"
              />
            </label>
            <label className="block">
              Spodní odsazení ({settings.subtitles.bottomMargin}px)
              <input
                type="range"
                min={260}
                max={380}
                value={settings.subtitles.bottomMargin}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    subtitles: { ...settings.subtitles, bottomMargin: Number(e.target.value) },
                  })
                }
                className="w-full"
              />
            </label>
          </fieldset>

          <div>
            <label className="font-medium text-zinc-700" htmlFor="reel-music">
              Hudba (XXREALIT knihovna)
            </label>
            <select
              id="reel-music"
              value={musicTrackId}
              onChange={(e) => setMusicTrackId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            >
              <option value="">— bez hudby —</option>
              {music.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {t.artist ? ` — ${t.artist}` : ''}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-2 rounded-lg border border-zinc-200 p-3">
            <legend className="px-1 font-medium text-zinc-700">Publikování</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={autoFb} onChange={(e) => setAutoFb(e.target.checked)} />
              Publikovat na Facebook
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={autoIg} onChange={(e) => setAutoIg(e.target.checked)} />
              Publikovat na Instagram
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={autoYt} onChange={(e) => setAutoYt(e.target.checked)} />
              Publikovat na YouTube
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={autoPortal} onChange={(e) => setAutoPortal(e.target.checked)} />
              Publikovat do XXREALIT Shorts
            </label>
            <select
              value={ytPrivacy}
              onChange={(e) => setYtPrivacy(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2"
            >
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </fieldset>

          <button
            type="button"
            disabled={!apiAccessToken || busy}
            onClick={() => {
              if (!apiAccessToken) return;
              setBusy(true);
              void Promise.all([
                nestAiInfluencerUpdateRenderSettings(apiAccessToken, {
                  preset,
                  settings: {
                    ...settings,
                    music: { ...settings.music, trackId: musicTrackId || null },
                  },
                }),
                nestAiInfluencerUpdateSettings(apiAccessToken, {
                  autoPublishFacebook: autoFb,
                  autoPublishInstagram: autoIg,
                  autoPublishYoutube: autoYt,
                  autoPublishPortal: autoPortal,
                  facebookPublishMode: autoFb ? 'AUTO_AFTER_GENERATION' : 'MANUAL',
                  instagramPublishMode: autoIg ? 'AUTO_AFTER_GENERATION' : 'MANUAL',
                  youtubePublishMode: autoYt ? 'AUTO_AFTER_GENERATION' : 'MANUAL',
                  portalPublishMode: autoPortal ? 'AUTO_AFTER_GENERATION' : 'MANUAL',
                  youtubePrivacyStatus: ytPrivacy,
                  defaultMusicTrackId: musicTrackId || null,
                }),
              ]).then(() => {
                setBusy(false);
                onSaved?.();
              });
            }}
            className="rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            Uložit šablonu
          </button>
        </div>
      </div>
    </section>
  );
}

function jobsPreviewPlaceholder(_settings: AiInfluencerRenderSettings): string | null {
  return null;
}
