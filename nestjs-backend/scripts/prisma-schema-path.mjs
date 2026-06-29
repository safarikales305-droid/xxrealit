import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Možné cesty ke schema.prisma (relativně k package root nebo env).
 */
export function getPrismaSchemaCandidates() {
  const fromEnv = process.env.PRISMA_SCHEMA_PATH?.trim();
  return [
    fromEnv ? resolve(fromEnv) : null,
    join(packageRoot, 'prisma', 'schema.prisma'),
    join(packageRoot, '..', 'nestjs-backend', 'prisma', 'schema.prisma'),
    join(process.cwd(), 'prisma', 'schema.prisma'),
    join(process.cwd(), 'nestjs-backend', 'prisma', 'schema.prisma'),
  ].filter(Boolean);
}

export function resolvePrismaSchemaPath(options = {}) {
  const required = options.required !== false;
  const candidates = getPrismaSchemaCandidates();

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  if (!required) {
    return null;
  }

  console.error('Error: Could not find Prisma Schema');
  console.error('schema.prisma file not found');
  console.error('');
  console.error('Current working directory:', process.cwd());
  console.error('Package root (nestjs-backend):', packageRoot);
  console.error('Searched paths:');
  for (const candidate of candidates) {
    console.error(`  - ${candidate} ${existsSync(candidate) ? '(exists)' : '(missing)'}`);
  }
  console.error('');
  console.error('Railway: nastavte Root Directory služby na nestjs-backend');
  console.error('Nebo env PRISMA_SCHEMA_PATH=nestjs-backend/prisma/schema.prisma');
  process.exit(1);
}

export function getPackageRoot() {
  return packageRoot;
}
