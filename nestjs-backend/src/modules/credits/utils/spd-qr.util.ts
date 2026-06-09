import { czAccountToIban } from './cz-iban.util';

export type SpdPaymentInput = {
  accountNumber: string;
  bankCode: string;
  amountCzk: number;
  variableSymbol: string;
  message: string;
};

/** Český QR platební standard SPD 1.0 */
export function buildSpdPayload(input: SpdPaymentInput): string {
  const iban = czAccountToIban(input.accountNumber, input.bankCode);
  const bank = input.bankCode.replace(/\D/g, '').padStart(4, '0').slice(-4);
  const acc = iban ? `${iban}/${bank}` : `${input.accountNumber.replace(/\s/g, '')}/${bank}`;
  const amount = input.amountCzk.toFixed(2);
  const msg = input.message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*]/g, ' ')
    .trim()
    .slice(0, 60);
  const vs = input.variableSymbol.replace(/\D/g, '').slice(0, 10);

  const parts = [
    'SPD*1.0',
    `ACC:${acc}`,
    `AM:${amount}`,
    'CC:CZK',
    `X-VS:${vs}`,
    `MSG:${msg}`,
  ];
  return parts.join('*');
}

export function buildQrImageUrl(payload: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payload)}`;
}
