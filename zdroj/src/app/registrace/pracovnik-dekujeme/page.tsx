import Link from 'next/link';
import { AuthPageShell } from '@/components/auth/auth-page-shell';

export default function PortalWorkerThankYouPage() {
  return (
    <AuthPageShell variant="register">
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-bold text-zinc-900">Děkujeme za zájem o spolupráci</h1>
        <p className="text-sm leading-relaxed text-zinc-700">
          Děkujeme za zájem o spolupráci s XXrealit.cz.
        </p>
        <p className="text-sm leading-relaxed text-zinc-700">
          Vaše žádost byla odeslána administrátorovi ke schválení.
        </p>
        <p className="text-sm leading-relaxed text-zinc-700">
          Po schválení získáte přístup do pracovního panelu.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-3 text-sm font-semibold text-white"
        >
          Přihlásit se
        </Link>
      </div>
    </AuthPageShell>
  );
}
