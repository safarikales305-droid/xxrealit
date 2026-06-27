import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCreditDebtState } from './credit-debt.util';

test('clears fake debt when user has paid credit', () => {
  const r = normalizeCreditDebtState({
    realCreditBalance: 500,
    bonusCreditBalance: 0,
    creditDebt: 50,
    accountLimited: true,
  });
  assert.equal(r.creditDebt, 0);
  assert.equal(r.accountLimited, false);
});

test('clears fake debt when user has bonus credit only', () => {
  const r = normalizeCreditDebtState({
    realCreditBalance: 0,
    bonusCreditBalance: 200,
    creditDebt: 50,
    accountLimited: true,
  });
  assert.equal(r.creditDebt, 0);
  assert.equal(r.accountLimited, false);
});

test('keeps real debt when no spendable credit and account limited', () => {
  const r = normalizeCreditDebtState({
    realCreditBalance: 0,
    bonusCreditBalance: 0,
    creditDebt: 50,
    accountLimited: true,
  });
  assert.equal(r.creditDebt, 50);
  assert.equal(r.accountLimited, true);
});

test('clears debt when accountLimited is false', () => {
  const r = normalizeCreditDebtState({
    realCreditBalance: 0,
    bonusCreditBalance: 0,
    creditDebt: 50,
    accountLimited: false,
  });
  assert.equal(r.creditDebt, 0);
  assert.equal(r.accountLimited, false);
});

test('clears zero or negative debt', () => {
  const r = normalizeCreditDebtState({
    realCreditBalance: 100,
    bonusCreditBalance: 0,
    creditDebt: 0,
    accountLimited: true,
  });
  assert.equal(r.creditDebt, 0);
  assert.equal(r.accountLimited, false);
});
