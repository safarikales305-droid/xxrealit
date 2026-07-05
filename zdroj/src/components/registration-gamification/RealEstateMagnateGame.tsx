'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  nestRegistrationGamificationCheckEmail,
  nestRegistrationGamificationEvent,
  nestRegistrationGamificationSubmitLead,
  type RegistrationGamificationPublicSettings,
} from '@/lib/nest-client';
import {
  getGamificationSessionId,
  getGamificationVisitorKey,
  getUtmAndReferer,
  markGamificationCompleted,
  unlockPageScrollForGamification,
} from '@/lib/registration-gamification-store';

type DecisionAction = 'buy' | 'invest' | 'sell' | 'build' | 'skip';

type Phase = 'intro' | 'playing' | 'result' | 'form' | 'thanks';

type Props = {
  settings: RegistrationGamificationPublicSettings;
  onClose: () => void;
};

function detectVisitorType(scores: Record<DecisionAction, number>): string {
  const ranked = [
    ['buy', scores.buy],
    ['invest', scores.invest],
    ['sell', scores.sell],
    ['build', scores.build],
  ] as Array<[DecisionAction, number]>;
  ranked.sort((a, b) => b[1] - a[1]);
  const top = ranked[0]?.[1] ?? 0;
  if (top <= 0) return 'MIXED';
  const winners = ranked.filter(([, v]) => v === top);
  if (winners.length > 1) return 'MIXED';
  const key = winners[0]?.[0];
  if (key === 'buy') return 'BUYER';
  if (key === 'invest') return 'INVESTOR';
  if (key === 'sell') return 'AGENT';
  if (key === 'build') return 'DEVELOPER';
  return 'MIXED';
}

const ACTION_POINTS: Record<DecisionAction, number> = {
  buy: 10,
  invest: 12,
  sell: 11,
  build: 11,
  skip: 0,
};

type NavTarget = 'register' | 'login';

export function RealEstateMagnateGame({ settings, onClose }: Props) {
  const router = useRouter();
  const cfg = settings.config;
  const colors = cfg.colors;
  const decisionsTarget = settings.decisionsCount;
  const offers = cfg.offers;

  const [phase, setPhase] = useState<Phase>('intro');
  const [offerIndex, setOfferIndex] = useState(0);
  const [decisions, setDecisions] = useState<Array<{ offerId: string; action: DecisionAction }>>([]);
  const [scores, setScores] = useState<Record<DecisionAction, number>>({
    buy: 0,
    invest: 0,
    sell: 0,
    build: 0,
    skip: 0,
  });
  const [totalScore, setTotalScore] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [showConfetti, setShowConfetti] = useState(false);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [suggestLogin, setSuggestLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [navigating, setNavigating] = useState<NavTarget | null>(null);
  const [bonusCredits, setBonusCredits] = useState(settings.bonusCredits);
  const [thankYou, setThankYou] = useState({ title: cfg.thankYouTitle, subtitle: cfg.thankYouSubtitle });

  const visitorType = useMemo(() => detectVisitorType(scores), [scores]);
  const resultPage = cfg.resultPages[visitorType] ?? cfg.resultPages.MIXED;
  const currentOffer = offers[offerIndex % offers.length];

  const sessionId = useMemo(() => getGamificationSessionId(), []);
  const visitorKey = useMemo(() => getGamificationVisitorKey(), []);

  useEffect(() => {
    void nestRegistrationGamificationEvent({
      eventType: 'game_started',
      visitorKey,
      sessionId,
      pagePath: typeof window !== 'undefined' ? window.location.pathname : '',
    });
    return () => {
      unlockPageScrollForGamification();
    };
  }, [sessionId, visitorKey]);

  const buildAuthUrl = useCallback(
    (target: NavTarget) => {
      const trimmed = email.trim();
      const params = new URLSearchParams();
      if (trimmed) params.set('email', trimmed);
      params.set('source', 'game');
      if (target === 'register') params.set('visitorType', visitorType);
      const path = target === 'register' ? '/registrace' : '/prihlaseni';
      return `${path}?${params.toString()}`;
    },
    [email, visitorType],
  );

  const navigateAway = useCallback(
    (target: NavTarget) => {
      if (navigating) return;
      setNavigating(target);
      const targetUrl = buildAuthUrl(target);
      const startUrl = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
      unlockPageScrollForGamification();
      onClose();
      window.requestAnimationFrame(() => {
        try {
          router.push(targetUrl);
        } catch {
          window.location.href = targetUrl;
          return;
        }
        window.setTimeout(() => {
          if (typeof window === 'undefined') return;
          const currentUrl = window.location.pathname + window.location.search;
          if (currentUrl === startUrl) {
            window.location.href = targetUrl;
          }
        }, 750);
      });
    },
    [buildAuthUrl, navigating, onClose, router],
  );

  const handleClose = useCallback(() => {
    unlockPageScrollForGamification();
    onClose();
  }, [onClose]);

  const finishGame = useCallback(() => {
    setShowConfetti(true);
    void nestRegistrationGamificationEvent({
      eventType: 'game_completed',
      visitorKey,
      sessionId,
      metadata: { visitorType, score: totalScore },
    });
    setTimeout(() => {
      setPhase('result');
      setShowConfetti(false);
    }, 1800);
  }, [sessionId, totalScore, visitorKey, visitorType]);

  const handleDecision = useCallback(
    (action: DecisionAction) => {
      if (!currentOffer) return;
      const pts = ACTION_POINTS[action];
      setScores((prev) => ({ ...prev, [action]: prev[action] + (action === 'skip' ? 0 : 1) }));
      setTotalScore((s) => s + pts);
      setDecisions((d) => [...d, { offerId: currentOffer.id, action }]);
      const nextCount = decisions.length + 1;
      if (nextCount >= decisionsTarget) {
        finishGame();
        return;
      }
      setOfferIndex((i) => i + 1);
    },
    [currentOffer, decisions.length, decisionsTarget, finishGame],
  );

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    setSuggestLogin(false);
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFormErr('Zadejte platný e-mail.');
      return;
    }
    setBusy(true);
    const check = await nestRegistrationGamificationCheckEmail(trimmed);
    if (check?.suggestLogin) {
      setBusy(false);
      setSuggestLogin(true);
      setFormErr('Tento e-mail je již registrován. Přihlaste se prosím.');
      return;
    }
    const utm = getUtmAndReferer();
    const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const res = await nestRegistrationGamificationSubmitLead({
      email: trimmed,
      phone: phone.trim() || undefined,
      fullName: fullName.trim() || undefined,
      companyName: companyName.trim() || undefined,
      visitorType,
      score: totalScore,
      gameDurationSec: durationSec,
      decisions,
      gameResult: { scores, visitorType },
      gameSessionId: sessionId,
      visitorKey,
      ...utm,
      visitSource: 'gamification_real_estate_magnate',
    });
    setBusy(false);
    if (!res.ok) {
      if (res.suggestLogin) {
        setSuggestLogin(true);
        setFormErr(res.message ?? 'E-mail je již registrován.');
        return;
      }
      setFormErr(res.error ?? 'Odeslání se nepodařilo.');
      return;
    }
    markGamificationCompleted();
    if (res.bonusCredits != null) setBonusCredits(res.bonusCredits);
    setThankYou({
      title: res.thankYouTitle ?? cfg.thankYouTitle,
      subtitle: res.thankYouSubtitle ?? cfg.thankYouSubtitle,
    });
    setPhase('thanks');
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gamification-game-title"
    >
      <div
        className="relative z-[101] flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-none shadow-2xl sm:max-h-[92vh] sm:rounded-3xl"
        style={{ background: `linear-gradient(160deg, ${colors.background} 0%, ${colors.secondary} 100%)` }}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 z-20 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white backdrop-blur hover:bg-white/20"
        >
          Zavřít
        </button>

        {showConfetti ? (
          <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
            {Array.from({ length: 40 }).map((_, i) => (
              <span
                key={i}
                className="absolute animate-bounce text-2xl"
                style={{
                  left: `${(i * 17) % 100}%`,
                  top: `${(i * 13) % 60}%`,
                  animationDelay: `${(i % 5) * 0.1}s`,
                }}
              >
                {['🎉', '✨', '🏠', '💰', '⭐'][i % 5]}
              </span>
            ))}
          </div>
        ) : null}

        <div className="border-b border-white/10 px-5 pb-3 pt-5 text-white">
          <div className="flex items-center justify-between gap-3 pr-16">
            <h2 id="gamification-game-title" className="text-lg font-bold leading-tight sm:text-xl">{cfg.gameTitle}</h2>
            <div
              className="rounded-full px-3 py-1 text-xs font-bold tabular-nums"
              style={{ background: colors.accent, color: colors.background }}
            >
              {totalScore} bodů
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (decisions.length / decisionsTarget) * 100)}%`,
                background: colors.primary,
              }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-white">
          {phase === 'intro' ? (
            <div className="space-y-4 text-center">
              <div className="text-6xl animate-pulse">🏙️</div>
              <p className="text-sm leading-relaxed text-white/85 sm:text-base">{cfg.introText}</p>
              <p className="text-xs text-white/60">
                Rozhodnete o {decisionsTarget} nabídkách · cca {decisionsTarget * settings.offerIntervalSec}–
                {decisionsTarget * settings.offerIntervalSec + 30} sekund
              </p>
              <button
                type="button"
                className="w-full rounded-2xl px-4 py-4 text-base font-bold text-white shadow-lg transition hover:scale-[1.02]"
                style={{ background: colors.primary }}
                onClick={() => setPhase('playing')}
              >
                Začít hru
              </button>
            </div>
          ) : null}

          {phase === 'playing' && currentOffer ? (
            <div className="space-y-4 transition-opacity duration-300">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="flex items-start gap-3">
                  <span className="text-4xl">{currentOffer.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold">{currentOffer.title}</h3>
                    <p className="text-sm text-white/70">
                      {currentOffer.city} · <strong className="text-white">{currentOffer.price}</strong>
                    </p>
                    <p className="mt-2 text-sm text-white/80">{currentOffer.description}</p>
                  </div>
                </div>
                {currentOffer.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentOffer.imageUrl}
                    alt=""
                    className="mt-3 h-36 w-full rounded-xl object-cover"
                  />
                ) : (
                  <div
                    className="mt-3 flex h-36 items-center justify-center rounded-xl text-5xl"
                    style={{ background: `${colors.primary}33` }}
                  >
                    {currentOffer.emoji}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    ['buy', cfg.buttons.buy],
                    ['invest', cfg.buttons.invest],
                    ['sell', cfg.buttons.sell],
                    ['build', cfg.buttons.build],
                  ] as const
                ).map(([action, label]) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => handleDecision(action)}
                    className="rounded-2xl border border-white/15 bg-white/10 px-3 py-4 text-left text-sm font-bold transition hover:scale-[1.02] hover:bg-white/20 sm:text-base"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleDecision('skip')}
                className="w-full rounded-xl py-2 text-sm font-semibold text-white/60 hover:text-white"
              >
                {cfg.buttons.skip}
              </button>
              <p className="text-center text-xs text-white/50">
                Nabídka {decisions.length + 1} / {decisionsTarget}
              </p>
            </div>
          ) : null}

          {phase === 'result' && resultPage ? (
            <div className="space-y-4 text-center">
              <div className="text-5xl">🎉</div>
              <h3 className="text-2xl font-bold">{resultPage.title}</h3>
              <p className="text-white/80">{resultPage.subtitle}</p>
              <ul className="space-y-2 text-left text-sm text-white/85">
                {resultPage.bullets.map((b) => (
                  <li key={b} className="flex gap-2 rounded-xl bg-white/5 px-3 py-2">
                    <span>✔</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div
                className="rounded-2xl border border-white/10 p-4"
                style={{ background: `${colors.accent}22` }}
              >
                <p className="font-bold">{cfg.rewardTitle}</p>
                <p className="mt-1 text-sm text-white/80">
                  {settings.bonusDescription} — až {settings.bonusCredits} kreditů
                </p>
              </div>
              <button
                type="button"
                className="w-full rounded-2xl px-4 py-4 text-base font-bold text-white"
                style={{ background: colors.primary }}
                onClick={() => setPhase('form')}
              >
                Získat odměnu
              </button>
            </div>
          ) : null}

          {phase === 'form' ? (
            <form className="space-y-4" onSubmit={(e) => void submitForm(e)}>
              <div className="text-center">
                <h3 className="text-xl font-bold">{cfg.formTitle}</h3>
                <p className="mt-1 text-sm text-white/75">{cfg.formSubtitle}</p>
              </div>
              <label className="block text-xs font-bold uppercase tracking-wide text-white/70">
                Jméno (volitelné)
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-base text-white placeholder:text-white/40"
                  placeholder="Jan Novák"
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-white/70">
                Firma (volitelné)
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-base text-white placeholder:text-white/40"
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-white/70">
                Telefon (volitelné)
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-base text-white placeholder:text-white/40"
                  placeholder="+420…"
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-amber-300">
                E-mail *
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-amber-400/60 bg-white px-4 py-4 text-lg font-medium text-zinc-900"
                  placeholder="vas@email.cz"
                />
              </label>
              {formErr ? (
                <p className="rounded-lg border border-red-400/40 bg-red-500/20 px-3 py-2 text-sm text-red-100">
                  {formErr}
                </p>
              ) : null}
              {suggestLogin ? (
                <button
                  type="button"
                  onClick={() => navigateAway('login')}
                  disabled={navigating === 'login'}
                  className="w-full rounded-xl bg-white px-4 py-3 text-center font-bold text-zinc-900 disabled:opacity-70"
                >
                  {navigating === 'login' ? 'Přesměrovávám…' : 'Přihlásit se'}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-2xl px-4 py-4 text-base font-bold text-white disabled:opacity-60"
                  style={{ background: colors.primary }}
                >
                  {busy ? 'Odesílám…' : 'Získat dárek'}
                </button>
              )}
            </form>
          ) : null}

          {phase === 'thanks' ? (
            <div className="space-y-4 text-center">
              <div className="text-5xl">🎁</div>
              <h3 className="text-2xl font-bold">{thankYou.title}</h3>
              <p className="text-white/85">{thankYou.subtitle}</p>
              <p className="rounded-xl bg-white/10 px-4 py-3 text-sm">
                Bonus: <strong>{bonusCredits}</strong> kreditů · {settings.bonusDescription}
              </p>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => navigateAway('register')}
                  disabled={navigating !== null}
                  className="rounded-2xl px-4 py-3 font-bold text-white transition hover:opacity-95 disabled:opacity-70"
                  style={{ background: colors.primary }}
                >
                  {navigating === 'register' ? 'Přesměrovávám…' : 'Dokončit registraci'}
                </button>
                <button
                  type="button"
                  onClick={() => navigateAway('login')}
                  disabled={navigating !== null}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 font-semibold transition hover:bg-white/15 disabled:opacity-70"
                >
                  {navigating === 'login' ? 'Přesměrovávám…' : 'Přihlásit se'}
                </button>
              </div>
              <p className="text-xs text-white/50">
                Google / Facebook / Apple — přihlášení na stránce registrace
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
