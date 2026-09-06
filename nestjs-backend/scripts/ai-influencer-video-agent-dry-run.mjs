/**
 * Video Agent dry-run against running Nest API.
 * Usage:
 *   node scripts/ai-influencer-video-agent-dry-run.mjs
 *   API_BASE=https://nestjs-backend-production.up.railway.app/api ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/...
 */
const API_BASE = (process.env.API_BASE ?? 'https://nestjs-backend-production.up.railway.app/api').replace(/\/+$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@admin.cz';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';
const POLL_MS = 4000;
const TIMEOUT_MS = 12 * 60_000;

async function request(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, json };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`API_BASE=${API_BASE}`);

  const health = await request('/health');
  console.log('HEALTH', health.status, JSON.stringify(health.json));
  if (!health.ok) {
    console.error('FAIL: backend health check');
    process.exit(1);
  }

  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!login.ok) {
    console.error('FAIL: admin login', login.status, login.json);
    process.exit(1);
  }
  const token = login.json?.accessToken ?? login.json?.token;
  if (!token) {
    console.error('FAIL: missing access token in login response', login.json);
    process.exit(1);
  }
  console.log('LOGIN OK');

  const readiness = await request('/admin/ai-influencer/health/video-agent', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('VIDEO_AGENT_READINESS', readiness.status, JSON.stringify(readiness.json));

  const start = await request('/admin/ai-influencer/test/video-agent', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!start.ok) {
    console.error('FAIL: start test job', start.status, start.json);
    process.exit(1);
  }
  const jobId = start.json?.jobId;
  if (!jobId) {
    console.error('FAIL: missing jobId', start.json);
    process.exit(1);
  }
  console.log(`TEST_JOB_STARTED id=${jobId}`);

  const startedAt = Date.now();
  while (Date.now() - startedAt < TIMEOUT_MS) {
    await sleep(POLL_MS);
    const statusRes = await request(`/admin/ai-influencer/test/video-agent/${encodeURIComponent(jobId)}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!statusRes.ok) {
      console.error('FAIL: poll status', statusRes.status, statusRes.json);
      process.exit(1);
    }
    const job = statusRes.json?.job;
    if (!job) {
      console.error('FAIL: missing job in poll response', statusRes.json);
      process.exit(1);
    }
    console.log(
      `POLL status=${job.status} progress=${job.progressPercent ?? 0}% label=${job.progressLabel ?? '—'} preview=${job.previewUrl ? 'yes' : 'no'}`,
    );
    if (job.errorMessage) console.log(`  error=${job.errorCode ?? '—'} ${job.errorMessage}`);

    if (job.status === 'DONE') {
      console.log('PASS: VIDEO_AGENT DRY-RUN DONE');
      console.log(`MASTER_MP4=${job.previewUrl ?? 'MISSING'}`);
      console.log(`durationSec=${job.durationSec ?? '—'} size=${job.width ?? '?'}x${job.height ?? '?'}`);
      process.exit(job.previewUrl ? 0 : 1);
    }
    if (job.status === 'FAILED') {
      console.error('FAIL: VIDEO_AGENT DRY-RUN FAILED');
      console.error(JSON.stringify(job, null, 2));
      process.exit(1);
    }
  }

  console.error('FAIL: timeout waiting for Video Agent test');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
