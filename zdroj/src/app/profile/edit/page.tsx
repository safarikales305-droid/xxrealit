import Link from 'next/link';

export default function ProfileEditPage() {
  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-12 text-zinc-900">
      <Link
        href="/"
        className="text-sm font-semibold text-[#e85d00] hover:text-[#ff6a00]"
      >
        ← Domů
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Upravit profil</h1>
      <p className="mt-3 text-[15px] text-zinc-600">
        Úprava profilu bude brzy napojena na API. Tuto stránku mohou zobrazit pouze
        přihlášení uživatelé.
      </p>
    </div>
  );
}
