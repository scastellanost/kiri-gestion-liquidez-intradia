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
