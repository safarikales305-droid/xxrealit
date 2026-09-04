/**
 * FFmpeg branding smoke test — stejný filter graph jako produkční AI Influencer pipeline.
 * Usage: node scripts/ai-influencer-branding-smoke.mjs
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const FILTER_GRAPH = '[1:v]format=rgba[brand];[0:v][brand]overlay=0:0[outv]';
const W = 1080;
const H = 1920;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => {
      stderr += c.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

async function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH?.trim()) return process.env.FFMPEG_PATH.trim();
  try {
    const mod = await import('ffmpeg-static');
    const p = mod.default ?? mod;
    if (typeof p === 'string' && p.length) return p;
  } catch {
    /* optional */
  }
  return 'ffmpeg';
}

async function main() {
  const ffmpeg = await resolveFfmpeg();
  const root = join(tmpdir(), `ai-brand-smoke-${randomBytes(4).toString('hex')}`);
  await mkdir(root, { recursive: true });

  const baseVideo = join(root, 'base.mp4');
  const brandingPng = join(root, 'branding-overlay.png');
  const output = join(root, 'test-final.mp4');

  // 1x1 red PNG expanded — minimal valid overlay input
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await writeFile(brandingPng, png);

  const baseRes = await run(ffmpeg, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=blue:s=${W}x${H}:d=2`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-an',
    baseVideo,
  ]);
  if (baseRes.code !== 0) {
    console.error('FAIL: base video generation');
    console.error(baseRes.stderr.slice(-400));
    process.exit(1);
  }

  const overlayRes = await run(ffmpeg, [
    '-y',
    '-i',
    baseVideo,
    '-loop',
    '1',
    '-i',
    brandingPng,
    '-filter_complex',
    FILTER_GRAPH,
    '-map',
    '[outv]',
    '-t',
    '2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-an',
    output,
  ]);

  if (overlayRes.code !== 0) {
    console.error('FAIL: branding overlay');
    console.error(overlayRes.stderr.slice(-600));
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
    process.exit(1);
  }

  try {
    await access(output);
    console.log('PASS: FFmpeg branding smoke test');
    console.log(`ffmpeg=${ffmpeg}`);
    console.log(`filter=${FILTER_GRAPH}`);
    console.log(`output=${output}`);
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
    process.exit(0);
  } catch {
    console.error('FAIL: output missing');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
