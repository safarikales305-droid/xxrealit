'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  nestAiInfluencerAnalyzeTopicUrl,
  nestAiInfluencerDiscoverTopics,
  nestAiInfluencerRejectTopicCandidate,
  nestAiInfluencerStartTopicVideo,
  nestAiInfluencerTopicCandidates,
  nestAiInfluencerTopicCostEstimate,
  nestAiInfluencerTopicDiscoveryStatus,
  nestAiInfluencerTopicScriptPreview,
  nestAiInfluencerUpdateSettings,
  type AiInfluencerTopicCandidateRow,
  type TopicCandidateFilter,
  type TopicCostEstimate,
  type TopicScriptPreviewResult,
} from '@/lib/ai-influencer-client';

const FILTERS: { id: TopicCandidateFilter; label: string }[] = [
  { id: 'all', label: 'Vše' },
  { id: 'top', label: '🔥 Top témata' },
  { id: 'today', label: 'Dnes' },
  { id: 'cz', label: 'ČR' },
  { id: 'prague', label: 'Praha' },
  { id: 'luxury', label: 'Luxusní' },
  { id: 'cheap', label: 'Levné' },
  { id: 'bizarre', label: 'Bizár' },
  { id: 'mortgages', label: 'Hypotéky' },
  { id: 'development', label: 'Development' },
  { id: 'trends', label: 'Trendy' },
  { id: 'url', label: 'Z URL' },
  { id: 'used', label: 'Použité' },
  { id: 'ignored', label: 'Ignorované' },
];

function scoreLabel(score: number): string {
  if (score >= 90) return 'VELMI SILNÉ TÉMA';
  if (score >= 80) return 'SILNÉ TÉMA';
  if (score >= 70) return 'ZAJÍMAVÉ TÉMA';
  return 'SLABŠÍ TÉMA';
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  const time = d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `dnes ${time}` : d.toLocaleString('cs-CZ');
}

function extractFacts(candidate: AiInfluencerTopicCandidateRow): {
  price?: string;
  location?: string;
  area?: string;
} {
  const facts = candidate.factsJson as Array<{ key?: string; value?: string }> | null;
  if (!Array.isArray(facts)) return {};
  const out: { price?: string; location?: string; area?: string } = {};
  for (const fact of facts) {
    const key = (fact.key ?? '').toLowerCase();
    if (key.includes('cen')) out.price = fact.value;
    if (key.includes('lokal') || key.includes('místo') || key.includes('mesto')) out.location = fact.value;
    if (key.includes('ploch') || key.includes('m²') || key.includes('m2')) out.area = fact.value;
  }
  if (!out.location && candidate.region) out.location = candidate.region;
  return out;
}

function sourceCount(candidate: AiInfluencerTopicCandidateRow): number {
  return candidate.sourceCount || 1;
}

type Props = {
  apiAccessToken: string;
  generationBlocked: boolean;
  onToast: (message: string) => void;
  onVideoStarted?: (jobId: string) => void;
  topicHunterEnabled?: boolean;
};

export function AiTopicHunterPanel({
  apiAccessToken,
  generationBlocked,
  onToast,
  onVideoStarted,
  topicHunterEnabled,
}: Props) {
  const [filter, setFilter] = useState<TopicCandidateFilter>('all');
  const [items, setItems] = useState<AiInfluencerTopicCandidateRow[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [discoveryPhase, setDiscoveryPhase] = useState<string | null>(null);
  const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const [preview, setPreview] = useState<TopicScriptPreviewResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const [costModal, setCostModal] = useState<{
    candidate: AiInfluencerTopicCandidateRow;
    estimate: TopicCostEstimate;
  } | null>(null);
  const [startBusy, setStartBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await nestAiInfluencerTopicCandidates(apiAccessToken, filter);
    setLoading(false);
    if (!res) return;
    setItems(res.items);
    setTodayCount(res.todayCount);
    if (res.discovery?.phase && res.discovery.phase !== 'idle') {
      setDiscoveryPhase(res.discovery.phase);
      setDiscoveryMessage(res.discovery.message);
    }
  }, [apiAccessToken, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!discoverBusy && discoveryPhase !== 'searching' && discoveryPhase !== 'analyzing' &&
        discoveryPhase !== 'fact_checking' && discoveryPhase !== 'scoring') {
      return;
    }
    const timer = setInterval(() => {
      void nestAiInfluencerTopicDiscoveryStatus(apiAccessToken).then((status) => {
        if (!status) return;
        setDiscoveryPhase(status.phase);
        setDiscoveryMessage(status.message);
        if (status.phase === 'done' || status.phase === 'error' || status.phase === 'idle') {
          setDiscoverBusy(false);
          void load();
        }
      });
    }, 2500);
    return () => clearInterval(timer);
  }, [apiAccessToken, discoverBusy, discoveryPhase, load]);

  const topItems = useMemo(
    () => [...items].sort((a, b) => b.totalScore - a.totalScore).slice(0, 12),
    [items],
  );

  async function handleAnalyzeUrl() {
    const url = urlInput.trim();
    if (!url) {
      onToast('Vložte platnou URL.');
      return;
    }
    setUrlBusy(true);
    const result = await nestAiInfluencerAnalyzeTopicUrl(apiAccessToken, url);
    setUrlBusy(false);
    if (result.error) {
      onToast(result.error);
      return;
    }
    if (result.data?.duplicate) {
      onToast('DUPLICATE — toto téma už bylo zpracováno.');
      setFilter('all');
      void load();
      return;
    }
    onToast('Návrh z URL vytvořen — HeyGen kredit nebyl použit.');
    setUrlInput('');
    setFilter('url');
    void load();
  }

  async function handleDiscover() {
    setDiscoverBusy(true);
    setDiscoveryPhase('searching');
    setDiscoveryMessage('Hledám témata…');
    const result = await nestAiInfluencerDiscoverTopics(apiAccessToken);
    if (result.error) {
      setDiscoverBusy(false);
      onToast(result.error);
      return;
    }
    onToast(result.data?.message ?? 'Discovery spuštěno');
  }

  async function openPreview(candidate: AiInfluencerTopicCandidateRow) {
    setPreviewBusy(candidate.id);
    const result = await nestAiInfluencerTopicScriptPreview(apiAccessToken, candidate.id);
    setPreviewBusy(null);
    if (result.error || !result.data) {
      onToast(result.error ?? 'Náhled scénáře selhal.');
      return;
    }
    setPreview(result.data);
  }

  async function openCostModal(candidate: AiInfluencerTopicCandidateRow) {
    const estimate = await nestAiInfluencerTopicCostEstimate(apiAccessToken, candidate.id);
    if (!estimate) {
      onToast('Nepodařilo se odhadnout náklady.');
      return;
    }
    setCostModal({ candidate, estimate });
  }

  async function confirmStartVideo() {
    if (!costModal) return;
    if (generationBlocked) {
      onToast('Aktuálně se vyrábí jiné video.');
      return;
    }
    setStartBusy(true);
    const result = await nestAiInfluencerStartTopicVideo(apiAccessToken, costModal.candidate.id);
    setStartBusy(false);
    setCostModal(null);
    setPreview(null);
    if (result.error || !result.data) {
      onToast(result.error ?? 'Spuštění výroby selhalo.');
      return;
    }
    onToast(`Výroba spuštěna — job ${result.data.jobId}`);
    onVideoStarted?.(result.data.jobId);
    void load();
  }

  async function handleReject(id: string) {
    const result = await nestAiInfluencerRejectTopicCandidate(apiAccessToken, id, 'Ignorováno administrátorem');
    if (result.error) {
      onToast(result.error);
      return;
    }
    onToast('Návrh ignorován.');
    void load();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4">
        <h2 className="text-base font-bold text-orange-950">VYTVOŘIT VIDEO Z ODKAZU</h2>
        <p className="mt-1 text-xs text-orange-900">
          Vložte odkaz na veřejný článek, nabídku nebo web — AI připraví návrh scénáře bez HeyGen kreditu.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://…"
            className="flex-1 rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={urlBusy}
            onClick={() => void handleAnalyzeUrl()}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {urlBusy ? 'Analyzuji…' : 'ANALYZOVAT ODKAZ'}
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            🔥 DNES PRO VÁS AI NAŠLA {todayCount} TÉMAT
          </h2>
          <p className="text-xs text-zinc-500">
            AI Lovec témat: {topicHunterEnabled ? 'ZAPNUTO' : 'VYPNUTO'} · Nalezení témat neodebírá HeyGen kredit
          </p>
        </div>
        <button
          type="button"
          disabled={discoverBusy}
          onClick={() => void handleDiscover()}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
        >
          {discoverBusy ? 'Probíhá hledání…' : '🔎 NAJÍT NOVÁ TÉMATA TEĎ'}
        </button>
      </div>

      {discoveryMessage && discoverBusy ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {discoveryPhase === 'searching' ? 'Searching…' : discoveryPhase === 'analyzing' ? 'Analyzing…' :
           discoveryPhase === 'fact_checking' ? 'Fact checking…' : discoveryPhase === 'scoring' ? 'Scoring…' :
           discoveryPhase} — {discoveryMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f.id ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Načítám návrhy…
        </div>
      ) : topItems.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
          Zatím žádná témata. Spusťte hledání nebo vložte URL článku.
        </p>
      ) : (
        <div className="space-y-3">
          {topItems.map((candidate) => {
            const facts = extractFacts(candidate);
            const sources = sourceCount(candidate);
            const confidenceOk = candidate.confidenceScore >= 70 && sources >= 2;
            return (
              <article
                key={candidate.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-orange-700">
                      🔥 {candidate.totalScore}/100 · {scoreLabel(candidate.totalScore)}
                    </p>
                    {candidate.trendDetected ? (
                      <p className="mt-0.5 text-xs font-semibold text-red-600">TREND DETECTED</p>
                    ) : null}
                    <h3 className="mt-1 text-base font-semibold text-zinc-900">{candidate.title}</h3>
                    {candidate.summary ? (
                      <p className="mt-1 text-sm text-zinc-600 line-clamp-2">{candidate.summary}</p>
                    ) : null}
                  </div>
                  <p className="text-xs text-zinc-500">Nalezeno: {formatWhen(candidate.discoveredAt)}</p>
                </div>

                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  {facts.location ? (
                    <p>
                      <span className="text-zinc-500">Lokalita:</span> {facts.location}
                    </p>
                  ) : candidate.region ? (
                    <p>
                      <span className="text-zinc-500">Region:</span> {candidate.region}
                    </p>
                  ) : null}
                  {facts.price ? (
                    <p>
                      <span className="text-zinc-500">Cena:</span> {facts.price}
                    </p>
                  ) : null}
                  {facts.area ? (
                    <p>
                      <span className="text-zinc-500">Plocha:</span> {facts.area}
                    </p>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
                  <span>Zdroje: {sources}</span>
                  <span>{confidenceOk ? '✓ vysoká důvěryhodnost' : '⚠ pouze jeden zdroj'}</span>
                  <button
                    type="button"
                    className="text-orange-700 underline"
                    onClick={() => setExpandedSources(expandedSources === candidate.id ? null : candidate.id)}
                  >
                    Zobrazit zdroje
                  </button>
                </div>

                {expandedSources === candidate.id ? (
                  <div className="mt-2 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
                    <p className="font-semibold">ZDROJ 1 — {candidate.sourceName ?? 'Web'}</p>
                    {candidate.sourceUrl ? (
                      <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="text-orange-700 underline break-all">
                        {candidate.sourceUrl}
                      </a>
                    ) : null}
                    {candidate.scoreExplanation ? (
                      <p className="mt-2 italic">{candidate.scoreExplanation}</p>
                    ) : null}
                  </div>
                ) : null}

                {candidate.proposedHook ? (
                  <p className="mt-2 text-sm">
                    <span className="font-medium text-zinc-700">AI návrh titulku/hook:</span>{' '}
                    „{candidate.proposedHook}“
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-zinc-500">
                  Doporučená délka: {candidate.estimatedDurationSec ?? 35} s
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={previewBusy === candidate.id}
                    onClick={() => void openPreview(candidate)}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-60"
                  >
                    {previewBusy === candidate.id ? 'Načítám…' : '👁 Náhled scénáře'}
                  </button>
                  <button
                    type="button"
                    disabled={generationBlocked || candidate.status === 'VIDEO_QUEUED' || candidate.status === 'VIDEO_CREATED'}
                    onClick={() => void openCostModal(candidate)}
                    className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    🎬 VYTVOŘIT VIDEO
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReject(candidate.id)}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
                  >
                    🗑 Ignorovat
                  </button>
                </div>
                {generationBlocked ? (
                  <p className="mt-2 text-xs text-orange-700">Aktuálně se vyrábí jiné video.</p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Náhled scénáře</h3>
            <p className="mt-1 text-xs text-zinc-500">
              HeyGen kredit se neodečte, dokud nepotvrdíte „Spustit výrobu videa“.
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <p>
                <span className="font-medium">Hook:</span> {preview.script.hook ?? '—'}
              </p>
              <p>
                <span className="font-medium">Titulek:</span> {preview.script.captionTitle ?? preview.candidate.proposedTitle}
              </p>
              <p>
                <span className="font-medium">Délka:</span> ~{preview.script.estimatedDuration ?? preview.candidate.estimatedDurationSec ?? 35} s
              </p>
              <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs whitespace-pre-wrap">
                {preview.script.spokenText ?? preview.script.intro ?? '—'}
              </pre>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              >
                Zavřít
              </button>
              <button
                type="button"
                disabled={generationBlocked}
                onClick={() => void openCostModal(preview.candidate)}
                className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Spustit výrobu videa
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {costModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Potvrzení výroby</h3>
            <div className="mt-3 space-y-1 text-sm text-zinc-700">
              <p>Odhad délky: ~{costModal.estimate.estimatedDurationSec} sekund</p>
              <p>Poskytovatel: {costModal.estimate.provider}</p>
              <p>Režim: {costModal.estimate.mode}</p>
              <p>
                Odhadované náklady: {costModal.estimate.estimatedCostCzk.toFixed(2)} Kč ({costModal.estimate.label})
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setCostModal(null)}
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              >
                ZRUŠIT
              </button>
              <button
                type="button"
                disabled={startBusy || generationBlocked}
                onClick={() => void confirmStartVideo()}
                className="flex-1 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {startBusy ? 'Spouštím…' : 'SPUSTIT VÝROBU'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AiTopicHunterSettingsSection({
  apiAccessToken,
  settings,
  onUpdated,
}: {
  apiAccessToken: string;
  settings: {
    topicHunter?: {
      enabled?: boolean;
      searchIntervalHours?: number;
      minTotalScore?: number;
      maxProposalsPerDay?: number;
      autoCreateVideo?: boolean;
      regions?: Record<string, boolean>;
      categories?: Record<string, boolean>;
      lastRunAt?: string | null;
      lastRunStatus?: string | null;
    };
  } | null;
  onUpdated: () => void;
}) {
  const th = settings?.topicHunter;
  if (!th) return null;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">AI Lovec témat</h2>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={th.enabled ?? false}
            onChange={(e) =>
              void nestAiInfluencerUpdateSettings(apiAccessToken, {
                topicHunter: { ...th, enabled: e.target.checked },
              }).then(onUpdated)
            }
          />
          AI Lovec témat
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={th.autoCreateVideo ?? false}
            onChange={(e) =>
              void nestAiInfluencerUpdateSettings(apiAccessToken, {
                topicHunter: { ...th, autoCreateVideo: e.target.checked },
              }).then(onUpdated)
            }
          />
          Automaticky vytvořit video
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-zinc-600">
          Hledat každých (hodin)
          <input
            type="number"
            min={1}
            max={24}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
            defaultValue={th.searchIntervalHours ?? 3}
            onBlur={(e) =>
              void nestAiInfluencerUpdateSettings(apiAccessToken, {
                topicHunter: { ...th, searchIntervalHours: Number(e.target.value) || 3 },
              }).then(onUpdated)
            }
          />
        </label>
        <label className="text-xs text-zinc-600">
          Min. XXREALIT score
          <input
            type="number"
            min={0}
            max={100}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
            defaultValue={th.minTotalScore ?? 75}
            onBlur={(e) =>
              void nestAiInfluencerUpdateSettings(apiAccessToken, {
                topicHunter: { ...th, minTotalScore: Number(e.target.value) || 75 },
              }).then(onUpdated)
            }
          />
        </label>
        <label className="text-xs text-zinc-600">
          Max návrhů denně
          <input
            type="number"
            min={1}
            max={50}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
            defaultValue={th.maxProposalsPerDay ?? 10}
            onBlur={(e) =>
              void nestAiInfluencerUpdateSettings(apiAccessToken, {
                topicHunter: { ...th, maxProposalsPerDay: Number(e.target.value) || 10 },
              }).then(onUpdated)
            }
          />
        </label>
      </div>
      {th.lastRunStatus ? (
        <p className="mt-2 text-xs text-zinc-500">
          Poslední běh: {th.lastRunAt ? formatWhen(th.lastRunAt) : '—'} · {th.lastRunStatus}
        </p>
      ) : null}
    </section>
  );
}
