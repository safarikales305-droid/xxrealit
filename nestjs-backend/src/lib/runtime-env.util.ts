/** Jednotné čtení ENV — bez logování hodnot, strip quotes jako u Railway deployů. */

export function readRuntimeEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  return trimmed || undefined;
}

export function readRuntimeEnvWithAliases(
  primary: string,
  aliases: string[] = [],
): string | undefined {
  const direct = readRuntimeEnv(primary);
  if (direct) return direct;
  for (const alias of aliases) {
    const v = readRuntimeEnv(alias);
    if (v) return v;
  }
  return undefined;
}

export function readRuntimeEnvFlag(name: string): boolean {
  const raw = readRuntimeEnv(name)?.toLowerCase();
  if (!raw) return false;
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}
