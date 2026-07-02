'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminCreateSupportEmailMailbox,
  nestAdminDeleteSupportEmailMailbox,
  nestAdminGetSupportEmailSettings,
  nestAdminListSupportEmailMailboxes,
  nestAdminPollSupportInbound,
  nestAdminUpdateSupportEmailMailbox,
  nestAdminUpdateSupportEmailSettings,
  type SupportEmailMailbox,
  type SupportEmailMailboxInput,
} from '@/lib/support-email-admin-api';

const EMPTY_FORM: SupportEmailMailboxInput = {
  label: '',
  email: '',
  replyToEmail: '',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  imapHost: '',
  imapPort: 993,
  imapSecure: true,
  imapUser: '',
  imapPassword: '',
  signatureHtml: '<p>S pozdravem<br/>Tým podpory</p>',
  signatureText: 'S pozdravem\nTým podpory',
  autoReplyEnabled: false,
  autoReplySubject: 'Potvrzení přijetí dotazu [Ticket #{{publicId}}]',
  autoReplyHtml:
    '<p>Dobrý den {{firstName}},</p><p>děkujeme za váš dotaz <strong>{{subject}}</strong>. Číslo ticketu: <strong>{{publicId}}</strong>.</p>',
  autoReplyText: '',
  isDefault: false,
  active: true,
  sortOrder: 0,
};

export default function AdminSupportEmailSettingsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [mailboxes, setMailboxes] = useState<SupportEmailMailbox[]>([]);
  const [adminNotifyEmail, setAdminNotifyEmail] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SupportEmailMailboxInput>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [settings, list] = await Promise.all([
      nestAdminGetSupportEmailSettings(token),
      nestAdminListSupportEmailMailboxes(token),
    ]);
    if (settings) setAdminNotifyEmail(settings.adminNotifyEmail ?? '');
    setMailboxes(list);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user?.role, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  function startCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, sortOrder: mailboxes.length });
    setShowForm(true);
    setError(null);
  }

  function startEdit(mb: SupportEmailMailbox) {
    setEditingId(mb.id);
    setForm({
      label: mb.label,
      email: mb.email,
      replyToEmail: mb.replyToEmail,
      smtpHost: mb.smtpHost,
      smtpPort: mb.smtpPort,
      smtpSecure: mb.smtpSecure,
      smtpUser: mb.smtpUser,
      imapHost: mb.imapHost,
      imapPort: mb.imapPort,
      imapSecure: mb.imapSecure,
      imapUser: mb.imapUser,
      signatureHtml: mb.signatureHtml,
      signatureText: mb.signatureText,
      autoReplyEnabled: mb.autoReplyEnabled,
      autoReplySubject: mb.autoReplySubject,
      autoReplyHtml: mb.autoReplyHtml,
      autoReplyText: mb.autoReplyText,
      isDefault: mb.isDefault,
      active: mb.active,
      sortOrder: mb.sortOrder,
    });
    setShowForm(true);
    setError(null);
  }

  async function saveSettings() {
    if (!token) return;
    setBusy(true);
    setError(null);
    const r = await nestAdminUpdateSupportEmailSettings(token, {
      adminNotifyEmail: adminNotifyEmail.trim() || null,
    });
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'Uložení selhalo');
    else setMsg('Globální nastavení uloženo.');
  }

  async function saveMailbox(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);

    const payload = { ...form };
    if (editingId && !payload.smtpPassword) delete payload.smtpPassword;
    if (editingId && !payload.imapPassword) delete payload.imapPassword;

    const r = editingId
      ? await nestAdminUpdateSupportEmailMailbox(token, editingId, payload)
      : await nestAdminCreateSupportEmailMailbox(token, payload);

    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'Uložení schránky selhalo');
      return;
    }
    setShowForm(false);
    setEditingId(null);
    setMsg(editingId ? 'Schránka aktualizována.' : 'Schránka vytvořena.');
    await refresh();
  }

  async function removeMailbox(id: string) {
    if (!token || !window.confirm('Opravdu smazat tuto schránku?')) return;
    setBusy(true);
    const r = await nestAdminDeleteSupportEmailMailbox(token, id);
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'Smazání selhalo');
    else {
      setMsg('Schránka smazána.');
      await refresh();
    }
  }

  async function pollNow() {
    if (!token) return;
    setBusy(true);
    const r = await nestAdminPollSupportInbound(token);
    setBusy(false);
    setMsg(`IMAP kontrola dokončena — zpracováno ${r.fetched} e-mail(ů).`);
  }

  if (isLoading) return <div className="min-h-[40vh] bg-zinc-50" />;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link href="/admin" className="text-sm text-orange-600 hover:underline">
          ← Administrace
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">E-mailové adresy podpory</h1>
        <p className="mt-1 text-sm text-zinc-600">
          SMTP schránky pro odesílání odpovědí, IMAP pro příjem odpovědí zákazníků a automatické
          potvrzení ticketů.
        </p>

        {msg ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {msg}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold text-zinc-900">Notifikace administrátora</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Po nové odpovědi zákazníka (e-mail nebo portál) odešleme upozornění na tuto adresu.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <input
              type="email"
              value={adminNotifyEmail}
              onChange={(e) => setAdminNotifyEmail(e.target.value)}
              placeholder="admin@example.cz"
              className="min-w-[240px] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveSettings()}
              className="rounded-full bg-[#e85d00] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Uložit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void pollNow()}
              className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-700 disabled:opacity-50"
            >
              Zkontrolovat IMAP teď
            </button>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-zinc-900">E-mailové schránky</h2>
            <button
              type="button"
              onClick={startCreate}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
            >
              + Přidat schránku
            </button>
          </div>

          <ul className="mt-4 space-y-3">
            {mailboxes.map((mb) => (
              <li
                key={mb.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4"
              >
                <div>
                  <p className="font-semibold text-zinc-900">
                    {mb.label}{' '}
                    {mb.isDefault ? (
                      <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-800">
                        výchozí
                      </span>
                    ) : null}
                    {!mb.active ? (
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                        neaktivní
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {mb.email}
                    {mb.replyToEmail ? ` · Reply-To: ${mb.replyToEmail}` : ''}
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-500">
                    SMTP {mb.smtpHost}:{mb.smtpPort}
                    {mb.imapHost ? ` · IMAP ${mb.imapHost}:${mb.imapPort}` : ' · bez IMAP'}
                  </p>
                  {mb.autoReplyEnabled ? (
                    <p className="mt-1 text-xs text-emerald-700">Automatické potvrzení zapnuto</p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(mb)}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50"
                  >
                    Upravit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeMailbox(mb.id)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Smazat
                  </button>
                </div>
              </li>
            ))}
            {mailboxes.length === 0 ? (
              <li className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
                Zatím není nastavena žádná schránka. Bez schránky funguje Centrum podpory pouze
                interně na portálu.
              </li>
            ) : null}
          </ul>
        </section>

        {showForm ? (
          <form
            onSubmit={(e) => void saveMailbox(e)}
            className="mt-8 space-y-6 rounded-xl border border-zinc-200 bg-white p-5"
          >
            <h2 className="text-lg font-bold text-zinc-900">
              {editingId ? 'Upravit schránku' : 'Nová schránka'}
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium">Odesílatel (název)</span>
                <input
                  required
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="XXrealit Podpora"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">E-mail podpory</span>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="info@aldama.cz"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium">Reply-To</span>
                <input
                  type="email"
                  value={form.replyToEmail ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, replyToEmail: e.target.value }))}
                  placeholder="podpora@aldama.cz"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                />
              </label>
            </div>

            <div>
              <h3 className="font-semibold text-zinc-900">SMTP</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium">Server</span>
                  <input
                    required
                    value={form.smtpHost}
                    onChange={(e) => setForm((f) => ({ ...f, smtpHost: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Port</span>
                  <input
                    required
                    type="number"
                    value={form.smtpPort}
                    onChange={(e) => setForm((f) => ({ ...f, smtpPort: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Přihlašovací jméno</span>
                  <input
                    required
                    value={form.smtpUser}
                    onChange={(e) => setForm((f) => ({ ...f, smtpUser: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Heslo {editingId ? '(ponechte prázdné = beze změny)' : ''}</span>
                  <input
                    type="password"
                    required={!editingId}
                    value={form.smtpPassword ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, smtpPassword: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.smtpSecure}
                    onChange={(e) => setForm((f) => ({ ...f, smtpSecure: e.target.checked }))}
                  />
                  SSL/TLS (SMTP secure)
                </label>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-zinc-900">IMAP (příjem odpovědí)</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium">Server</span>
                  <input
                    value={form.imapHost ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, imapHost: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Port</span>
                  <input
                    type="number"
                    value={form.imapPort ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        imapPort: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Uživatel</span>
                  <input
                    value={form.imapUser ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, imapUser: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Heslo {editingId ? '(ponechte prázdné = beze změny)' : ''}</span>
                  <input
                    type="password"
                    value={form.imapPassword ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, imapPassword: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.imapSecure ?? true}
                    onChange={(e) => setForm((f) => ({ ...f, imapSecure: e.target.checked }))}
                  />
                  SSL/TLS (IMAP secure)
                </label>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-zinc-900">Podpis e-mailu</h3>
              <div className="mt-3 grid gap-4">
                <label className="block text-sm">
                  <span className="font-medium">HTML podpis</span>
                  <textarea
                    rows={3}
                    value={form.signatureHtml ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, signatureHtml: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Textový podpis</span>
                  <textarea
                    rows={2}
                    value={form.signatureText ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, signatureText: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-zinc-900">Automatické potvrzení ticketu</h3>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.autoReplyEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, autoReplyEnabled: e.target.checked }))}
                />
                Po vytvoření ticketu okamžitě odeslat potvrzení
              </label>
              {form.autoReplyEnabled ? (
                <div className="mt-3 grid gap-4">
                  <label className="block text-sm">
                    <span className="font-medium">Předmět</span>
                    <input
                      value={form.autoReplySubject ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, autoReplySubject: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium">
                      HTML šablona (proměnné: publicId, firstName, subject)
                    </span>
                    <textarea
                      rows={4}
                      value={form.autoReplyHtml ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, autoReplyHtml: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs"
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                />
                Výchozí schránka
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Aktivní
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-[#e85d00] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Uložit schránku
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-700"
              >
                Zrušit
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
