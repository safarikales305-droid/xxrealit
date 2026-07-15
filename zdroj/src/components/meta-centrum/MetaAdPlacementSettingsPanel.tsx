'use client';

import { useMemo, useState } from 'react';
import type { MetaAdPlacementSettings } from '@/lib/nest-client';

const PLACEMENT_CATALOG = {
  facebook: [
    { id: 'feed', label: 'Facebook Feed', supported: true },
    { id: 'marketplace', label: 'Facebook Marketplace', supported: true },
    {
      id: 'video_feeds',
      label: 'Facebook Video Feeds (Meta již nepodporuje)',
      supported: false,
      deprecated: true,
    },
  ],
  instagram: [
    { id: 'stream', label: 'Instagram Feed', supported: true },
    { id: 'story', label: 'Instagram Stories', supported: true },
    { id: 'reels', label: 'Instagram Reels', supported: true },
  ],
} as const;

type Props = {
  value: MetaAdPlacementSettings;
  disabled?: boolean;
  onSave: (next: MetaAdPlacementSettings) => Promise<void>;
};

function normalizeValue(value: MetaAdPlacementSettings): MetaAdPlacementSettings {
  return {
    facebook: { ...value.facebook, video_feeds: false },
    instagram: { ...value.instagram },
  };
}

export function MetaAdPlacementSettingsPanel({ value, disabled = false, onSave }: Props) {
  const [draft, setDraft] = useState<MetaAdPlacementSettings>(() => normalizeValue(value));
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(normalizeValue(value)) !== JSON.stringify(normalizeValue(draft)),
    [value, draft],
  );

  function toggle(platform: 'facebook' | 'instagram', id: string, supported: boolean) {
    if (!supported || disabled) return;
    setDraft((current) => ({
      ...current,
      [platform]: {
        ...current[platform],
        [id]: !current[platform][id],
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(normalizeValue(draft));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Umístění reklam (placements)</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Zapněte nebo vypněte jednotlivá umístění pro Ad Set bez úpravy zdrojového kódu.
            Zastaralá umístění Meta automaticky odebere před odesláním.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || saving || !dirty}
          onClick={() => void handleSave()}
          className="rounded-lg bg-[#1877f2] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Ukládám…' : 'Uložit umístění'}
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(['facebook', 'instagram'] as const).map((platform) => (
          <div key={platform} className="rounded-xl border border-zinc-200 p-3">
            <p className="mb-2 text-sm font-semibold capitalize">{platform}</p>
            <ul className="space-y-2">
              {PLACEMENT_CATALOG[platform].map((entry) => {
                const checked = draft[platform][entry.id] === true;
                return (
                  <li key={entry.id}>
                    <label
                      className={`flex items-start gap-2 text-sm ${
                        entry.supported ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        disabled={disabled || !entry.supported}
                        onChange={() => toggle(platform, entry.id, entry.supported)}
                      />
                      <span>
                        <span className="font-medium">{entry.label}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-zinc-500">
                          {entry.id}
                          {'deprecated' in entry && entry.deprecated ? ' · deprecated' : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
