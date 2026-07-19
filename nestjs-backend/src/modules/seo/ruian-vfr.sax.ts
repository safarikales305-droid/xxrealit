/**
 * Bezpečné načtení sax modulu (CommonJS) — bez esModuleInterop je `import sax from 'sax'`
 * v runtime undefined a padá na sax.createStream().
 */
import * as saxImport from 'sax';

export type SaxModule = {
  createStream: (
    strict: boolean,
    opt?: Record<string, unknown>,
  ) => NodeJS.ReadWriteStream & {
    on(event: string, listener: (...args: unknown[]) => void): void;
    pause(): void;
    resume(): void;
  };
};

export function resolveSaxModule(): SaxModule {
  const mod = saxImport as SaxModule & { default?: SaxModule };
  const resolved = typeof mod.createStream === 'function' ? mod : mod.default;
  if (!resolved?.createStream) {
    throw Object.assign(
      new Error(
        'XML parser sax.createStream není k dispozici — špatný import modulu sax (undefined).',
      ),
      {
        code: 'SAX_IMPORT',
        userMessage: 'Chyba XML parseru — nelze spustit import VFR.',
      },
    );
  }
  return resolved;
}
