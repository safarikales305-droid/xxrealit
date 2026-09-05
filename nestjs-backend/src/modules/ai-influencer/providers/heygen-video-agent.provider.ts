import { Injectable, Logger } from '@nestjs/common';
import { getHeyGenRuntimeConfig } from '../ai-influencer-runtime-config.util';
import type { VideoAgentMediaFile } from '../heygen-video-agent-prompt.util';

export type HeyGenVideoAgentStartInput = {
  prompt: string;
  avatarId?: string | null;
  voiceId?: string | null;
  files?: VideoAgentMediaFile[];
  callbackUrl?: string;
};

export type HeyGenVideoAgentStartResult = {
  sessionId: string;
  videoId: string | null;
  mode: 'VIDEO_AGENT';
};

export type HeyGenVideoAgentPollResult = {
  status: 'QUEUED' | 'PROCESSING' | 'GENERATING' | 'READY' | 'FAILED';
  sessionStatus?: string;
  videoId?: string | null;
  videoUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  durationSec?: number;
};

export type HeyGenVideoAgentReadiness = {
  available: boolean;
  apiKeyPresence: 'CONFIGURED' | 'MISSING';
  message: string | null;
  probeStatus?: number;
};

@Injectable()
export class HeyGenVideoAgentProvider {
  readonly providerId = 'heygen-video-agent';
  private readonly log = new Logger(HeyGenVideoAgentProvider.name);

  private get apiKey(): string | undefined {
    return getHeyGenRuntimeConfig().apiKey;
  }

  async getReadiness(): Promise<HeyGenVideoAgentReadiness> {
    const runtime = getHeyGenRuntimeConfig();
    if (runtime.apiKeyPresence === 'MISSING') {
      return {
        available: false,
        apiKeyPresence: 'MISSING',
        message: 'HEYGEN_API_KEY není nakonfigurován.',
      };
    }

    const probe = await this.request('GET', '/v3/video-agents/styles');
    if (probe.ok || probe.httpStatus === 404) {
      return {
        available: probe.ok,
        apiKeyPresence: 'CONFIGURED',
        message: probe.ok ? null : 'Video Agent styles endpoint nedostupný — účet může nemít Video Agent.',
        probeStatus: probe.httpStatus,
      };
    }
    if (probe.httpStatus === 401 || probe.httpStatus === 403) {
      return {
        available: false,
        apiKeyPresence: 'CONFIGURED',
        message: 'HeyGen Video Agent — auth/permission error.',
        probeStatus: probe.httpStatus,
      };
    }
    if (probe.httpStatus === 402) {
      return {
        available: false,
        apiKeyPresence: 'CONFIGURED',
        message: 'HeyGen Video Agent není dostupný (plán/credits).',
        probeStatus: probe.httpStatus,
      };
    }

    return {
      available: false,
      apiKeyPresence: 'CONFIGURED',
      message: probe.message ?? 'HeyGen Video Agent není dostupný.',
      probeStatus: probe.httpStatus,
    };
  }

  async startGeneration(input: HeyGenVideoAgentStartInput): Promise<HeyGenVideoAgentStartResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw Object.assign(new Error('HEYGEN_API_KEY není nakonfigurován.'), {
        code: 'HEYGEN_VIDEO_AGENT_NOT_AVAILABLE',
      });
    }

    const payload: Record<string, unknown> = {
      prompt: input.prompt,
      mode: 'generate',
      orientation: 'portrait',
      auto_proceed: true,
    };
    if (input.avatarId?.trim()) payload.avatar_id = input.avatarId.trim();
    if (input.voiceId?.trim()) payload.voice_id = input.voiceId.trim();
    if (input.callbackUrl?.trim()) payload.callback_url = input.callbackUrl.trim();
    if (input.files?.length) {
      payload.files = input.files.slice(0, 20).map((f) => ({ type: 'url', url: f.url }));
    }

    const parsed = await this.request('POST', '/v3/video-agents', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!parsed.ok) {
      const code = this.mapSubmitErrorCode(parsed.httpStatus, parsed.errorCode);
      throw Object.assign(
        new Error(parsed.message || `HeyGen Video Agent submit failed (HTTP ${parsed.httpStatus}).`),
        { code },
      );
    }

    const json = JSON.parse(parsed.rawBody || '{}') as {
      data?: { session_id?: string; video_id?: string | null };
      session_id?: string;
      video_id?: string | null;
    };
    const sessionId = json.data?.session_id ?? json.session_id;
    if (!sessionId?.trim()) {
      throw Object.assign(new Error('HeyGen Video Agent nevrátil session_id.'), {
        code: 'HEYGEN_VIDEO_AGENT_SUBMIT_FAILED',
      });
    }

    const videoId = json.data?.video_id ?? json.video_id ?? null;
    this.log.log(`HeyGen Video Agent session started sessionId=${sessionId} videoId=${videoId ?? 'pending'}`);
    return { sessionId: sessionId.trim(), videoId: videoId?.trim() || null, mode: 'VIDEO_AGENT' };
  }

  async pollSession(sessionId: string): Promise<HeyGenVideoAgentPollResult> {
    const parsed = await this.request('GET', `/v3/video-agents/${encodeURIComponent(sessionId)}`);
    if (!parsed.ok) {
      return {
        status: 'FAILED',
        errorCode: this.mapSubmitErrorCode(parsed.httpStatus, parsed.errorCode),
        errorMessage: parsed.message ?? `Session poll HTTP ${parsed.httpStatus}`,
      };
    }

    const json = JSON.parse(parsed.rawBody || '{}') as {
      data?: {
        status?: string;
        video_id?: string | null;
        failure_code?: string;
        failure_message?: string;
      };
      status?: string;
      video_id?: string | null;
      failure_code?: string;
      failure_message?: string;
    };
    const data = json.data ?? json;
    const sessionStatus = String(data.status ?? '').toLowerCase();
    const videoId = data.video_id?.trim() || null;

    if (sessionStatus === 'failed' || sessionStatus === 'error') {
      return {
        status: 'FAILED',
        sessionStatus,
        videoId,
        errorCode: 'HEYGEN_VIDEO_AGENT_PROCESSING_FAILED',
        errorMessage: data.failure_message || data.failure_code || 'Video Agent session failed',
      };
    }

    if (sessionStatus === 'completed' || sessionStatus === 'generating' || videoId) {
      if (!videoId) {
        return { status: 'PROCESSING', sessionStatus, videoId: null };
      }
      const video = await this.pollVideo(videoId);
      if (video.status === 'READY') return { ...video, sessionStatus, videoId };
      if (video.status === 'FAILED') return { ...video, sessionStatus, videoId };
      return { status: 'GENERATING', sessionStatus, videoId };
    }

    if (sessionStatus === 'queued' || sessionStatus === 'pending') {
      return { status: 'QUEUED', sessionStatus, videoId };
    }

    return { status: 'PROCESSING', sessionStatus, videoId };
  }

  async pollVideo(videoId: string): Promise<HeyGenVideoAgentPollResult> {
    const parsed = await this.request('GET', `/v3/videos/${encodeURIComponent(videoId)}`);
    if (!parsed.ok) {
      return {
        status: 'FAILED',
        errorCode: 'HEYGEN_VIDEO_AGENT_PROCESSING_FAILED',
        errorMessage: parsed.message ?? `Video poll HTTP ${parsed.httpStatus}`,
      };
    }

    const json = JSON.parse(parsed.rawBody || '{}') as {
      data?: {
        status?: string;
        video_url?: string;
        duration?: number;
        failure_code?: string;
        failure_message?: string;
      };
    };
    const data = json.data ?? {};
    const status = String(data.status ?? '').toLowerCase();

    if (status === 'completed' || status === 'complete' || status === 'success') {
      const videoUrl = data.video_url?.trim();
      if (!videoUrl) {
        return {
          status: 'FAILED',
          errorCode: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED',
          errorMessage: 'Video Agent completed without video_url',
        };
      }
      return {
        status: 'READY',
        videoId,
        videoUrl,
        durationSec: typeof data.duration === 'number' ? data.duration : undefined,
      };
    }

    if (status === 'failed' || status === 'error') {
      return {
        status: 'FAILED',
        videoId,
        errorCode: 'HEYGEN_VIDEO_AGENT_PROCESSING_FAILED',
        errorMessage: data.failure_message || data.failure_code || 'Video render failed',
      };
    }

    if (status === 'pending' || status === 'waiting' || status === 'queued') {
      return { status: 'QUEUED', videoId };
    }

    return { status: 'GENERATING', videoId };
  }

  async downloadResult(videoUrl: string): Promise<Buffer> {
    const res = await fetch(videoUrl);
    if (!res.ok) {
      throw Object.assign(new Error(`Stažení Video Agent master selhalo (HTTP ${res.status}).`), {
        code: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED',
      });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) {
      throw Object.assign(new Error('Stažené Video Agent video je prázdné.'), {
        code: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED',
      });
    }
    if (buf.length > 250 * 1024 * 1024) {
      throw Object.assign(new Error('Video Agent master překračuje limit velikosti.'), {
        code: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED',
      });
    }
    return buf;
  }

  private mapSubmitErrorCode(httpStatus: number, detail?: string | null): string {
    if (httpStatus === 401 || httpStatus === 403) return 'HEYGEN_VIDEO_AGENT_AUTH_FAILED';
    if (httpStatus === 402) return 'HEYGEN_VIDEO_AGENT_NOT_AVAILABLE';
    if (httpStatus === 404) return 'HEYGEN_VIDEO_AGENT_NOT_AVAILABLE';
    if (detail?.includes('feature')) return 'HEYGEN_VIDEO_AGENT_NOT_AVAILABLE';
    return 'HEYGEN_VIDEO_AGENT_SUBMIT_FAILED';
  }

  private async request(
    method: string,
    path: string,
    init?: { headers?: Record<string, string>; body?: string },
  ): Promise<{
    httpStatus: number;
    ok: boolean;
    errorCode: string | null;
    message: string | null;
    rawBody: string;
  }> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      return {
        httpStatus: 0,
        ok: false,
        errorCode: 'missing_key',
        message: 'HEYGEN_API_KEY není nastaven',
        rawBody: '',
      };
    }

    try {
      const res = await fetch(`https://api.heygen.com${path}`, {
        method,
        headers: {
          'X-Api-Key': apiKey,
          ...(init?.headers ?? {}),
        },
        body: init?.body,
      });
      const rawBody = await res.text();
      let message: string | null = null;
      let errorCode: string | null = null;
      if (!res.ok) {
        try {
          const errJson = JSON.parse(rawBody) as {
            error?: { message?: string; code?: string };
            message?: string;
          };
          message = errJson.error?.message ?? errJson.message ?? rawBody.slice(0, 300);
          errorCode = errJson.error?.code ?? null;
        } catch {
          message = rawBody.slice(0, 300);
        }
        this.log.warn(`[HeyGen Video Agent] ${method} ${path} HTTP ${res.status}: ${message}`);
      }
      return { httpStatus: res.status, ok: res.ok, errorCode, message, rawBody };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { httpStatus: 0, ok: false, errorCode: 'connection_error', message, rawBody: '' };
    }
  }
}
