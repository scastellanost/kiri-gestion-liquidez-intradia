import { validateState } from './money.js';

const KEY = 'kiri.liq-codex-001.state';
const emptyBCV = () => ({ value: null, source: null, timestamp: null });
function snapshot(state) {
  validateState(state);
  const copy = structuredClone(state);
  for (const rate of Object.values(copy.rates)) Object.freeze(rate);
  Object.freeze(copy.rates);
  return Object.freeze(copy);
}
export function createState({ managedDate, status = null, rates = { VES_USD_BCV: emptyBCV() } }) {
  return snapshot({ managedDate, status, rates, displayCurrency: 'VES' });
}
export function setDisplayCurrency(state, displayCurrency) {
  return snapshot({ ...state, displayCurrency });
}
export function setBCV(state, managedDate, rate) {
  if (managedDate !== state.managedDate) throw new Error('RATE_DATE_MISMATCH');
  return snapshot({ ...state, rates: { ...state.rates, VES_USD_BCV: rate } });
}
// A new day is created explicitly; no rates are copied from the previous day.
// Reloading an existing day uses loadState instead.
export function saveState(storage, state) {
  validateState(state);
  storage.setItem(KEY, JSON.stringify(state));
}
export function loadState(storage) {
  const raw = storage.getItem(KEY);
  return raw === null ? null : snapshot(JSON.parse(raw));
}
