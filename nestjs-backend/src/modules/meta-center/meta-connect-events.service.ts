import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { getPublicPortalUrl } from '../social/autopost/social-publish-format.util';
import { META_TEST_EVENT_NAMES } from './meta-connect.constants';
import { MetaConnectOAuthService } from './meta-connect-oauth.service';
import { MetaGraphClientService } from './meta-graph-client.service';

const SETTINGS_ID = 'default';

@Injectable()
export class MetaConnectEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: MetaConnectOAuthService,
    private readonly graph: MetaGraphClientService,
  ) {}

  async sendTestEvent(
    eventName: string,
    listingId?: string,
  ): Promise<{ ok: boolean; error?: string; response?: unknown }> {
    const row = await this.prisma.metaCenterSetting.findUnique({ where: { id: SETTINGS_ID } });
    const pixelId = row?.pixelId?.trim();
    if (!pixelId) {
      return { ok: false, error: 'Pixel ID chybí — připojte Meta účet nebo vytvořte Pixel.' };
    }

    let token: string;
    try {
      token = await this.oauth.resolveAccessToken();
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Chybí access token.' };
    }

    const origin = getPublicPortalUrl();
    const eventTime = Math.floor(Date.now() / 1000);
    const testEventCode = row?.testEventCode ?? `TEST${pixelId.slice(-6)}`;

    const eventPayload = {
      event_name: eventName,
      event_time: eventTime,
      event_id: `xxrealit_${eventName}_${eventTime}`,
      action_source: 'website',
      event_source_url: listingId ? `${origin}/nemovitost/${listingId}` : origin,
      user_data: {
        client_ip_address: '127.0.0.1',
        client_user_agent: 'XXREALIT-MetaCenter/1.0',
      },
      custom_data: listingId ? { content_ids: [listingId], content_type: 'product' } : undefined,
    };

    const res = await this.graph.post<{ events_received?: number; fbtrace_id?: string }>(
      `/${pixelId}/events`,
      token,
      {
        data: JSON.stringify([eventPayload]),
        test_event_code: testEventCode,
      },
    );

    await this.prisma.metaCenterEventLog.create({
      data: {
        eventType: eventName,
        listingId: listingId ?? null,
        source: res.ok ? 'capi' : 'pixel',
        result: res.ok ? 'ok' : 'error',
        status: res.ok ? String(res.data.events_received ?? 1) : res.errorCode,
        request: JSON.parse(
          JSON.stringify({ event: eventPayload, test_event_code: testEventCode }),
        ) as Prisma.InputJsonValue,
        response: JSON.parse(
          JSON.stringify(res.ok ? res.data : { error: res.errorMessage }),
        ) as Prisma.InputJsonValue,
      },
    });

    if (!res.ok) {
      return { ok: false, error: res.errorMessage, response: res.data };
    }
    return { ok: true, response: res.data };
  }

  async testAllEvents(): Promise<{
    ok: boolean;
    results: Array<{ event: string; ok: boolean; error?: string }>;
  }> {
    const results: Array<{ event: string; ok: boolean; error?: string }> = [];
    for (const event of META_TEST_EVENT_NAMES) {
      const r = await this.sendTestEvent(event);
      results.push({ event, ok: r.ok, error: r.error });
    }
    const ok = results.every((r) => r.ok);
    return { ok, results };
  }
}
