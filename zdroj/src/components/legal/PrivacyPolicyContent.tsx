'use client';

import Link from 'next/link';
import { SupportContactButton } from '@/components/support/SupportContactButton';

export function PrivacyPolicyContent() {
  return (
    <>
      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Provozovatel</h2>
        <p className="mt-2">
          Provozovatelem internetového portálu{' '}
          <Link href="/" className="font-semibold text-[#e85d00] hover:underline">
            xxrealit.cz
          </Link>{' '}
          (dále jen „XXRealit“) je provozovatel služby XXRealit. V případě dotazů k ochraně
          osobních údajů nás kontaktujte přes{' '}
          <SupportContactButton variant="link" label="formulář podpory" subject="Dotaz k ochraně osobních údajů" category="OTHER" />
          .
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Zpracování osobních údajů</h2>
        <p className="mt-2">
          XXRealit zpracovává osobní údaje v souladu s Nařízením Evropského parlamentu a Rady (EU)
          2016/679 (GDPR) a platnými právními předpisy České republiky. Údaje zpracováváme pouze v
          rozsahu nezbytném pro provoz portálu, poskytování služeb, komunikaci s uživateli a plnění
          zákonných povinností.
        </p>
        <p className="mt-2">Můžeme zpracovávat zejména tyto kategorie údajů:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>identifikační a kontaktní údaje (e-mail, jméno, telefon)</li>
          <li>údaje o účtu a profilu (avatar, bio, role, nastavení)</li>
          <li>obsah vložený uživatelem (inzeráty, příspěvky, zprávy, fotografie, videa)</li>
          <li>technické a provozní údaje (IP adresa, cookies, logy)</li>
          <li>údaje z propojených služeb třetích stran (např. Facebook Login)</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Registrace uživatelů</h2>
        <p className="mt-2">
          Při registraci nebo přihlášení zpracováváme údaje potřebné k vytvoření a správě uživatelského
          účtu. Účet můžete kdykoli spravovat v nastavení profilu. Údaje uchováváme po dobu trvání
          účtu a případně po nezbytnou dobu po jeho zrušení z důvodu plnění právních povinností nebo
          ochrany práv provozovatele.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Facebook Login</h2>
        <p className="mt-2">
          Pro přihlášení nebo registraci můžete využít službu Facebook Login společnosti Meta
          Platforms Ireland Ltd. Při propojení účtu můžeme obdržet zejména veřejný profil (jméno,
          profilový obrázek) a identifikátor Facebook účtu. Rozsah údajů závisí na vašem souhlasu v
          dialogu Facebooku a na oprávněních udělených aplikaci XXRealit.
        </p>
        <p className="mt-2">
          Propojení Facebook účtu lze kdykoli zrušit v nastavení profilu na XXRealit nebo v nastavení
          Facebook aplikace. Žádost o smazání dat získaných prostřednictvím Facebook Login naleznete na
          stránce{' '}
          <Link href="/data-deletion" className="font-semibold text-[#e85d00] hover:underline">
            Smazání Facebook dat
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Cookies</h2>
        <p className="mt-2">
          Portál používá cookies a obdobné technologie k zajištění funkčnosti (např. přihlášení),
          bezpečnosti a měření návštěvnosti. Nezbytné cookies jsou používány bez souhlasu; u ostatních
          typů cookies vás informujeme a vyžádáme souhlas, pokud to vyžaduje zákon.
        </p>
        <p className="mt-2">
          Cookies můžete spravovat v nastavení svého prohlížeče. Omezení některých cookies může ovlivnit
          funkčnost přihlášení nebo dalších částí portálu.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Vaše práva podle GDPR</h2>
        <p className="mt-2">Jako subjekt údajů máte zejména právo:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>na přístup ke svým osobním údajům</li>
          <li>na opravu nepřesných údajů</li>
          <li>na výmaz („právo být zapomenut“), pokud jsou splněny zákonné podmínky</li>
          <li>na omezení zpracování</li>
          <li>na přenositelnost údajů</li>
          <li>vznést námitku proti zpracování</li>
          <li>odvolat souhlas se zpracováním, pokud je zpracování založeno na souhlasu</li>
          <li>podat stížnost u Úřadu pro ochranu osobních údajů (www.uoou.cz)</li>
        </ul>
        <p className="mt-2">
          Pro uplatnění práv nás kontaktujte přes{' '}
          <SupportContactButton variant="link" label="formulář podpory" subject="Uplatnění práv subjektu údajů" category="OTHER" />
          .
        </p>
      </section>

      <section className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
        <h2 className="text-lg font-semibold text-zinc-900">Kontakt</h2>
        <p className="mt-2">
          <SupportContactButton variant="link" label="Kontaktovat podporu" />
        </p>
        <p className="mt-1">
          Web:{' '}
          <Link href="/" className="font-semibold text-[#e85d00] hover:underline">
            xxrealit.cz
          </Link>
        </p>
      </section>
    </>
  );
}
