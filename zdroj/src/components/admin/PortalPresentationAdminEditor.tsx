'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TiptapEditor } from '@/components/admin/TiptapEditor';
import {
  bodyUsesRichEditor,
  PORTAL_PRESENTATION_ADMIN_GROUPS,
  sectionTypeLabel,
  sectionsForGroup,
  ungroupedSections,
  type PageFieldDef,
  type PresentationAdminGroup,
} from '@/lib/portal-presentation-admin-groups';
import type { PortalPresentationPage } from '@/lib/portal-presentation';
import {
  nestAdminDeletePresentationFaq,
  nestAdminGetPresentation,
  nestAdminUpdatePresentationPage,
  nestAdminUpsertPresentationFaq,
  nestAdminUpsertPresentationSection,
  type PortalPresentationPageRow,
} from '@/lib/nest-client';

type SectionDraft = {
  id: string;
  anchor: string;
  sectionType: string;
  title: string;
  subtitle: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
};

type FaqDraft = {
  id?: string;
  question: string;
  answerHtml: string;
};

type Props = {
  token: string;
};

const inputClass =
  'w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20';

function sectionToDraft(s: PortalPresentationPage['sections'][number]): SectionDraft {
  return {
    id: s.id,
    anchor: s.anchor,
    sectionType: s.sectionType,
    title: s.title,
    subtitle: s.subtitle ?? '',
    bodyHtml: s.bodyHtml,
    ctaLabel: s.ctaLabel ?? '',
    ctaUrl: s.ctaUrl ?? '',
  };
}

function PageFieldInput({
  field,
  value,
  onChange,
}: {
  field: PageFieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-zinc-800">{field.label}</label>
      {field.multiline ? (
        <textarea
          className={`${inputClass} min-h-[5rem] resize-y`}
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function SectionEditor({
  draft,
  busy,
  onChange,
  onSave,
}: {
  draft: SectionDraft;
  busy: boolean;
  onChange: (patch: Partial<SectionDraft>) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {sectionTypeLabel(draft.sectionType)} · #{draft.anchor}
        </p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-zinc-800">Název sekce</label>
        <input className={inputClass} value={draft.title} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-zinc-800">Podnadpis</label>
        <input
          className={inputClass}
          value={draft.subtitle}
          onChange={(e) => onChange({ subtitle: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-semibold text-zinc-800">
          {draft.sectionType === 'process'
            ? 'Kroky procesu (JSON)'
            : draft.sectionType === 'cta-grid'
              ? 'Tlačítka (JSON: label, url)'
              : 'Obsah sekce'}
        </label>
        {bodyUsesRichEditor(draft.sectionType) ? (
          <TiptapEditor
            label=""
            value={draft.bodyHtml}
            onChange={(html) => onChange({ bodyHtml: html })}
          />
        ) : (
          <textarea
            className={`${inputClass} min-h-[8rem] font-mono text-xs`}
            value={draft.bodyHtml}
            onChange={(e) => onChange({ bodyHtml: e.target.value })}
          />
        )}
      </div>
      {draft.sectionType !== 'cta-grid' && draft.sectionType !== 'process' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold text-zinc-800">Text tlačítka</label>
            <input
              className={inputClass}
              value={draft.ctaLabel}
              onChange={(e) => onChange({ ctaLabel: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-zinc-800">URL tlačítka</label>
            <input
              className={inputClass}
              value={draft.ctaUrl}
              onChange={(e) => onChange({ ctaUrl: e.target.value })}
            />
          </div>
        </div>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={onSave}
        className="rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
      >
        Uložit sekci
      </button>
    </div>
  );
}

function GroupPanel({
  group,
  page,
  token,
  busy,
  setBusy,
  setPage,
  setToast,
  setError,
  onRefresh,
  sectionDrafts,
  setSectionDrafts,
}: {
  group: PresentationAdminGroup;
  page: PortalPresentationPageRow;
  token: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setPage: React.Dispatch<React.SetStateAction<PortalPresentationPageRow | null>>;
  setToast: (v: string | null) => void;
  setError: (v: string | null) => void;
  onRefresh: () => Promise<void>;
  sectionDrafts: Record<string, SectionDraft>;
  setSectionDrafts: React.Dispatch<React.SetStateAction<Record<string, SectionDraft>>>;
}) {
  const [faqDraft, setFaqDraft] = useState<FaqDraft | null>(null);
  const [open, setOpen] = useState(group.id === 'hero');

  async function savePageFields(fields: PageFieldDef[]) {
    const patch: Record<string, string | undefined> = {};
    for (const f of fields) {
      patch[f.key] = (page[f.key as keyof PortalPresentationPageRow] as string | null) ?? '';
    }
    setBusy(true);
    setError(null);
    const res = await nestAdminUpdatePresentationPage(token, patch);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Uložení selhalo');
      return;
    }
    setPage(res.page ?? page);
    setToast(`${group.label} — uloženo`);
  }

  async function saveSection(draft: SectionDraft) {
    setBusy(true);
    setError(null);
    const res = await nestAdminUpsertPresentationSection(token, {
      id: draft.id,
      anchor: draft.anchor,
      sectionType: draft.sectionType,
      title: draft.title,
      subtitle: draft.subtitle || undefined,
      bodyHtml: draft.bodyHtml,
      ctaLabel: draft.ctaLabel || undefined,
      ctaUrl: draft.ctaUrl || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Uložení sekce selhalo');
      return;
    }
    setToast(`Sekce „${draft.title}“ uložena`);
    await onRefresh();
  }

  async function saveFaq() {
    if (!faqDraft?.question.trim()) return;
    setBusy(true);
    const res = await nestAdminUpsertPresentationFaq(token, {
      id: faqDraft.id,
      question: faqDraft.question,
      answerHtml: faqDraft.answerHtml,
    });
    setBusy(false);
    if (!res.ok) {
      setError('Uložení FAQ selhalo');
      return;
    }
    setFaqDraft(null);
    setToast('FAQ uloženo');
    await onRefresh();
  }

  const groupSections = sectionsForGroup(group, page.sections);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-zinc-50"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div>
          <h2 className="text-base font-bold text-zinc-900">{group.label}</h2>
          {group.description ? (
            <p className="mt-0.5 text-sm text-zinc-500">{group.description}</p>
          ) : null}
        </div>
        <span className="text-xl text-zinc-400">{open ? '−' : '+'}</span>
      </button>

      {open ? (
        <div className="space-y-5 border-t border-zinc-100 px-5 py-5">
          {group.pageFields?.map((field) => (
            <PageFieldInput
              key={field.key}
              field={field}
              value={(page[field.key as keyof PortalPresentationPageRow] as string | null) ?? ''}
              onChange={(v) => setPage({ ...page, [field.key]: v })}
            />
          ))}

          {group.pageFields?.length ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void savePageFields(group.pageFields!)}
              className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              Uložit texty skupiny
            </button>
          ) : null}

          {groupSections.map((s) => {
            const draft = sectionDrafts[s.id] ?? sectionToDraft(s);
            return (
              <SectionEditor
                key={s.id}
                draft={draft}
                busy={busy}
                onChange={(patch) =>
                  setSectionDrafts((prev) => ({
                    ...prev,
                    [s.id]: { ...draft, ...patch },
                  }))
                }
                onSave={() => void saveSection(sectionDrafts[s.id] ?? draft)}
              />
            );
          })}

          {group.kind === 'faq' ? (
            <div className="space-y-4">
              {page.faq.map((f) => (
                <div key={f.id} className="rounded-xl border border-zinc-200 p-4">
                  <p className="font-semibold text-zinc-900">{f.question}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="text-xs font-semibold text-orange-600"
                      onClick={() =>
                        setFaqDraft({ id: f.id, question: f.question, answerHtml: f.answerHtml })
                      }
                    >
                      Upravit
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-600"
                      onClick={async () => {
                        if (!confirm('Smazat otázku?')) return;
                        await nestAdminDeletePresentationFaq(token, f.id);
                        await onRefresh();
                      }}
                    >
                      Smazat
                    </button>
                  </div>
                </div>
              ))}

              {faqDraft ? (
                <div className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/40 p-4">
                  <input
                    className={inputClass}
                    placeholder="Otázka"
                    value={faqDraft.question}
                    onChange={(e) => setFaqDraft({ ...faqDraft, question: e.target.value })}
                  />
                  <TiptapEditor
                    label="Odpověď"
                    value={faqDraft.answerHtml}
                    onChange={(html) => setFaqDraft({ ...faqDraft, answerHtml: html })}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveFaq()}
                      className="rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-white"
                    >
                      Uložit FAQ
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-zinc-300 px-4 py-2 text-sm"
                      onClick={() => setFaqDraft(null)}
                    >
                      Zrušit
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="rounded-full border border-dashed border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600"
                  onClick={() => setFaqDraft({ question: '', answerHtml: '<p></p>' })}
                >
                  + Přidat otázku
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PortalPresentationAdminEditor({ token }: Props) {
  const [page, setPage] = useState<PortalPresentationPageRow | null>(null);
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, SectionDraft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await nestAdminGetPresentation(token);
    setPage(data);
    if (data) {
      const drafts: Record<string, SectionDraft> = {};
      for (const s of data.sections) drafts[s.id] = sectionToDraft(s);
      setSectionDrafts(drafts);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function savePublish() {
    if (!page) return;
    setBusy(true);
    const res = await nestAdminUpdatePresentationPage(token, { isPublished: page.isPublished });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Uložení selhalo');
      return;
    }
    setPage(res.page ?? page);
    setToast('Stav publikace uložen');
  }

  if (!page) {
    return <div className="p-8 text-sm text-zinc-500">Načítám obsah stránky…</div>;
  }

  const other = ungroupedSections(page.sections);
  const otherGroup: PresentationAdminGroup | null =
    other.length > 0
      ? {
          id: 'other',
          label: 'Ostatní sekce',
          description: 'Sekce mimo výchozí skupiny.',
          kind: 'sections',
          sectionAnchors: other.map((s) => s.anchor),
        }
      : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500">Nastavení</p>
          <h1 className="text-2xl font-bold text-zinc-900">O portálu</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Texty veřejné stránky{' '}
            <Link href="/o-portalu" target="_blank" className="font-semibold text-orange-600 hover:underline">
              /o-portalu
            </Link>
            . Změny se projeví po uložení (cache cca 60 s).
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
            page.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {page.isPublished ? 'Publikováno' : 'Koncept'}
        </span>
      </div>

      {toast ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {toast}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-800">
          <input
            type="checkbox"
            checked={page.isPublished}
            onChange={(e) => setPage({ ...page, isPublished: e.target.checked })}
          />
          Stránka je publikovaná na /o-portalu
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void savePublish()}
          className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-semibold"
        >
          Uložit stav
        </button>
      </div>

      <div className="space-y-4">
        {PORTAL_PRESENTATION_ADMIN_GROUPS.map((group) => (
          <GroupPanel
            key={group.id}
            group={group}
            page={page}
            token={token}
            busy={busy}
            setBusy={setBusy}
            setPage={setPage}
            setToast={setToast}
            setError={setError}
            onRefresh={refresh}
            sectionDrafts={sectionDrafts}
            setSectionDrafts={setSectionDrafts}
          />
        ))}

        {otherGroup ? (
          <GroupPanel
            group={otherGroup}
            page={page}
            token={token}
            busy={busy}
            setBusy={setBusy}
            setPage={setPage}
            setToast={setToast}
            setError={setError}
            onRefresh={refresh}
            sectionDrafts={sectionDrafts}
            setSectionDrafts={setSectionDrafts}
          />
        ) : null}
      </div>
    </div>
  );
}
