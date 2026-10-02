import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createMoney, convertMoney, displayMoney, formatMoney, sumOriginals, consolidateMoney } from '../src/money.js';
import { createState, setDisplayCurrency, setBCV, saveState, loadState } from '../src/state.js';

const date = '2026-10-02';
const rate = value => ({ value, source: 'BCV', timestamp: '2026-10-02T12:00:00Z' });
const state = (value = 36.5) => createState({ managedDate: date, rates: { VES_USD_BCV: rate(value) } });
const ves = () => createMoney(36500000, 'VES');
const usd = () => createMoney(1000000, 'USD');
const missing = fn => assert.throws(fn, { code: 'MISSING_EXCHANGE_RATE' });

test('QA 01 — 36.500.000 VES @ 36,50 = 1.000.000 USD', () => {
  assert.deepEqual(convertMoney(ves(), 'USD', state()), { amount: 1000000, currency: 'USD' });
});
test('QA 02 — 1.000.000 USD @ 36,50 = 36.500.000 VES', () => {
  assert.deepEqual(convertMoney(usd(), 'VES', state()), { amount: 36500000, currency: 'VES' });
});
test('QA 03 — VES→USD no cambia amount_original', () => {
  const original = ves(); const before = structuredClone(original);
  displayMoney(original, setDisplayCurrency(state(), 'USD'));
  assert.deepEqual(original, before);
});
test('QA 04 — USD→VES reproduce original dentro de tolerancia', () => {
  for (const value of [36500000, 1234.56, 0, -42.37]) {
    const equivalent = convertMoney(createMoney(value, 'VES'), 'USD', state());
    const back = convertMoney(createMoney(equivalent.amount, 'USD'), 'VES', state());
    assert.ok(Math.abs(back.amount - value) <= 1e-8);
  }
});
test('QA 05 — BCV cero bloquea USD', () => {
  missing(() => setDisplayCurrency(state(0), 'USD'));
  missing(() => convertMoney(ves(), 'USD', state(0)));
  missing(() => convertMoney(usd(), 'USD', state(0)));
});
test('QA 06 — BCV nula bloquea USD', () => {
  missing(() => setDisplayCurrency(state(null), 'USD'));
  missing(() => convertMoney(ves(), 'USD', state(null)));
  missing(() => convertMoney(usd(), 'VES', state(null)));
});
test('QA 07 — registro USD conserva USD original', () => {
  const original = usd(); displayMoney(original, state());
  assert.deepEqual(original, { amount_original: 1000000, currency_original: 'USD' });
  assert.throws(() => { original.currency_original = 'VES'; }, TypeError);
});
test('QA 08 — registro VES conserva VES original', () => {
  const original = ves(); formatMoney(original, setDisplayCurrency(state(), 'USD'));
  assert.deepEqual(original, { amount_original: 36500000, currency_original: 'VES' });
  assert.throws(() => { original.amount_original = 1; }, TypeError);
});
test('QA 09 — EUR sin tasa => MISSING_EXCHANGE_RATE', () => {
  for (const code of ['EUR', 'GBP']) for (const target of ['VES', 'USD']) missing(() => convertMoney(createMoney(10, code), target, state()));
  const explicit = createState({ managedDate: date, rates: { VES_USD_BCV: rate(36.5), EUR_VES: rate(40) } });
  assert.equal(convertMoney(createMoney(10, 'EUR'), 'VES', explicit).amount, 400);
});
test('QA 10 — prohibido consolidar VES+USD por suma directa', () => {
  assert.throws(() => sumOriginals([ves(), usd()]), { code: 'MIXED_CURRENCIES' });
  assert.equal(sumOriginals([ves(), ves()]).amount_original, 73000000);
  assert.equal(consolidateMoney([ves(), usd()], 'VES', state()).amount, 73000000);
  missing(() => consolidateMoney([ves(), createMoney(1, 'EUR')], 'VES', state()));
});
test('QA 11 — vista inicial VES', () => {
  const initial = createState({ managedDate: date });
  assert.equal(initial.displayCurrency, 'VES');
  assert.equal(displayMoney(ves(), initial).amount, 36500000);
  assert.throws(() => setDisplayCurrency(initial, 'EUR'), { code: 'INVALID_DISPLAY_CURRENCY' });
});
test('QA 12 — vista, fecha y BCV persisten al recargar', () => {
  const data = new Map(); const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  assert.equal(loadState(storage), null);
  const saved = setDisplayCurrency(state(), 'USD'); saveState(storage, saved);
  assert.deepEqual(loadState(storage), saved);
  assert.equal(displayMoney(ves(), loadState(storage)).amount, 1000000);
});
test('QA 13 — BCV vinculada a managedDate', () => {
  const current = state();
  assert.throws(() => setBCV(current, '2026-10-03', rate(40)), /RATE_DATE_MISMATCH/);
  assert.equal(setBCV(current, date, rate(40)).managedDate, date);
  const next = createState({ managedDate: '2026-10-03' });
  missing(() => setDisplayCurrency(next, 'USD'));
  assert.throws(() => createState({ managedDate: '2026-02-30' }), { code: 'INVALID_MANAGED_DATE' });
});
test('QA 14 — cambio BCV recalcula equivalentes, no originales', () => {
  const original = ves(); const before = structuredClone(original);
  const current = setDisplayCurrency(state(), 'USD');
  const updated = setBCV(current, date, rate(40));
  assert.equal(displayMoney(original, current).amount, 1000000);
  assert.equal(displayMoney(original, updated).amount, 912500);
  assert.deepEqual(original, before);
  assert.equal(current.rates.VES_USD_BCV.value, 36.5);
  missing(() => setBCV(current, date, rate(0)));
});
test('QA 15 — única implementación central de conversión y formateo', () => {
  const files = readdirSync(new URL('../src/', import.meta.url)).filter(f => f.endsWith('.js'));
  const sources = files.map(f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'));
  assert.equal(sources.join('\n').match(/export function convertMoney\(/g)?.length, 1);
  assert.equal(sources.join('\n').match(/new Intl.NumberFormat/g)?.length, 1);
  assert.ok(readFileSync(new URL('../src/state.js', import.meta.url), 'utf8').includes("from './money.js'"));
  assert.equal(formatMoney(ves(), state(), 'en-US'), new Intl.NumberFormat('en-US', { style: 'currency', currency: 'VES' }).format(36500000));
});
