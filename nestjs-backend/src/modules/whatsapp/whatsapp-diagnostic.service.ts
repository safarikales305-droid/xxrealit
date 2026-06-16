import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppSettingsService } from './whatsapp-settings.service';

const GRAPH_BASE = 'https://graph.facebook.com';

type GraphErrorBody = {
  error?: { message?: string; code?: number; type?: string };
};

export type WhatsAppWabaPhoneNumberRow = {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
};

export type WhatsAppWabaVerifyResult = {
  ok: boolean;
  wabaId: string;
  id?: string;
  name?: string;
  account_review_status?: string;
  message_template_namespace?: string;
  error?: string;
};

export type WhatsAppPhoneVerifyResult = {
  ok: boolean;
  phoneNumberId: string;
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  error?: string;
};

export type WhatsAppWabaAccountInfo = {
  id: string;
  name: string;
  account_review_status: string;
  message_template_namespace: string;
};

export type WhatsAppDiagnosticsResult = {
  ok: boolean;
  configuredPhoneNumberId: string;
  configuredWabaId: string;
  phone: {
    ok: boolean;
    phoneNumberId: string;
    id?: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    error?: string;
  };
  waba: {
    ok: boolean;
    wabaId: string;
    id?: string;
    name?: string;
    account_review_status?: string;
    message_template_namespace?: string;
    error?: string;
  };
  phoneBelongsToWaba: boolean | null;
  mismatchMessage: string | null;
  wabaPhoneNumbers: WhatsAppWabaPhoneNumberRow[];
  wabaPhoneNumbersError?: string;
};

export const WHATSAPP_PHONE_WABA_MISMATCH_MSG =
  'Phone Number ID a WABA ID patří k různým WhatsApp účtům.';

@Injectable()
export class WhatsAppDiagnosticService {
  private readonly logger = new Logger(WhatsAppDiagnosticService.name);

  constructor(
    private readonly config: WhatsAppConfigService,
    private readonly settings: WhatsAppSettingsService,
  ) {}

  private async graphGet<T extends Record<string, unknown>>(
    path: string,
    fields: string,
  ): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
    await this.settings.reload();
    const token = this.config.getAccessToken();
    if (!token) {
      throw new ServiceUnavailableException('Chybí WhatsApp access token.');
    }

    const apiVersion = this.config.getApiVersion();
    const url = new URL(`${GRAPH_BASE}/${apiVersion}/${path}`);
    url.searchParams.set('fields', fields);

    this.logger.log(`[WhatsApp Graph] GET ${url.toString()}`);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    const body = (await res.json().catch(() => ({}))) as T & GraphErrorBody;

    if (!res.ok) {
      const msg = body.error?.message?.trim() || `Meta API vrátilo HTTP ${res.status}`;
      this.logger.warn(`[WhatsApp Graph] GET ${path} failed: ${msg}`);
      return { ok: false, error: msg, status: res.status };
    }

    return { ok: true, data: body };
  }

  assertWabaNotConfusedWithOtherIds(wabaId: string) {
    const trimmed = wabaId.trim();
    const metaAppId = this.config.getMetaAppId();
    const metaBusinessId = this.config.getMetaBusinessId();

    if (metaAppId && trimmed === metaAppId) {
      throw new BadRequestException(
        'WhatsApp Business Account ID nesmí být stejné jako Meta App ID. Použijte WABA ID z WhatsApp Manageru.',
      );
    }
    if (metaBusinessId && trimmed === metaBusinessId) {
      throw new BadRequestException(
        'WhatsApp Business Account ID nesmí být stejné jako Meta Business ID. Použijte WABA ID z WhatsApp Manageru.',
      );
    }
  }

  async fetchPhoneNumberInfo(phoneNumberId: string): Promise<WhatsAppPhoneVerifyResult> {
    const result = await this.graphGet<{
      id?: string;
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
    }>(phoneNumberId, 'id,display_phone_number,verified_name,quality_rating');

    if (!result.ok) {
      return { ok: false, phoneNumberId, error: result.error };
    }

    return {
      ok: true,
      phoneNumberId,
      id: result.data.id,
      display_phone_number: result.data.display_phone_number,
      verified_name: result.data.verified_name,
      quality_rating: result.data.quality_rating,
    };
  }

  async listWabaPhoneNumbers(wabaId?: string): Promise<{
    ok: boolean;
    wabaId: string;
    phoneNumbers: WhatsAppWabaPhoneNumberRow[];
    error?: string;
  }> {
    const resolvedWabaId = (wabaId?.trim() || this.config.getBusinessAccountId() || '').trim();
    if (!resolvedWabaId) {
      throw new BadRequestException('Vyplňte WhatsApp Business Account ID (WABA ID).');
    }
    this.assertWabaNotConfusedWithOtherIds(resolvedWabaId);

    await this.settings.reload();
    const token = this.config.getAccessToken();
    if (!token) {
      throw new ServiceUnavailableException('Chybí WhatsApp access token.');
    }

    const apiVersion = this.config.getApiVersion();
    const url = new URL(`${GRAPH_BASE}/${apiVersion}/${resolvedWabaId}/phone_numbers`);
    url.searchParams.set(
      'fields',
      'id,display_phone_number,verified_name,quality_rating',
    );
    url.searchParams.set('limit', '100');

    this.logger.log(`[WhatsApp Graph] GET ${url.toString()}`);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    const body = (await res.json().catch(() => ({}))) as {
      data?: Array<{
        id?: string;
        display_phone_number?: string;
        verified_name?: string;
        quality_rating?: string;
      }>;
      error?: { message?: string };
    };

    if (!res.ok) {
      const msg = body.error?.message?.trim() || `Meta API vrátilo HTTP ${res.status}`;
      return { ok: false, wabaId: resolvedWabaId, phoneNumbers: [], error: msg };
    }

    const phoneNumbers: WhatsAppWabaPhoneNumberRow[] = (body.data ?? [])
      .map((row) => ({
        id: row.id?.trim() || '',
        display_phone_number: row.display_phone_number?.trim() || '',
        verified_name: row.verified_name?.trim() || '',
        quality_rating: row.quality_rating?.trim() || '',
      }))
      .filter((row) => row.id.length > 0);

    return { ok: true, wabaId: resolvedWabaId, phoneNumbers };
  }

  isPhoneInWabaList(
    phoneNumberId: string,
    wabaPhoneNumbers: WhatsAppWabaPhoneNumberRow[],
  ): boolean {
    return wabaPhoneNumbers.some((p) => p.id === phoneNumberId.trim());
  }

  async getDiagnostics(): Promise<WhatsAppDiagnosticsResult> {
    return this.buildDiagnostics();
  }

  async verifyWabaAccount(): Promise<WhatsAppWabaVerifyResult> {
    const wabaId = this.config.getBusinessAccountId();
    if (!wabaId) {
      throw new BadRequestException('Vyplňte WhatsApp Business Account ID (WABA ID).');
    }
    this.assertWabaNotConfusedWithOtherIds(wabaId);

    const result = await this.graphGet<{
      id?: string;
      name?: string;
      account_review_status?: string;
      message_template_namespace?: string;
    }>(wabaId, 'id,name,account_review_status,message_template_namespace');

    if (!result.ok) {
      return { ok: false, wabaId, error: result.error };
    }

    return {
      ok: true,
      wabaId,
      id: result.data.id,
      name: result.data.name,
      account_review_status: result.data.account_review_status,
      message_template_namespace: result.data.message_template_namespace,
    };
  }

  async verifyPhoneNumber(): Promise<WhatsAppPhoneVerifyResult> {
    const phoneNumberId = this.config.getPhoneNumberId();
    if (!phoneNumberId) {
      throw new BadRequestException('Vyplňte WhatsApp Phone Number ID.');
    }
    return this.fetchPhoneNumberInfo(phoneNumberId);
  }

  async fetchWabaAccountInfo(wabaId: string): Promise<WhatsAppWabaAccountInfo | null> {
    const result = await this.graphGet<{
      id?: string;
      name?: string;
      account_review_status?: string;
      message_template_namespace?: string;
    }>(wabaId, 'id,name,account_review_status,message_template_namespace');

    if (!result.ok || !result.data.id) return null;

    return {
      id: result.data.id,
      name: result.data.name?.trim() || '—',
      account_review_status: result.data.account_review_status?.trim() || '—',
      message_template_namespace: result.data.message_template_namespace?.trim() || '',
    };
  }

  async assertPhoneBelongsToConfiguredWaba(): Promise<void> {
    const diagnostics = await this.buildDiagnostics();
    if (diagnostics.phoneBelongsToWaba === false) {
      throw new BadRequestException(
        diagnostics.mismatchMessage ?? WHATSAPP_PHONE_WABA_MISMATCH_MSG,
      );
    }
  }

  async buildDiagnostics(): Promise<WhatsAppDiagnosticsResult> {
    const configuredPhoneNumberId = this.config.getPhoneNumberId() ?? '';
    const configuredWabaId = this.config.getBusinessAccountId() ?? '';

    const phone = configuredPhoneNumberId
      ? await this.fetchPhoneNumberInfo(configuredPhoneNumberId)
      : {
          ok: false,
          phoneNumberId: '',
          error: 'Phone Number ID není nastaveno.',
        };

    let waba: WhatsAppDiagnosticsResult['waba'];
    if (!configuredWabaId) {
      waba = { ok: false, wabaId: '', error: 'WABA ID není nastaveno.' };
    } else {
      try {
        this.assertWabaNotConfusedWithOtherIds(configuredWabaId);
        const wabaResult = await this.verifyWabaAccount();
        waba = {
          ok: wabaResult.ok,
          wabaId: configuredWabaId,
          id: wabaResult.id,
          name: wabaResult.name,
          account_review_status: wabaResult.account_review_status,
          message_template_namespace: wabaResult.message_template_namespace,
          error: wabaResult.error,
        };
      } catch (e: unknown) {
        const msg =
          e instanceof BadRequestException
            ? (e.getResponse() as { message?: string | string[] }).message
            : 'Neplatné WABA ID.';
        const text = Array.isArray(msg) ? msg.join(', ') : String(msg ?? 'Neplatné WABA ID.');
        waba = { ok: false, wabaId: configuredWabaId, error: text };
      }
    }

    let wabaPhoneNumbers: WhatsAppWabaPhoneNumberRow[] = [];
    let wabaPhoneNumbersError: string | undefined;
    if (configuredWabaId && waba.ok) {
      const listed = await this.listWabaPhoneNumbers(configuredWabaId);
      if (listed.ok) {
        wabaPhoneNumbers = listed.phoneNumbers;
      } else {
        wabaPhoneNumbersError = listed.error;
      }
    }

    let phoneBelongsToWaba: boolean | null = null;
    let mismatchMessage: string | null = null;

    if (configuredPhoneNumberId && configuredWabaId && wabaPhoneNumbers.length > 0) {
      phoneBelongsToWaba = this.isPhoneInWabaList(configuredPhoneNumberId, wabaPhoneNumbers);
      if (!phoneBelongsToWaba) {
        mismatchMessage = WHATSAPP_PHONE_WABA_MISMATCH_MSG;
      }
    } else if (
      configuredPhoneNumberId &&
      configuredWabaId &&
      waba.ok &&
      phone.ok &&
      wabaPhoneNumbers.length === 0 &&
      wabaPhoneNumbersError
    ) {
      phoneBelongsToWaba = null;
      mismatchMessage = `Nelze ověřit příslušnost čísla k WABA: ${wabaPhoneNumbersError}`;
    }

    const ok =
      Boolean(phone.ok) &&
      Boolean(waba.ok) &&
      phoneBelongsToWaba === true;

    this.logger.log(
      `[WhatsApp Diagnostics] phoneId=${configuredPhoneNumberId} wabaId=${configuredWabaId} ` +
        `phone=${phone.display_phone_number ?? '—'} waba=${waba.name ?? '—'} ` +
        `match=${phoneBelongsToWaba}`,
    );

    return {
      ok,
      configuredPhoneNumberId,
      configuredWabaId,
      phone,
      waba,
      phoneBelongsToWaba,
      mismatchMessage,
      wabaPhoneNumbers,
      wabaPhoneNumbersError,
    };
  }
}

export const JASPERS_MARKET_DEMO_PREFIX = 'jaspers_market';

/** Demo šablony Meta — nesmí být v marketingových kampaních. */
export function isExcludedCampaignTemplate(templateName: string): boolean {
  const lower = templateName.trim().toLowerCase();
  if (lower.startsWith(JASPERS_MARKET_DEMO_PREFIX)) return true;
  if (lower === 'hello_world') return true;
  return false;
}

export function isJaspersMarketDemo(
  templateNames: string[],
  messageTemplateNamespace?: string,
): boolean {
  const ns = messageTemplateNamespace?.toLowerCase() ?? '';
  if (ns.includes(JASPERS_MARKET_DEMO_PREFIX)) return true;
  return templateNames.some((n) => n.toLowerCase().startsWith(JASPERS_MARKET_DEMO_PREFIX));
}

export const WHATSAPP_WRONG_WABA_WARNING =
  'Načítáte šablony z jiného WhatsApp Business účtu než XXrealit.';
