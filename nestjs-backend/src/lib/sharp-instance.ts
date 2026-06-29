import type { Metadata, OverlayOptions, Sharp, SharpOptions } from 'sharp';

/**
 * Sharp je CJS `export =`. V tsconfig (module: commonjs, bez esModuleInterop)
 * se `import sharp from 'sharp'` přeloží na `require('sharp').default`,
 * které runtime není funkce → "(0, sharp_1.default) is not a function".
 * `import = require` emituje přímé `require('sharp')`.
 */
import sharp = require('sharp');

export type { Metadata, OverlayOptions, Sharp, SharpOptions };

const SHARP_IMPORT_ERROR =
  'Knihovna sharp není funkce — špatný import modulu. Použijte src/lib/sharp-instance.ts.';

if (typeof sharp !== 'function') {
  console.error(
    `[sharp-instance] ${SHARP_IMPORT_ERROR} Aktuální typ: ${typeof sharp}`,
  );
}

/** Ověří, že sharp je callable; jinak hodí výjimku s jasnou zprávou. */
export function assertSharpReady(context?: string): void {
  if (typeof sharp !== 'function') {
    const where = context ? ` (${context})` : '';
    throw new Error(`${SHARP_IMPORT_ERROR}${where}`);
  }
}

export default sharp;
