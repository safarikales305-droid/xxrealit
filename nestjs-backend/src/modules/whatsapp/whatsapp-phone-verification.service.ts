import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import {
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AccountUniquenessService } from '../../common/account-uniqueness.service';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppCloudApiService } from './whatsapp-cloud-api.service';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppDiagnosticService } from './whatsapp-diagnostic.service';
import { WhatsAppMetaTemplatesService } from './whatsapp-meta-templates.service';
import { WhatsAppSettingsService } from './whatsapp-settings.service';
import {
  buildTemplateMessageRequest,
  formatMetaApiError,
  formatTemplateLogLabel,
  resolveUrlButtonSendParameters,
  WHATSAPP_VERIFY_DEFAULT_URL_BUTTON_PARAM,
} from './whatsapp-template-send.util';
import { resolveTemplateRequirementsFromRaw } from './whatsapp-template-sync.util';
import { normalizeToE164, whatsAppDigits } from './whatsapp-phone.util';
import { WHATSAPP_VERIFY_NOT_SAVED_MSG } from './whatsapp-system-templates.util';
import { WHATSAPP_ALREADY_USED_MSG } from '../../common/account-uniqueness.constants';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const NOTIFICATION_TYPE = 'WHATSAPP_PHONE_VERIFY';

@Injectable()
export class WhatsAppPhoneVerificationService {
  private readonly logger = new Logger(WhatsAppPhoneVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountUniqueness: AccountUniquenessService,
    private readonly settings: WhatsAppSettingsService,
    private readonly config: WhatsAppConfigService,
    private readonly metaTemplates: WhatsAppMetaTemplatesService,
    private readonly cloudApi: WhatsAppCloudApiService,
    private readonly diagnostic: WhatsAppDiagnosticService,
  ) {}

  serializeStatus(user: {
    whatsappPhone: string;
    whatsappVerified: boolean;
    whatsappVerifiedAt: Date | null;
    whatsappVerificationExpiresAt: Date | null;
    whatsappVerificationSentAt: Date | null;
    whatsappVerificationAttempts: number;
  }) {
    const now = Date.now();
    const sentAt = user.whatsappVerificationSentAt?.getTime() ?? 0;
    const resendAvailableAt =
      sentAt > 0 ? new Date(sentAt + RESEND_COOLDOWN_MS).toISOString() : null;
    const canResend =
      !user.whatsappVerified &&
      (sentAt === 0 || now - sentAt >= RESEND_COOLDOWN_MS);

    return {
      whatsappPhone: user.whatsappPhone,
      whatsappVerified: user.whatsappVerified,
      whatsappVerifiedAt: user.whatsappVerifiedAt?.toISOString() ?? null,
      pendingVerification:
        !user.whatsappVerified &&
        Boolean(user.whatsappVerificationExpiresAt) &&
        user.whatsappVerificationExpiresAt!.getTime() > now,
      verificationExpiresAt: user.whatsappVerificationExpiresAt?.toISOString() ?? null,
      verificationAttempts: user.whatsappVerificationAttempts,
      maxVerificationAttempts: MAX_VERIFY_ATTEMPTS,
      canResend,
      resendAvailableAt: canResend ? null : resendAvailableAt,
    };
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        whatsappPhone: true,
        whatsappVerified: true,
        whatsappVerifiedAt: true,
        whatsappVerificationExpiresAt: true,
        whatsappVerificationSentAt: true,
        whatsappVerificationAttempts: true,
      },
    });
    if (!user) throw new BadRequestException('Uživatel nenalezen.');
    return this.serializeStatus(user);
  }

  async requestCode(userId: string, phoneRaw: string) {
    const phone = normalizeToE164(phoneRaw.trim());
    if (!phone) {
      throw new BadRequestException(
        'Zadejte platné telefonní číslo ve formátu +420123456789.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        whatsappVerified: true,
        whatsappVerificationSentAt: true,
      },
    });
    if (!user) throw new BadRequestException('Uživatel nenalezen.');
    if (user.whatsappVerified) {
      throw new BadRequestException('WhatsApp číslo je již ověřené.');
    }

    await this.accountUniqueness.assertWhatsAppPhoneAvailable(phone, userId);

    const now = Date.now();
    const lastSent = user.whatsappVerificationSentAt?.getTime() ?? 0;
    if (lastSent > 0 && now - lastSent < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSent)) / 1000);
      throw new HttpException(
        `Nový kód můžete požádat za ${waitSec} s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!this.config.isCloudApiConfigured()) {
      throw new BadRequestException(
        'Odeslání ověřovacího kódu přes WhatsApp není nakonfigurováno.',
      );
    }

    await this.settings.reload();
    const stored = this.settings.getStoredSettings();
    if (!stored.whatsappVerifyTemplateName?.trim()) {
      throw new BadRequestException(WHATSAPP_VERIFY_NOT_SAVED_MSG);
    }

    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(now + CODE_TTL_MS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        whatsappPhone: phone,
        whatsappVerificationCode: code,
        whatsappVerificationExpiresAt: expiresAt,
        whatsappVerificationAttempts: 0,
        whatsappVerificationSentAt: new Date(now),
      },
    });

    const sendResult = await this.sendVerifyTemplate(phone, code, userId);
    if (!sendResult.ok) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          whatsappVerificationCode: null,
          whatsappVerificationExpiresAt: null,
          whatsappVerificationSentAt: null,
        },
      });
      throw new BadRequestException(
        sendResult.error ?? 'Nepodařilo se odeslat ověřovací kód přes WhatsApp.',
      );
    }

    return {
      ok: true,
      message: 'Ověřovací kód byl odeslán na WhatsApp.',
      ...this.serializeStatus({
        whatsappPhone: phone,
        whatsappVerified: false,
        whatsappVerifiedAt: null,
        whatsappVerificationExpiresAt: expiresAt,
        whatsappVerificationSentAt: new Date(now),
        whatsappVerificationAttempts: 0,
      }),
    };
  }

  async confirmCode(userId: string, codeInput: string) {
    const code = codeInput.trim();
    if (!/^\d{4,8}$/.test(code)) {
      throw new BadRequestException('Zadejte platný ověřovací kód.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        whatsappVerified: true,
        whatsappVerificationCode: true,
        whatsappVerificationExpiresAt: true,
        whatsappVerificationAttempts: true,
        whatsappPhone: true,
        whatsappVerificationSentAt: true,
        whatsappVerifiedAt: true,
      },
    });
    if (!user) throw new BadRequestException('Uživatel nenalezen.');
    if (user.whatsappVerified) {
      return {
        ok: true,
        message: 'WhatsApp číslo je již ověřené.',
        ...this.serializeStatus({
          ...user,
          whatsappVerificationAttempts: user.whatsappVerificationAttempts,
        }),
      };
    }

    if (!user.whatsappVerificationCode || !user.whatsappVerificationExpiresAt) {
      throw new BadRequestException(
        'Nejdříve požádejte o ověřovací kód přes WhatsApp.',
      );
    }

    if (user.whatsappVerificationExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Ověřovací kód vypršel. Požádejte o nový kód.',
      );
    }

    if (user.whatsappVerificationAttempts >= MAX_VERIFY_ATTEMPTS) {
      throw new HttpException(
        'Překročen maximální počet pokusů. Požádejte o nový kód.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (user.whatsappVerificationCode !== code) {
      const attempts = user.whatsappVerificationAttempts + 1;
      await this.prisma.user.update({
        where: { id: userId },
        data: { whatsappVerificationAttempts: attempts },
      });
      const remaining = MAX_VERIFY_ATTEMPTS - attempts;
      if (remaining <= 0) {
        throw new HttpException(
          'Překročen maximální počet pokusů. Požádejte o nový kód.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new BadRequestException(
        `Neplatný kód. Zbývá ${remaining} pokusů.`,
      );
    }

    const phone = user.whatsappPhone;
    await this.accountUniqueness.assertWhatsAppPhoneAvailable(phone, userId);

    const verifiedAt = new Date();
    let updated;
    try {
      updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          whatsappVerified: true,
          whatsappVerifiedAt: verifiedAt,
          whatsappVerifiedPhone: phone,
          whatsappVerificationCode: null,
          whatsappVerificationExpiresAt: null,
          whatsappVerificationAttempts: 0,
          whatsappVerificationSentAt: null,
        },
        select: {
          whatsappPhone: true,
          whatsappVerified: true,
          whatsappVerifiedAt: true,
          whatsappVerificationExpiresAt: true,
          whatsappVerificationSentAt: true,
          whatsappVerificationAttempts: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException(WHATSAPP_ALREADY_USED_MSG);
      }
      throw err;
    }

    return {
      ok: true,
      message: 'WhatsApp číslo bylo úspěšně ověřeno.',
      ...this.serializeStatus(updated),
    };
  }

  async adminMarkVerified(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { whatsappPhone: true },
    });
    if (!user) throw new BadRequestException('Uživatel nenalezen.');
    if (!user.whatsappPhone?.trim()) {
      throw new BadRequestException('Uživatel nemá uložené WhatsApp číslo.');
    }

    await this.accountUniqueness.assertWhatsAppPhoneAvailable(user.whatsappPhone, userId);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        whatsappVerified: true,
        whatsappVerifiedAt: new Date(),
        whatsappVerifiedPhone: user.whatsappPhone,
        whatsappVerificationCode: null,
        whatsappVerificationExpiresAt: null,
        whatsappVerificationAttempts: 0,
        whatsappVerificationSentAt: null,
      },
      select: {
        whatsappPhone: true,
        whatsappVerified: true,
        whatsappVerifiedAt: true,
        whatsappVerificationExpiresAt: true,
        whatsappVerificationSentAt: true,
        whatsappVerificationAttempts: true,
      },
    });

    return { ok: true, ...this.serializeStatus(updated) };
  }

  async adminResetVerification(userId: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        whatsappVerified: false,
        whatsappVerifiedAt: null,
        whatsappVerifiedPhone: null,
        whatsappVerificationCode: null,
        whatsappVerificationExpiresAt: null,
        whatsappVerificationAttempts: 0,
        whatsappVerificationSentAt: null,
      },
      select: {
        whatsappPhone: true,
        whatsappVerified: true,
        whatsappVerifiedAt: true,
        whatsappVerificationExpiresAt: true,
        whatsappVerificationSentAt: true,
        whatsappVerificationAttempts: true,
      },
    });

    return { ok: true, ...this.serializeStatus(updated) };
  }

  async testVerificationTemplate(toPhone?: string): Promise<{ ok: boolean; error?: string }> {
    await this.settings.reload();
    const stored = this.settings.getStoredSettings();
    if (!stored.whatsappVerifyTemplateName?.trim()) {
      return { ok: false, error: WHATSAPP_VERIFY_NOT_SAVED_MSG };
    }
    const phone =
      normalizeToE164(toPhone?.trim() || this.config.getTestPhone() || '') ??
      normalizeToE164(stored.testPhone);
    if (!phone) {
      return { ok: false, error: 'Zadejte platné testovací telefonní číslo (+420…).' };
    }
    this.logger.log(
      `Test verify template from DB: ${stored.whatsappVerifyTemplateName} (${stored.whatsappVerifyTemplateLanguage || '—'})`,
    );
    return this.sendVerifyTemplate(phone, '123456', null);
  }

  private async resolveVerifyTemplateRow() {
    const stored = this.settings.getStoredSettings();
    const name = stored.whatsappVerifyTemplateName?.trim();
    const language = stored.whatsappVerifyTemplateLanguage?.trim();
    if (!name) {
      throw new BadRequestException(WHATSAPP_VERIFY_NOT_SAVED_MSG);
    }
    this.logger.log(`Resolve verify template: ${name} (${language || '—'})`);
    return this.metaTemplates.requireApprovedTemplateByNameAndLanguage(name, language);
  }

  private async sendVerifyTemplate(
    phoneE164: string,
    code: string,
    userId: string | null,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.settings.reload();
      await this.diagnostic.assertPhoneBelongsToConfiguredWaba();
      const tplRow = await this.resolveVerifyTemplateRow();
      const reqs = resolveTemplateRequirementsFromRaw(tplRow.rawTemplate);
      const stored = this.settings.getStoredSettings();
      const variablesCount = reqs.variablesCount ?? 1;
      const bodyParameters = [code];
      for (let i = 1; i < variablesCount; i += 1) {
        bodyParameters.push(code);
      }

      const urlButtonParamText =
        stored.whatsappVerifyUrlButtonParameter?.trim() ||
        WHATSAPP_VERIFY_DEFAULT_URL_BUTTON_PARAM;
      const urlButtonParameters = resolveUrlButtonSendParameters({
        urlButtonParameters: reqs.urlButtons.map((btn) => ({
          index: btn.index,
          text: urlButtonParamText,
        })),
        urlButtonParamCount: reqs.urlButtonParamCount,
        urlButtonIndices: reqs.urlButtons.map((btn) => btn.index),
        defaultUrlButtonParameter: urlButtonParamText,
        needsUrlButtonParameter: reqs.needsUrlButtonParameter,
      });

      const headerRaw = reqs.headerFormat ?? reqs.headerType ?? 'NONE';
      const headerType =
        headerRaw === 'IMAGE' || headerRaw === 'TEXT' ? headerRaw : ('NONE' as const);

      const requestBody = buildTemplateMessageRequest(
        whatsAppDigits(phoneE164),
        {
          templateName: tplRow.templateName,
          languageCode: tplRow.language,
          bodyParameters,
          variablesCount,
          headerType,
          headerImageMediaId: undefined,
          urlButtonParameters,
          urlButtonParamCount: reqs.urlButtonParamCount,
          urlButtonIndices: reqs.urlButtons.map((btn) => btn.index),
          defaultUrlButtonParameter: urlButtonParamText,
          needsHeaderImage: reqs.needsHeaderImage,
          needsUrlButtonParameter: reqs.needsUrlButtonParameter,
        },
      );

      const logLabel = formatTemplateLogLabel(
        tplRow.templateName,
        tplRow.language,
        bodyParameters,
        headerType,
      );

      const { providerMessageId, error } = await this.cloudApi.sendMessages(requestBody, {
        recipientPhone: phoneE164,
        recipientUserId: userId ?? undefined,
        logLabel,
        templateName: tplRow.templateName,
        templateLanguage: tplRow.language,
        variablesCount,
        headerType,
        urlButtonParamCount: reqs.urlButtonParamCount,
        needsHeaderImage: reqs.needsHeaderImage,
        needsUrlButtonParameter: reqs.needsUrlButtonParameter,
      });

      const status = providerMessageId
        ? WhatsAppMessageStatus.SENT
        : WhatsAppMessageStatus.FAILED;
      const errorMessage = providerMessageId ? null : formatMetaApiError(error);

      await this.prisma.whatsAppMessage.create({
        data: {
          userId: userId ?? null,
          notificationType: NOTIFICATION_TYPE,
          direction: WhatsAppMessageDirection.OUTBOUND,
          fromPhone: '',
          toPhone: phoneE164,
          message: logLabel,
          status,
          providerMessageId,
          errorMessage,
        },
      });

      if (!providerMessageId) {
        return { ok: false, error: errorMessage ?? 'Meta nevrátilo ID zprávy.' };
      }
      return { ok: true };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[wa-verify] send failed: ${errorMessage}`);
      return { ok: false, error: errorMessage };
    }
  }

  async beginPhoneChange(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { whatsappVerified: true },
    });
    if (!user) throw new BadRequestException('Uživatel nenalezen.');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        whatsappVerified: false,
        whatsappVerifiedAt: null,
        whatsappVerifiedPhone: null,
        whatsappVerificationCode: null,
        whatsappVerificationExpiresAt: null,
        whatsappVerificationAttempts: 0,
        whatsappVerificationSentAt: null,
      },
    });

    return this.getStatus(userId);
  }
}
