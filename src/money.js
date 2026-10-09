/** Central monetary library. Rates express target units per source unit,
 * except VES_USD_BCV, whose contract is VES per USD. No implicit rates. */
export class MonetaryError extends Error {
  constructor(code) { super(code); this.name = 'MonetaryError'; this.code = code; }
}
const fail = (code) => { throw new MonetaryError(code); };
const currency = (value) => {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) fail('INVALID_CURRENCY');
  return value;
};
const amount = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID_AMOUNT');
  return value;
};
// Exact decimal arithmetic for original monetary movements; never rounds.
// Numbers are interpreted by their public decimal representation (not IEEE754 residues).
function decimalParts(value) {
  amount(value);
  const match = String(value).match(/^(-?)(\\d+)(?:\\.(\\d+))?(?:e([+-]?\\d+))?$/i);
  if (!match) fail('INVALID_AMOUNT');
  const exponent = Number(match[4] ?? 0);
  const fraction = match[3] ?? '';
  const scale = fraction.length - exponent;
  if (!Number.isSafeInteger(scale) || Math.abs(scale) > 1000) fail('MONETARY_PRECISION_UNSUPPORTED');
  let units = BigInt(match[2] + fraction) * (match[1] ? -1n : 1n);
  if (scale < 0) units *= 10n ** BigInt(-scale);
  return { units, scale: Math.max(0, scale) };
}
function exactDecimal(left, right, operation) {
  const a = decimalParts(left), b = decimalParts(right);
  const scale = Math.max(a.scale, b.scale);
  const x = a.units * 10n ** BigInt(scale - a.scale);
  const y = b.units * 10n ** BigInt(scale - b.scale);
  const result = operation === 'add' ? x + y : operation === 'sub' ? x - y : null;
  if (operation === 'compare') return x < y ? -1 : x > y ? 1 : 0;
  let digits = (result < 0n ? -result : result).toString().padStart(scale + 1, '0');
  const exact = (result < 0n ? '-' : '') + (scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits);
  const numeric = Number(exact);
  if (!Number.isFinite(numeric)) fail('MONETARY_PRECISION_UNSUPPORTED');
  const back = decimalParts(numeric);
  const target = decimalPartsFromLiteral(exact);
  const finalScale = Math.max(back.scale, target.scale);
  if (back.units * 10n ** BigInt(finalScale - back.scale) !== target.units * 10n ** BigInt(finalScale - target.scale)) fail('MONETARY_PRECISION_UNSUPPORTED');
  return numeric;
}
function decimalPartsFromLiteral(value) {
  const match = value.match(/^(-?)(\\d+)(?:\\.(\\d+))?$/);
  const fraction = match[3] ?? '';
  return { units: BigInt(match[2] + fraction) * (match[1] ? -1n : 1n), scale: fraction.length };
}
export const addDecimal = (a, b) => exactDecimal(a, b, 'add');
export const subtractDecimal = (a, b) => exactDecimal(a, b, 'sub');
export const compareDecimal = (a, b) => exactDecimal(a, b, 'compare');

export function createMoney(amount_original, currency_original) {
  return Object.freeze({ amount_original: amount(amount_original), currency_original: currency(currency_original) });
}
function rateValue(rate) {
  if (!rate || typeof rate.value !== 'number' || !Number.isFinite(rate.value) || rate.value <= 0) {
    fail('MISSING_EXCHANGE_RATE');
  }
  return rate.value;
}
export function validateState(state) {
  if (!state || typeof state.managedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(state.managedDate)) fail('INVALID_MANAGED_DATE');
  const date = new Date(`${state.managedDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== state.managedDate) fail('INVALID_MANAGED_DATE');
  if (!['VES', 'USD'].includes(state.displayCurrency)) fail('INVALID_DISPLAY_CURRENCY');
  if (!state.rates || typeof state.rates !== 'object' || Array.isArray(state.rates) || !Object.hasOwn(state.rates, 'VES_USD_BCV')) fail('INVALID_RATES');
  for (const rate of Object.values(state.rates)) {
    if (!rate || typeof rate !== 'object' || !Object.hasOwn(rate, 'value') || !Object.hasOwn(rate, 'source') || !Object.hasOwn(rate, 'timestamp')) fail('INVALID_RATES');
    if (rate.value !== null && (typeof rate.value !== 'number' || !Number.isFinite(rate.value) || rate.value < 0)) fail('INVALID_RATES');
    if (rate.source !== null && typeof rate.source !== 'string') fail('INVALID_RATES');
    if (rate.timestamp !== null && (typeof rate.timestamp !== 'string' || !Number.isFinite(Date.parse(rate.timestamp)))) fail('INVALID_RATES');
  }
  if (state.displayCurrency === 'USD') rateValue(state.rates.VES_USD_BCV);
  return state;
}
export function convertMoney(record, targetCurrency, state) {
  validateState(state);
  const original = createMoney(record.amount_original, record.currency_original);
  currency(targetCurrency);
  // USD equivalence is unavailable without a valid daily BCV, even for USD input.
  if (targetCurrency === 'USD') rateValue(state.rates.VES_USD_BCV);
  const from = original.currency_original;
  let value = original.amount_original;
  if (from !== targetCurrency) {
    if (from === 'VES' && targetCurrency === 'USD') value /= rateValue(state.rates.VES_USD_BCV);
    else if (from === 'USD' && targetCurrency === 'VES') value *= rateValue(state.rates.VES_USD_BCV);
    else value *= rateValue(state.rates[`${from}_${targetCurrency}`]);
  }
  return Object.freeze({ amount: amount(value), currency: targetCurrency });
}
export function displayMoney(record, state) {
  return convertMoney(record, state.displayCurrency, state);
}
export function formatMoney(record, state, locale = 'es-VE') {
  const view = displayMoney(record, state);
  return new Intl.NumberFormat(locale, { style: 'currency', currency: view.currency }).format(view.amount);
}
export function sumOriginals(records) {
  if (!records.length) fail('EMPTY_MONETARY_COLLECTION');
  const originals = records.map(r => createMoney(r.amount_original, r.currency_original));
  if (originals.some(r => r.currency_original !== originals[0].currency_original)) fail('MIXED_CURRENCIES');
  return createMoney(originals.reduce((total, r) => total + r.amount_original, 0), originals[0].currency_original);
}
export function consolidateMoney(records, targetCurrency, state) {
  validateState(state);
  currency(targetCurrency);
  if (targetCurrency === 'USD') rateValue(state.rates.VES_USD_BCV);
  return Object.freeze({
    amount: amount(records.reduce((total, record) => total + convertMoney(record, targetCurrency, state).amount, 0)),
    currency: targetCurrency
  });
}
