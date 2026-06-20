import { ForbiddenException } from '@nestjs/common';

export const WHATSAPP_VERIFY_CREDITS_MSG =
  'Pro dobití kreditu musíte nejdříve ověřit telefonní číslo přes WhatsApp.';

export const WHATSAPP_VERIFY_TIPAR_MSG =
  'Pro používání tipaře musíte mít ověřené WhatsApp číslo.';

export const WHATSAPP_VERIFY_PROFESSIONAL_MSG =
  'Pro ověření profilu musíte ověřit WhatsApp číslo.';

export type WhatsAppVerificationUser = {
  whatsappVerified?: boolean | null;
};

export function assertWhatsAppVerified(
  user: WhatsAppVerificationUser | null | undefined,
  message: string,
): void {
  if (!user?.whatsappVerified) {
    throw new ForbiddenException(message);
  }
}
