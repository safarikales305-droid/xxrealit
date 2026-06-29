import { spawnSync } from 'node:child_process';
import { resolvePrismaSchemaPath, getPackageRoot } from './prisma-schema-path.mjs';

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node scripts/prisma-cli.mjs <prisma-command> [args...]');
  process.exit(1);
}

const schemaPath = resolvePrismaSchemaPath({ required: true });
const packageRoot = getPackageRoot();

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const prismaArgs = ['prisma', ...args, `--schema=${schemaPath}`];

console.log(`[prisma] ${prismaArgs.join(' ')}`);
console.log(`[prisma] cwd=${packageRoot}`);

const result = spawnSync(npxCmd, prismaArgs, {
  stdio: 'inherit',
  cwd: packageRoot,
  env: process.env,
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
