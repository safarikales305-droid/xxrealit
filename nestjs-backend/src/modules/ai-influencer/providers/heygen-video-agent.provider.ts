import { Injectable, Logger } from '@nestjs/common';
import { getHeyGenRuntimeConfig } from '../ai-influencer-runtime-config.util';
import type { VideoAgentMediaFile } from '../heygen-video-agent-prompt.util';
import {
  mapHeyGenHttpErrorCode,
  parseHeyGenVideoAgentSubmitResponse,
} from '../heygen-video-agent-response.util';
import {
  extractHeyGenSessionStatus,
  extractHeyGenVideoId,
  extractHeyGenVideoUrl,
  normalizeHeyGenSessionStatus,
} from '../heygen-video-agent-poll.util';

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
  providerStatus?: string | null;
  responseShape?: string;
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

  async startGeneration(
    input: HeyGenVideoAgentStartInput,
    options?: { timeoutMs?: number },
  ): Promise<HeyGenVideoAgentStartResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw Object.assign(new Error('HEYGEN_API_KEY není nakonfigurován.'), {
        code: 'HEYGEN_NOT_CONFIGURED',
        pipelineStage: 'VIDEO_AGENT',
      });
    }

    const payload: Record<string, unknown> = {
      prompt: input.prompt,
      mode: 'generate',
      orientation: 'portrait',
    };
    if (input.avatarId?.trim()) payload.avatar_id = input.avatarId.trim();
    if (input.voiceId?.trim()) payload.voice_id = input.voiceId.trim();
    if (input.callbackUrl?.trim()) payload.callback_url = input.callbackUrl.trim();
    if (input.files?.length) {
      payload.files = input.files.slice(0, 20).map((f) => ({ type: 'url', url: f.url }));
    }

    this.log.log(
      `[AI-VIDEO][heygen] HEYGEN_SUBMIT POST /v3/video-agents mode=generate orientation=portrait files=${input.files?.length ?? 0}`,
    );

    const parsed = await this.request('POST', '/v3/video-agents', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: options?.timeoutMs ?? 45_000,
    });

    if (!parsed.ok) {
      const code = mapHeyGenHttpErrorCode(parsed.httpStatus, parsed.errorCode);
      throw Object.assign(
        new Error(
          parsed.httpStatus
            ? `HeyGen Video Agent HTTP ${parsed.httpStatus}: ${parsed.message ?? 'submit failed'}`
            : parsed.message ?? 'HeyGen Video Agent submit failed.',
        ),
        {
          code,
          httpStatus: parsed.httpStatus || undefined,
          providerCode: parsed.errorCode ?? undefined,
          providerMessage: parsed.message ?? undefined,
          sanitizedResponsePreview: parsed.rawBody ? parsed.rawBody.slice(0, 300) : undefined,
          pipelineStage: 'VIDEO_AGENT',
        },
      );
    }

    const submit = parseHeyGenVideoAgentSubmitResponse(parsed.rawBody);
    if (!submit.ok) {
      this.log.warn(
        `[AI-VIDEO][heygen] HEYGEN_SUBMIT shape=${submit.responseShape} preview=${submit.sanitizedPreview}`,
      );
      throw Object.assign(new Error(submit.message), {
        code: submit.code,
        httpStatus: parsed.httpStatus,
        sanitizedResponsePreview: submit.sanitizedPreview,
        responseShape: submit.responseShape,
        pipelineStage: 'VIDEO_AGENT',
      });
    }

    this.log.log(
      `[AI-VIDEO][heygen] HEYGEN_ACCEPTED sessionId=${submit.sessionId.slice(0, 8)}… shape=${submit.responseShape} status=${submit.status ?? 'unknown'}`,
    );
    return {
      sessionId: submit.sessionId,
      videoId: submit.videoId,
      mode: 'VIDEO_AGENT',
      providerStatus: submit.status,
      responseShape: submit.responseShape,
    };
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

    const json = JSON.parse(parsed.rawBody || '{}') as Record<string, unknown>;
    const sessionStatusRaw = extractHeyGenSessionStatus(json);
    const sessionStatus = normalizeHeyGenSessionStatus(sessionStatusRaw);
    const videoId = extractHeyGenVideoId(json);
    const sessionVideoUrl = extractHeyGenVideoUrl(json);

    if (sessionStatus === 'failed') {
      const data =
        json.data && typeof json.data === 'object' ? (json.data as Record<string, unknown>) : json;
      return {
        status: 'FAILED',
        sessionStatus: sessionStatusRaw,
        videoId,
        errorCode: 'HEYGEN_VIDEO_AGENT_PROCESSING_FAILED',
        errorMessage:
          (typeof data.failure_message === 'string' ? data.failure_message : null) ||
          (typeof data.failure_code === 'string' ? data.failure_code : null) ||
          'Video Agent session failed',
      };
    }

    if (sessionStatus === 'completed') {
      if (sessionVideoUrl) {
        return {
          status: 'READY',
          sessionStatus: sessionStatusRaw,
          videoId,
          videoUrl: sessionVideoUrl,
        };
      }
    }

    if (sessionStatus === 'completed' || sessionStatus === 'processing' || videoId) {
      if (!videoId) {
        return { status: 'PROCESSING', sessionStatus: sessionStatusRaw, videoId: null };
      }
      const video = await this.pollVideo(videoId);
      if (video.status === 'READY') return { ...video, sessionStatus: sessionStatusRaw, videoId };
      if (video.status === 'FAILED') return { ...video, sessionStatus: sessionStatusRaw, videoId };
      return { status: 'GENERATING', sessionStatus: sessionStatusRaw, videoId };
    }

    if (sessionStatus === 'queued') {
      return { status: 'QUEUED', sessionStatus: sessionStatusRaw, videoId };
    }

    return { status: 'PROCESSING', sessionStatus: sessionStatusRaw, videoId };
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

    const json = JSON.parse(parsed.rawBody || '{}') as Record<string, unknown>;
    const statusRaw = extractHeyGenSessionStatus(json);
    const status = normalizeHeyGenSessionStatus(statusRaw);

    if (status === 'completed') {
      const videoUrl = extractHeyGenVideoUrl(json);
      if (!videoUrl) {
        return {
          status: 'FAILED',
          errorCode: 'HEYGEN_VIDEO_AGENT_DOWNLOAD_FAILED',
          errorMessage: 'Video Agent completed without video_url',
        };
      }
      const data =
        json.data && typeof json.data === 'object' ? (json.data as Record<string, unknown>) : json;
      return {
        status: 'READY',
        videoId,
        videoUrl,
        durationSec: typeof data.duration === 'number' ? data.duration : undefined,
      };
    }

    if (status === 'failed') {
      const data =
        json.data && typeof json.data === 'object' ? (json.data as Record<string, unknown>) : json;
      return {
        status: 'FAILED',
        videoId,
        errorCode: 'HEYGEN_VIDEO_AGENT_PROCESSING_FAILED',
        errorMessage:
          (typeof data.failure_message === 'string' ? data.failure_message : null) ||
          (typeof data.failure_code === 'string' ? data.failure_code : null) ||
          'Video render failed',
      };
    }

    if (status === 'queued') {
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
    init?: { headers?: Record<string, string>; body?: string; timeoutMs?: number },
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
      const timeoutMs = init?.timeoutMs ?? 30_000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(`https://api.heygen.com${path}`, {
          method,
          headers: {
            'X-Api-Key': apiKey,
            ...(init?.headers ?? {}),
          },
          body: init?.body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
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
      const timedOut = err instanceof Error && err.name === 'AbortError';
      return {
        httpStatus: 0,
        ok: false,
        errorCode: timedOut ? 'timeout' : 'connection_error',
        message: timedOut ? `HeyGen request timeout (${init?.timeoutMs ?? 30_000} ms)` : message,
        rawBody: '',
      };
    }
  }
}
