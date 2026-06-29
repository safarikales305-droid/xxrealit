import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolvePrismaSchemaPath, getPackageRoot } from './prisma-schema-path.mjs';

const schemaPath = resolvePrismaSchemaPath({ required: false });
if (!schemaPath) {
  console.log('[prisma] postinstall: schema.prisma zatím není k dispozici — přeskočeno');
  console.log('[prisma] postinstall: cwd=', process.cwd());
  process.exit(0);
}

const packageRoot = getPackageRoot();
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const prismaArgs = ['prisma', 'generate', `--schema=${schemaPath}`];

console.log(`[prisma] postinstall: ${prismaArgs.join(' ')}`);

const result = spawnSync(npxCmd, prismaArgs, {
  stdio: 'inherit',
  cwd: packageRoot,
  env: process.env,
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
