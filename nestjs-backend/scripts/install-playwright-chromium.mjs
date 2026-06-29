#!/usr/bin/env node
/**
 * Instaluje Chromium do node_modules (PLAYWRIGHT_BROWSERS_PATH=0),
 * aby binárky přežily deploy na Railway.
 */
import { spawnSync } from 'node:child_process';

if (process.env.PLAYWRIGHT_SKIP_BROWSER_INSTALL === '1') {
  console.log('[playwright] Přeskočeno (PLAYWRIGHT_SKIP_BROWSER_INSTALL=1)');
  process.exit(0);
}

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';

const useDeps = process.platform === 'linux';
const args = useDeps
  ? ['playwright', 'install', '--with-deps', 'chromium']
  : ['playwright', 'install', 'chromium'];

console.log(`[playwright] npx ${args.join(' ')} (PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH})`);

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npxCmd, args, {
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  console.error('[playwright] Instalace Chromium selhala.');
  process.exit(result.status ?? 1);
}

console.log('[playwright] Chromium nainstalováno.');
