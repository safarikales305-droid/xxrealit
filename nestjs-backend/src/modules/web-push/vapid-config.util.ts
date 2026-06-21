import { ConfigService } from '@nestjs/config';

export type VapidConfig = {
  publicKey: string | null;
  privateKey: string | null;
  subject: string | null;
  configured: boolean;
  issues: string[];
};

function readEnv(config: ConfigService, ...keys: string[]): string | null {
  for (const key of keys) {
    const raw = config.get<string>(key);
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value) return value;
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;
  }
  return null;
}

export function resolveVapidConfig(config: ConfigService): VapidConfig {
  const publicKey = readEnv(
    config,
    'VAPID_PUBLIC_KEY',
    'WEB_PUSH_VAPID_PUBLIC_KEY',
  );
  const privateKey = readEnv(
    config,
    'VAPID_PRIVATE_KEY',
    'WEB_PUSH_VAPID_PRIVATE_KEY',
  );
  const subject =
    readEnv(config, 'VAPID_SUBJECT', 'WEB_PUSH_VAPID_SUBJECT') ||
    readEnv(config, 'FRONTEND_URL') ||
    'mailto:admin@xxrealit.cz';

  const issues: string[] = [];
  if (!publicKey) issues.push('Chybí VAPID_PUBLIC_KEY');
  if (!privateKey) issues.push('Chybí VAPID_PRIVATE_KEY');
  if (!subject?.includes('@') && !subject?.startsWith('mailto:')) {
    issues.push('VAPID_SUBJECT musí být mailto: e-mail nebo https:// URL');
  }
  if (publicKey && publicKey.length < 80) {
    issues.push('VAPID_PUBLIC_KEY vypadá neplatně (příliš krátký)');
  }

  return {
    publicKey,
    privateKey,
    subject,
    configured: Boolean(publicKey && privateKey && issues.length === 0),
    issues,
  };
}

export const VAPID_SETUP_INSTRUCTIONS = [
  'V kořeni backendu spusťte: npx web-push generate-vapid-keys',
  'Do Railway / .env nastavte:',
  'VAPID_PUBLIC_KEY=<publicKey z výstupu>',
  'VAPID_PRIVATE_KEY=<privateKey z výstupu>',
  'VAPID_SUBJECT=mailto:vas@email.cz',
  'Restartujte NestJS backend a v profilu znovu zapněte PWA push.',
] as const;
