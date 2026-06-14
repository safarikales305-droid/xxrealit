export const FACEBOOK_URL_IMPORT_MAX_NEW = 20;

export const FACEBOOK_URL_IMPORT_CRON_MS = 6 * 60 * 60 * 1000;

export const FACEBOOK_URL_IMPORT_USER_ERROR =
  'Facebook obsah se nepodařilo automaticky načíst. Zkontrolujte, že stránka je veřejná.';

export const FACEBOOK_URL_ALLOWED_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
]);

export const FACEBOOK_IMPORT_TAG = 'Importováno z Facebooku';
