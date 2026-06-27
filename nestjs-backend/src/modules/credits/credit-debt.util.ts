/** Vstup pro normalizaci stavu dluhu (Kč, celá čísla). */
export type CreditDebtInput = {
  realCreditBalance: number;
  bonusCreditBalance: number;
  creditDebt: number;
  accountLimited: boolean;
};

/**
 * Lead odečty nikdy nesmí vytvářet dluh. Dluh je jen neuhrazený závazek po zrušení/expiraci dobití.
 * Pokud má uživatel kladný placený nebo bonusový kredit, falešný dluh se nesmí zobrazovat ani uložit.
 */
export function normalizeCreditDebtState(input: CreditDebtInput): {
  creditDebt: number;
  accountLimited: boolean;
} {
  const spendable =
    Math.max(0, Math.trunc(input.realCreditBalance)) +
    Math.max(0, Math.trunc(input.bonusCreditBalance));
  const debt = Math.max(0, Math.trunc(input.creditDebt));

  if (debt <= 0) {
    return { creditDebt: 0, accountLimited: false };
  }
  if (spendable > 0) {
    return { creditDebt: 0, accountLimited: false };
  }
  if (!input.accountLimited) {
    return { creditDebt: 0, accountLimited: false };
  }
  return { creditDebt: debt, accountLimited: true };
}
