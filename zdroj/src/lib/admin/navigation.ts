export type AdminNavTone = 'orange' | 'blue' | 'green' | 'red' | 'yellow' | 'purple';

export type AdminNavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
  description?: string;
  tone?: AdminNavTone;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  icon: string;
  href?: string;
  children?: AdminNavItem[];
  /** Zobrazit na dashboardu jako velkou dlaždici */
  dashboardTile?: boolean;
  tone?: AdminNavTone;
};

/** Horní hlavní navigace */
export const ADMIN_TOP_NAV: AdminNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/admin', icon: '🏠' },
  { id: 'stats', label: 'Statistiky', href: '/admin/statistiky/prehled', icon: '📊' },
  { id: 'users', label: 'Uživatelé', href: '/admin#uzivatele', icon: '👥' },
  { id: 'listings', label: 'Inzeráty', href: '/admin/inzeraty', icon: '🏘' },
  { id: 'credits', label: 'Kredity', href: '/admin/dobiti-kreditu', icon: '💳' },
  { id: 'marketing', label: 'Marketing', href: '/admin/bonusove-akce', icon: '📣' },
  { id: 'settings', label: 'Nastavení', href: '/admin/nastaveni-registrace', icon: '⚙' },
];

/** Levé sidebar menu s podmenu */
export const ADMIN_SIDEBAR_GROUPS: AdminNavGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: '📊',
    href: '/admin',
  },
  {
    id: 'users',
    label: 'Uživatelé',
    icon: '👥',
    href: '/admin#uzivatele',
    dashboardTile: true,
    tone: 'blue',
    children: [
      { id: 'users-all', label: 'Všichni uživatelé', href: '/admin#uzivatele', icon: '👥' },
      { id: 'professionals', label: 'Ověření profesionálů', href: '/admin/overeni-profesionalu', icon: '✔' },
      { id: 'seekers', label: 'Hledající nemovitosti', href: '/admin/hledaci-nemovitosti', icon: '🔍' },
      { id: 'workers', label: 'Pracovníci portálu', href: '/admin/pracovnici-portalu', icon: '🛠' },
      { id: 'workers-crm', label: 'CRM klienti pracovníků', href: '/admin/pracovnici-portalu/crm', icon: '📋', tone: 'blue' },
      { id: 'tipsters', label: 'Tipaři', href: '/admin/tipar', icon: '💡' },
      { id: 'tipster-payouts', label: 'Výplaty tipařů', href: '/admin/tipar/vyplaty', icon: '💸', tone: 'green' },
      { id: 'promo', label: 'Promo profily', href: '/admin/promo-profily', icon: '⭐' },
      { id: 'brokers-db', label: 'Databáze makléřů', href: '/admin/databaze-makleiru', icon: '📇' },
    ],
  },
  {
    id: 'listings',
    label: 'Inzeráty',
    icon: '🏘',
    href: '/admin/inzeraty',
    dashboardTile: true,
    tone: 'orange',
    children: [
      { id: 'listings-all', label: 'Všechny', href: '/admin/inzeraty', icon: '🏘' },
      { id: 'listings-pending', label: 'Schválení', href: '/admin/inzeraty?status=pending', icon: '⏳', tone: 'yellow' },
      { id: 'importy', label: 'Import', href: '/admin/importy', icon: '📥', tone: 'orange' },
      { id: 'listing-stats', label: 'Statistiky', href: '/admin#statistiky', icon: '📊', tone: 'blue' },
      { id: 'articles', label: 'Články / Rady', href: '/admin/clanky', icon: '📄' },
      { id: 'share-videos', label: 'Reklamní videa', href: '/admin/reklamni-videa-sdileni', icon: '🎬' },
    ],
  },
  {
    id: 'credits',
    label: 'Kredity',
    icon: '💳',
    href: '/admin/dobiti-kreditu',
    dashboardTile: true,
    tone: 'green',
    children: [
      { id: 'topups', label: 'Dobití', href: '/admin/dobiti-kreditu', icon: '💰' },
      { id: 'credit-settings', label: 'Tarify / platby', href: '/admin/nastaveni-plateb-kreditu', icon: '⚙', tone: 'blue' },
      { id: 'commissions', label: 'Provize a kontakty', href: '/admin/provize-a-kontakty', icon: '📋' },
      { id: 'worker-comm', label: 'Provize pracovníků', href: '/admin/provize-pracovniku', icon: '💼' },
      { id: 'recalc', label: 'Přepočet kreditů', href: '/admin#uzivatele', icon: '🧮', tone: 'blue' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: '📣',
    href: '/admin/bonusove-akce',
    dashboardTile: true,
    tone: 'purple',
    children: [
      { id: 'bonus', label: 'Bonusové akce', href: '/admin/bonusove-akce', icon: '🎁', tone: 'purple' },
      { id: 'presentation', label: 'O portálu', href: '/admin/o-portalu', icon: '🌐' },
      { id: 'popups', label: 'Popup okna', href: '/admin/marketing/popup-okna', icon: '💬' },
      { id: 'push', label: 'Push notifikace', href: '/admin/marketing/push-notifikace', icon: '🔔' },
      { id: 'wa-campaigns', label: 'WhatsApp kampaně', href: '/admin/marketing/whatsapp-kampane', icon: '📱' },
      { id: 'emails', label: 'E-maily', href: '/admin/marketing/emaily', icon: '✉' },
      { id: 'seo', label: 'SEO', href: '/admin/seo', icon: '🔍', tone: 'blue' },
      { id: 'registration-gate', label: 'Registrace a výzvy', href: '/admin/registrace-a-vyzvy', icon: '📝' },
    ],
  },
  {
    id: 'communication',
    label: 'Komunikace',
    icon: '📨',
    children: [
      { id: 'support-center', label: 'Centrum podpory', href: '/admin/komunikace/centrum-podpory', icon: '🎫', tone: 'red' },
      { id: 'wa-int', label: 'Integrace WhatsApp', href: '/admin/integrace/whatsapp', icon: '📱' },
      { id: 'fb-int', label: 'Integrace Facebook', href: '/admin/integrace/facebook', icon: '👤' },
      { id: 'fb-users', label: 'Facebook propojení', href: '/admin/facebook-propojeni', icon: '🔗' },
    ],
  },
  {
    id: 'stats',
    label: 'Statistiky',
    icon: '📈',
    href: '/admin/statistiky/prehled',
    dashboardTile: true,
    tone: 'blue',
    children: [
      { id: 'stats-overview', label: 'Přehled návštěv', href: '/admin/statistiky/prehled', icon: '📊' },
      { id: 'stats-realtime', label: 'Reálný čas', href: '/admin/statistiky/realny-cas', icon: '⚡', tone: 'orange' },
      { id: 'stats-pages', label: 'Stránky', href: '/admin/statistiky/stranky', icon: '📄' },
      { id: 'stats-sources', label: 'Zdroje návštěvnosti', href: '/admin/statistiky/zdroje', icon: '🔗' },
      { id: 'stats-locations', label: 'Lokace', href: '/admin/statistiky/lokace', icon: '🌍' },
      { id: 'stats-devices', label: 'Zařízení', href: '/admin/statistiky/zarizeni', icon: '📱' },
    ],
  },
  {
    id: 'settings',
    label: 'Nastavení',
    icon: '⚙',
    href: '/admin/nastaveni-registrace',
    dashboardTile: true,
    tone: 'blue',
    children: [
      { id: 'reg-settings', label: 'Registrace', href: '/admin/nastaveni-registrace', icon: '📝' },
      { id: 'portal-about', label: 'O portálu', href: '/admin/o-portalu', icon: '🌐' },
      { id: 'terms', label: 'Obchodní podmínky', href: '/admin/obchodni-podminky', icon: '📜' },
      { id: 'music', label: 'Hudba a zvuky', href: '/admin/hudba', icon: '🎵' },
      { id: 'logs', label: 'Logy systému', href: '/admin/logy', icon: '📜' },
    ],
  },
  {
    id: 'dev',
    label: 'Vývoj',
    icon: '🛠',
    children: [
      { id: 'dev-notes', label: 'Vývojářské poznámky', href: '/admin/vyvojarske-poznamky', icon: '📓' },
      { id: 'portal-test', label: 'Testování portálu', href: '/admin/testovani-portalu', icon: '🧪' },
    ],
  },
];

export const ADMIN_QUICK_ACTIONS: AdminNavItem[] = [
  { id: 'qa-presentation', label: 'Náhled prezentace', href: '/o-portalu', icon: '🌐', tone: 'orange' },
  { id: 'qa-listing', label: 'Nový inzerát', href: '/inzerat/pridat', icon: '🏘', tone: 'orange' },
  { id: 'qa-worker', label: 'Nový pracovník', href: '/admin/pracovnici-portalu', icon: '🛠', tone: 'blue' },
  { id: 'qa-broker', label: 'Nový makléř', href: '/admin/promo-profily', icon: '👔', tone: 'blue' },
  { id: 'qa-tipster', label: 'Nový tipař', href: '/admin/tipar', icon: '💡', tone: 'purple' },
  { id: 'qa-wa', label: 'Nová WhatsApp kampaň', href: '/admin/marketing/whatsapp-kampane', icon: '📱', tone: 'purple' },
  { id: 'qa-popup', label: 'Nový popup', href: '/admin/marketing/popup-okna', icon: '💬', tone: 'purple' },
  { id: 'qa-video', label: 'Nové promo video', href: '/admin/reklamni-videa-sdileni', icon: '🎬', tone: 'purple' },
];

export const TONE_CLASSES: Record<AdminNavTone, string> = {
  orange: 'border-orange-200 bg-gradient-to-br from-orange-50 to-white text-orange-900 hover:border-orange-300',
  blue: 'border-blue-200 bg-gradient-to-br from-blue-50 to-white text-blue-900 hover:border-blue-300',
  green: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-900 hover:border-emerald-300',
  red: 'border-red-200 bg-gradient-to-br from-red-50 to-white text-red-900 hover:border-red-300',
  yellow: 'border-amber-200 bg-gradient-to-br from-amber-50 to-white text-amber-900 hover:border-amber-300',
  purple: 'border-violet-200 bg-gradient-to-br from-violet-50 to-white text-violet-900 hover:border-violet-300',
};

/** Všechny položky pro globální vyhledávání */
export function flattenAdminNav(): AdminNavItem[] {
  const items: AdminNavItem[] = [...ADMIN_TOP_NAV, ...ADMIN_QUICK_ACTIONS];
  for (const g of ADMIN_SIDEBAR_GROUPS) {
    if (g.href) items.push({ id: g.id, label: g.label, href: g.href, icon: g.icon });
    g.children?.forEach((c) => items.push(c));
  }
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.href;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
