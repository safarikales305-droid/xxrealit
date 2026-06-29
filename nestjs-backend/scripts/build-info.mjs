import { execSync } from 'node:child_process';
import { resolvePrismaSchemaPath, getPackageRoot } from './prisma-schema-path.mjs';

const schemaPath = resolvePrismaSchemaPath({ required: true });
const packageRoot = getPackageRoot();

let prismaVersion = 'unknown';
try {
  prismaVersion = execSync('npx prisma --version', {
    encoding: 'utf8',
    cwd: packageRoot,
  }).trim();
} catch (e) {
  prismaVersion = e instanceof Error ? e.message : String(e);
}

console.log('--- Build info ---');
console.log('Current working directory:', process.cwd());
console.log('Package root:', packageRoot);
console.log('Schema path:', schemaPath);
console.log('Prisma version:');
console.log(prismaVersion);
console.log('------------------');
