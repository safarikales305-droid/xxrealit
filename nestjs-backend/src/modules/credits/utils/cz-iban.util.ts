/** Převod českého účtu (číslo + kód banky) na IBAN pro SPD QR platbu. */
export function czAccountToIban(accountNumber: string, bankCode: string): string | null {
  const bank = bankCode.replace(/\D/g, '').padStart(4, '0').slice(-4);
  if (!bank || bank === '0000') return null;

  const raw = accountNumber.replace(/\s/g, '');
  let prefix = '000000';
  let number = raw.replace(/\D/g, '');

  if (raw.includes('-')) {
    const [p, n] = raw.split('-');
    prefix = (p ?? '').replace(/\D/g, '').padStart(6, '0').slice(-6);
    number = (n ?? '').replace(/\D/g, '');
  } else if (raw.includes('/')) {
    const [n, b] = raw.split('/');
    number = (n ?? '').replace(/\D/g, '');
    if (b) {
      const parsedBank = b.replace(/\D/g, '').padStart(4, '0').slice(-4);
      if (parsedBank !== '0000') {
        return czAccountToIban(number, parsedBank);
      }
    }
  }

  if (!number) return null;

  const bban = `${bank}${prefix.padStart(6, '0')}${number.padStart(10, '0')}`;
  const rearranged = `${bban}CZ00`;
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 1) {
    remainder = (remainder * 10 + Number(numeric[i])) % 97;
  }
  const check = String(98 - remainder).padStart(2, '0');
  return `CZ${check}${bban}`;
}
