'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  createAiRenovationEstimate,
  createAiRenovationProjectEstimate,
  fetchRenovationCompanies,
  formatCzkAmount,
  formatCzkRange,
  sendAiRenovationRequest,
  trackAiVisualizationEvent,
  type AiRenovationEstimate,
  type AiVisualizationConfig,
  type AiVisualizationView,
  type RenovationCompanyOption,
  countCompletedRoots,
} from '@/lib/ai-visualization-client';

type EstimateScope = 'single' | 'project';

type MaterialTier = 'ECONOMY' | 'STANDARD' | 'PREMIUM';

type Props = {
  viz: AiVisualizationView;
  config: AiVisualizationConfig | null;
  propertyTypeLabel: string;
  styleLabel: string;
  sessionItems?: AiVisualizationView[];
  openEstimateToken?: number;
  openContractorsToken?: number;
  hideInitialCta?: boolean;
  onEstimateSaved?: (estimate: AiRenovationEstimate) => void;
};

type FunnelStep = 'cta' | 'form' | 'budget' | 'email' | 'companies' | 'done';

export function AiRenovationFunnel({
  viz,
  config,
  propertyTypeLabel,
  styleLabel,
  sessionItems = [],
  openEstimateToken = 0,
  openContractorsToken = 0,
  hideInitialCta = false,
  onEstimateSaved,
}: Props) {
  const { isAuthenticated, user } = useAuth();
  const [step, setStep] = useState<FunnelStep>('cta');
  const [location, setLocation] = useState('');
  const [areaSqm, setAreaSqm] = useState('');
  const [scopePartial, setScopePartial] = useState(false);
  const [materialTier, setMaterialTier] = useState<MaterialTier>('STANDARD');
  const [estimate, setEstimate] = useState<AiRenovationEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);

  const [email, setEmail] = useState('');
  const [transferConsent, setTransferConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [companies, setCompanies] = useState<RenovationCompanyOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentUrl, setSentUrl] = useState<string | null>(null);
  const [description, setDescription] = useState(viz.userPrompt ?? '');
  const [estimateScope, setEstimateScope] = useState<EstimateScope>('single');

  const completedRoots = countCompletedRoots(sessionItems.length ? sessionItems : [viz]);
  const canProjectEstimate = completedRoots > 1;

  useEffect(() => {
    if (openEstimateToken > 0) setStep('form');
  }, [openEstimateToken]);

  useEffect(() => {
    if (isAuthenticated && user?.email) setEmail(user.email);
  }, [isAuthenticated, user?.email]);

  const defaultArea = useMemo(() => {
    const pt = viz.propertyType ?? 'living_room';
    if (pt === 'bathroom') return '8';
    if (pt === 'kitchen') return '14';
    if (pt === 'exterior' || pt === 'garden') return '120';
    if (pt === 'apartment') return '65';
    return '24';
  }, [viz.propertyType]);

  useEffect(() => {
    if (!areaSqm) setAreaSqm(defaultArea);
  }, [defaultArea, areaSqm]);

  const runEstimate = async () => {
    setLoadingEstimate(true);
    setEstimateError(null);
    const area = Number(areaSqm.replace(',', '.'));
    if (!Number.isFinite(area) || area <= 0) {
      setEstimateError('Zadejte platnou plochu v m².');
      setLoadingEstimate(false);
      return;
    }
    const res =
      estimateScope === 'project' && canProjectEstimate
        ? await createAiRenovationProjectEstimate({
            primaryVisualizationId: viz.id,
            location: location.trim() || undefined,
            areaSqm: area,
            scopePartial,
            materialTier,
          })
        : await createAiRenovationEstimate({
            visualizationId: viz.id,
            location: location.trim() || undefined,
            areaSqm: area,
            scopePartial,
            materialTier,
          });
    setLoadingEstimate(false);
    if ('message' in res) {
      setEstimateError(res.message);
      return;
    }
    setEstimate(res.data);
    onEstimateSaved?.(res.data);
    setStep('budget');
  };

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    setCompaniesError(null);
    const res = await fetchRenovationCompanies({
      visualizationId: viz.id,
      location: location.trim() || estimate?.location || undefined,
    });
    setLoadingCompanies(false);
    if ('message' in res) {
      setCompaniesError(res.message);
      return;
    }
    const items = res.data.items;
    setCompanies(items);
    setSelectedIds(new Set(items.map((c) => c.id)));
    if (items.length === 0) {
      setCompaniesError('Nenašli jsme vhodné firmy pro zadanou lokalitu. Zkuste upřesnit město.');
    }
  }, [viz.id, location, estimate?.location]);

  const goToCompanies = async () => {
    if (!isAuthenticated) {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed.includes('@') || !trimmed.includes('.')) {
        setEmailError('Zadejte platný e-mail.');
        return;
      }
      if (!transferConsent) {
        setEmailError('Potvrďte souhlas s předáním údajů firmám.');
        return;
      }
      setEmailError(null);
    }
    setStep('companies');
    await loadCompanies();
  };

  useEffect(() => {
    if (openContractorsToken <= 0) return;
    if (estimate) void goToCompanies();
    else setStep('form');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openContractorsToken]);

  const toggleCompany = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendRequest = async () => {
    if (!estimate || sending) return;
    const ids = [...selectedIds];
    if (ids.length === 0) {
      setSendError('Vyberte alespoň jednu firmu.');
      return;
    }
    if (!isAuthenticated && !transferConsent) {
      setSendError('Potvrďte souhlas s předáním údajů.');
      return;
    }
    setSending(true);
    setSendError(null);
    const idempotencyKey = `renov-${viz.id}-${estimate.id}-${crypto.randomUUID()}`;
    const res = await sendAiRenovationRequest({
      visualizationId: viz.id,
      estimateId: estimate.id,
      email: isAuthenticated ? undefined : email.trim(),
      companyIds: ids,
      transferConsent: isAuthenticated ? true : transferConsent,
      marketingConsent,
      idempotencyKey,
      description: description.trim() || undefined,
    });
    setSending(false);
    if ('message' in res) {
      setSendError(res.message);
      return;
    }
    trackAiVisualizationEvent({
      eventName: 'renovation_request_sent',
      visualizationId: viz.id,
      meta: { publicId: res.data.publicId },
    });
    setSentUrl(res.data.poptavkaUrl);
    setStep('done');
  };

  const lineItems = (estimate?.lineItems ?? []) as Array<{
    label: string;
    amountMin: number;
    amountMax: number;
  }>;

  if (step === 'done' && sentUrl) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <p className="text-lg font-bold text-emerald-900">Poptávka byla odeslána</p>
        <p className="mt-2 text-sm text-emerald-800">
          Oslovené firmy dostanou odkaz na detail. Odpovědi uvidíte e-mailem
          {isAuthenticated ? ' a v notifikacích XXREALIT' : ''}.
        </p>
        <Link href={sentUrl} className="mt-4 inline-block text-sm font-semibold text-orange-700 underline">
          Otevřít detail poptávky
        </Link>
      </div>
    );
  }

  return (
    <div id="ai-renovation-funnel" className="mt-6 space-y-4">
      {step === 'cta' && !hideInitialCta ? (
        <div className="rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-white p-5 shadow-sm">
          <p className="text-base font-bold text-zinc-900">🏗️ Líbí se vám návrh?</p>
          <p className="mt-2 text-sm text-zinc-700">
            Zjistěte orientační cenu rekonstrukce a můžete rovnou oslovit stavební firmy.
          </p>
          <button
            type="button"
            onClick={() => setStep('form')}
            className="mt-4 w-full rounded-2xl bg-orange-600 py-4 text-base font-bold text-white shadow-md hover:bg-orange-700"
          >
            💰 Spočítat cenu rekonstrukce
          </button>
        </div>
      ) : null}

      {step === 'form' ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="font-bold text-zinc-900">Upřesněte projekt</p>
          {canProjectEstimate ? (
            <fieldset className="mt-3">
              <legend className="text-sm font-semibold text-zinc-800">Rozsah odhadu</legend>
              <div className="mt-2 space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={estimateScope === 'single'}
                    onChange={() => setEstimateScope('single')}
                  />
                  pouze tato vizualizace
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={estimateScope === 'project'}
                    onChange={() => setEstimateScope('project')}
                  />
                  celý projekt ({completedRoots} fotografií)
                </label>
              </div>
            </fieldset>
          ) : null}
          <p className="mt-1 text-xs text-zinc-600">Co rekonstruujete: {propertyTypeLabel}</p>
          <label className="mt-4 block text-sm font-semibold text-zinc-800">
            Přibližná velikost (m²)
            <input
              value={areaSqm}
              onChange={(e) => setAreaSqm(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-base"
            />
          </label>
          <label className="mt-3 block text-sm font-semibold text-zinc-800">
            Lokalita
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="např. Pardubice"
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-base"
            />
          </label>
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold text-zinc-800">Rozsah</legend>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={scopePartial} onChange={() => setScopePartial(true)} />
                částečná rekonstrukce
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={!scopePartial} onChange={() => setScopePartial(false)} />
                kompletní rekonstrukce
              </label>
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold text-zinc-800">Kvalita materiálů</legend>
            <div className="mt-2 space-y-2 text-sm">
              {(
                [
                  ['ECONOMY', 'ekonomická'],
                  ['STANDARD', 'standardní'],
                  ['PREMIUM', 'prémiová'],
                ] as const
              ).map(([id, label]) => (
                <label key={id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={materialTier === id}
                    onChange={() => setMaterialTier(id)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {estimateError ? <p className="mt-3 text-sm text-red-600">{estimateError}</p> : null}
          <button
            type="button"
            disabled={loadingEstimate}
            onClick={() => void runEstimate()}
            className="mt-4 w-full rounded-2xl bg-orange-600 py-3.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {loadingEstimate ? 'Počítám odhad…' : 'Vypočítat orientační rozpočet'}
          </button>
        </div>
      ) : null}

      {step === 'budget' && estimate ? (
        <>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-zinc-900">Orientační cena</p>
            <p className="mt-1 text-2xl font-bold text-orange-600">
              {formatCzkRange(estimate.estimateMin, estimate.estimateMax)}
            </p>
            <p className="mt-3 text-xs text-zinc-600">
              Jde o orientační AI odhad. Skutečnou cenu určí stavební firma podle zaměření, materiálů a
              stavu nemovitosti.
            </p>
            <ul className="mt-4 divide-y divide-zinc-100">
              {lineItems.map((line) => (
                <li key={line.label} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                  <span className="text-zinc-800">{line.label}</span>
                  <span className="font-semibold text-zinc-900">
                    {formatCzkRange(line.amountMin, line.amountMax)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-zinc-200 pt-3 text-sm">
              {estimate.reserveMin != null && estimate.reserveMax != null ? (
                <p className="flex justify-between text-zinc-700">
                  <span>Doporučená rezerva</span>
                  <span>{formatCzkRange(estimate.reserveMin, estimate.reserveMax)}</span>
                </p>
              ) : null}
              {estimate.totalMinWithReserve != null && estimate.totalMaxWithReserve != null ? (
                <p className="mt-1 flex justify-between font-bold text-zinc-900">
                  <span>Odhad včetně rezervy</span>
                  <span>{formatCzkRange(estimate.totalMinWithReserve, estimate.totalMaxWithReserve)}</span>
                </p>
              ) : null}
            </div>
            <p className="mt-2 text-[10px] text-zinc-500">Verze ceníku: {estimate.pricingVersion}</p>
          </div>

          <div className="rounded-2xl border-2 border-zinc-900 bg-zinc-900 p-5 text-white">
            <p className="font-bold">🏗️ Chcete skutečné nabídky?</p>
            <p className="mt-2 text-sm text-zinc-200">
              Pošlete poptávku stavebním firmám na XXREALIT a porovnejte jejich nabídky.
            </p>
            <button
              type="button"
              onClick={() => (isAuthenticated ? void goToCompanies() : setStep('email'))}
              className="mt-4 w-full rounded-2xl bg-orange-500 py-4 text-sm font-bold text-white hover:bg-orange-400"
            >
              🏗️ ROZESLAT STAVEBNÍM FIRMÁM
            </button>
          </div>
        </>
      ) : null}

      {step === 'email' ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="font-bold text-zinc-900">Kam vám mají přijít nabídky?</p>
          <label className="mt-3 block text-sm font-semibold">
            E-mail
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2.5"
            />
          </label>
          <label className="mt-3 flex gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={transferConsent} onChange={(e) => setTransferConsent(e.target.checked)} />
            <span>
              Souhlasím s předáním údajů vybraným stavebním firmám za účelem vyřízení této poptávky.
            </span>
          </label>
          <label className="mt-2 flex gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
            />
            <span>Chci také dostávat novinky a nabídky XXREALIT.</span>
          </label>
          {emailError ? <p className="mt-2 text-sm text-red-600">{emailError}</p> : null}
          <button
            type="button"
            onClick={() => void goToCompanies()}
            className="mt-4 w-full rounded-2xl bg-orange-600 py-3.5 text-sm font-bold text-white"
          >
            Pokračovat a vybrat firmy
          </button>
        </div>
      ) : null}

      {step === 'companies' ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="font-bold text-zinc-900">Stavební firmy pro váš projekt</p>
          <p className="mt-1 text-xs text-zinc-600">
            Styl: {styleLabel} · {propertyTypeLabel}
            {location ? ` · ${location}` : ''}
          </p>
          {loadingCompanies ? <p className="mt-4 text-sm text-zinc-600">Načítám firmy…</p> : null}
          {companiesError ? <p className="mt-4 text-sm text-amber-800">{companiesError}</p> : null}
          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {companies.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleCompany(c.id)}
                  />
                  <span>
                    <span className="block font-semibold text-zinc-900">{c.name}</span>
                    <span className="text-xs text-zinc-600">
                      {[c.city, c.region].filter(Boolean).join(', ') || 'ČR'}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {companies.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set(companies.map((c) => c.id)))}
              className="mt-2 text-xs font-semibold text-orange-700 underline"
            >
              Vybrat všechny relevantní
            </button>
          ) : null}
          <label className="mt-4 block text-sm">
            Popis požadavků (volitelné)
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          {sendError ? <p className="mt-2 text-sm text-red-600">{sendError}</p> : null}
          <button
            type="button"
            disabled={sending || companies.length === 0}
            onClick={() => void sendRequest()}
            className="mt-4 w-full rounded-2xl bg-orange-600 py-4 text-base font-bold text-white disabled:opacity-50"
          >
            {sending ? 'Odesílám…' : '📨 Odeslat poptávku'}
          </button>
        </div>
      ) : null}

      {step !== 'cta' && step !== 'done' ? (
        <button
          type="button"
          onClick={() => setStep(step === 'form' ? 'cta' : 'budget')}
          className="text-sm text-zinc-500 underline"
        >
          ← Zpět
        </button>
      ) : null}
    </div>
  );
}
