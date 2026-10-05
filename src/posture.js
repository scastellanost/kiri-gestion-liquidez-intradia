import { createMoney, consolidateMoney, convertMoney } from './money.js';
import { setDisplayCurrency } from './state.js';
import { getAffectationPending } from './position.js';
import { buildNeedQueue } from './needs.js';

export class PostureError extends Error {
  constructor(code) { super(code); this.name = 'PostureError'; this.code = code; }
}
const requireValue = (ok, code) => { if (!ok) throw new PostureError(code); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function validateConfig(state, row) {
  requireValue(state.catalogue.empresas.includes(row.empresa), 'INVALID_COMPANY');
  requireValue(Array.isArray(row.orden_bancos), 'INVALID_BANK_ORDER');
  requireValue(new Set(row.orden_bancos).size === row.orden_bancos.length, 'DUPLICATE_POSTURE_BANK');
  const accountsByBank = row.orden_cuentas_por_banco;
  requireValue(accountsByBank && typeof accountsByBank === 'object' && !Array.isArray(accountsByBank), 'INVALID_ACCOUNT_ORDER');
  for (const bank of [...row.orden_bancos, ...Object.keys(accountsByBank)]) requireValue(state.catalogue.bancos.includes(bank), 'INVALID_BANK');
  const used = new Set();
  for (const [bank, accounts] of Object.entries(accountsByBank)) {
    requireValue(Array.isArray(accounts), 'INVALID_ACCOUNT_ORDER');
    for (const id of accounts) {
      requireValue(!used.has(id), 'DUPLICATE_POSTURE_ACCOUNT'); used.add(id);
      const account = state.catalogue.cuentas.find(a => a.cuenta === id);
      requireValue(account, 'INVALID_ACCOUNT');
      requireValue(account.empresa === row.empresa && account.banco === bank, 'ACCOUNT_OWNER_MISMATCH');
    }
  }
  return { empresa: row.empresa, orden_bancos: row.orden_bancos, orden_cuentas_por_banco: accountsByBank };
}
function updateConfig(state, row, request_id, operation) {
  requireValue(text(request_id), 'INVALID_IDEMPOTENCY_KEY');
  const payload = JSON.stringify(canonical({ kind: operation, rows: [row] }));
  const receipt = state.receipts.find(r => r.scope === 'request_id' && r.id === request_id);
  if (receipt) { requireValue(receipt.payload === payload, 'IDEMPOTENCY_CONFLICT'); return state; }
  requireValue(state.catalogue.empresas.includes(row.empresa), 'INVALID_COMPANY');
  requireValue(text(row.origen), 'INVALID_ORIGIN');
  requireValue(row.usuario === undefined || text(row.usuario), 'INVALID_USER');
  const time = row.fecha_hora_evento;
  requireValue(typeof time === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(time)
    && Number.isFinite(Date.parse(time)), 'INVALID_TIMESTAMP');
  requireValue(new Date(`${time.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === time.slice(0, 10), 'INVALID_TIMESTAMP');
  const config = operation === 'SET_POSTURE_CONFIG' ? validateConfig(state, row) : null;
  const next = structuredClone(state); next.postureConfigs ??= [];
  const index = next.postureConfigs.findIndex(c => c.empresa === row.empresa);
  const before = index < 0 ? null : structuredClone(next.postureConfigs[index]);
  if (index >= 0) next.postureConfigs.splice(index, 1);
  if (config) next.postureConfigs.push(structuredClone(config));
  next.events.push({ kind: 'POSTURE', operacion: operation, empresa: row.empresa,
    antes: before, despues: structuredClone(config), origen: row.origen,
    ...(row.usuario === undefined ? {} : { usuario: row.usuario }), fecha_hora_evento: time, request_id });
  next.receipts.push({ scope: 'request_id', id: request_id, payload });
  return freeze(next);
}
export const setPostureConfig = (state, row, request_id) => updateConfig(state, row, request_id, 'SET_POSTURE_CONFIG');
export const clearPostureConfig = (state, row, request_id) => updateConfig(state, row, request_id, 'CLEAR_POSTURE_CONFIG');

const errorInfo = (error, context = {}) => ({ code: error.code ?? 'INVALID_INPUT', ...context });
const orderedAccounts = (config, bank) => Object.hasOwn(config.orden_cuentas_por_banco, bank) ? config.orden_cuentas_por_banco[bank] : [];
function accountViews(state, empresa, monetaryState) {
  return state.catalogue.cuentas.filter(a => a.empresa === empresa).sort((a, b) => compare(a.cuenta, b.cuenta)).map(account => {
    const base = { empresa, banco: account.banco, cuenta: account.cuenta, moneda: 'VES', monto_asignado_postura: 0 };
    try {
      const balance = consolidateMoney(state.balances.filter(b => b.cuenta === account.cuenta && b.empresa === empresa), 'VES', monetaryState).amount;
      const usable = !account.moneda_ambigua && !account.no_utilizable;
      return { ...base, saldo_vigente: balance, capacidad_restante_postura: Math.max(0, balance),
        elegible: usable && balance > 0, motivo_no_elegible: !usable ? 'CATALOGUE_ACCOUNT_NOT_USABLE' : balance <= 0 ? 'NON_POSITIVE_BALANCE' : null,
        publicable: true, errors: [] };
    } catch (error) {
      return { ...base, saldo_vigente: null, capacidad_restante_postura: null, elegible: false,
        motivo_no_elegible: error.code ?? 'INVALID_INPUT', publicable: false, errors: [errorInfo(error, { cuenta: account.cuenta })] };
    }
  });
}

export function buildPosture(state, empresa, monetaryState) {
  const queue = buildNeedQueue(state, empresa, monetaryState);
  const monetary = setDisplayCurrency(monetaryState, 'VES');
  const config = (state.postureConfigs ?? []).find(c => c.empresa === empresa)
    ?? { empresa, orden_bancos: [], orden_cuentas_por_banco: {} };
  validateConfig(state, config);
  const accounts = accountViews(state, empresa, monetary);
  const byAccount = new Map(accounts.map(a => [a.cuenta, a]));
  const order = [...queue.necesidades_activas, ...queue.necesidades_sin_clasificar];
  const results = [];
  for (const need of order) {
    const a = state.affectations.find(record => record.affectation_id === need.affectation_id);
    if (!a || a.empresa !== empresa || getAffectationPending(a) <= 0) continue;
    const banks = a.banco_asignado === null ? config.orden_bancos : [a.banco_asignado];
    const steps = []; const assignments = [];
    const base = { affectation_id: a.affectation_id, empresa, naturaleza: a.naturaleza_afectacion,
      banco_asignado: a.banco_asignado, moneda: 'VES', need_id: need.need_id ?? null,
      clasificacion: need.need_id ? 'CLASSIFIED_NEED' : 'UNCLASSIFIED_NEED',
      criterio_orden: need.criterio_orden ?? null, ruta_bancos: [...banks] };
    let pending;
    try { pending = convertMoney(createMoney(getAffectationPending(a), a.currency_original), 'VES', monetary).amount; }
    catch (error) {
      results.push({ ...base, monto_pendiente: null, asignaciones: [], monto_localizado: 0,
        monto_no_localizado: null, estado_localizacion: 'NO_LOCALIZADA', publicable: false,
        errors: [errorInfo(error, { affectation_id: a.affectation_id })], recorrido: [] }); continue;
    }
    // Validate the full configured route before consuming even its first account.
    const routeErrors = banks.flatMap(bank => orderedAccounts(config, bank).flatMap(id => {
      const catalog = state.catalogue.cuentas.find(c => c.cuenta === id);
      if (catalog.moneda_ambigua || catalog.no_utilizable) return [];
      return byAccount.get(id).errors;
    }));
    if (routeErrors.length) {
      results.push({ ...base, monto_pendiente: pending, asignaciones: [], monto_localizado: 0,
        monto_no_localizado: pending, estado_localizacion: 'NO_LOCALIZADA', publicable: false,
        errors: structuredClone(routeErrors), recorrido: [{ resultado: 'ROUTE_NOT_PUBLISHABLE' }] }); continue;
    }
    let remaining = pending;
    for (const bank of banks) {
      if (remaining === 0) break;
      const ids = orderedAccounts(config, bank);
      if (!ids.length) steps.push({ banco: bank, resultado: 'NO_CONFIGURED_ACCOUNT_ORDER' });
      for (const id of ids) {
        if (remaining === 0) break;
        const account = byAccount.get(id);
        const available = account.capacidad_restante_postura;
        if (!account.elegible || available <= 0) {
          steps.push({ banco: bank, cuenta: id, resultado: account.motivo_no_elegible ?? 'CAPACITY_EXHAUSTED' }); continue;
        }
        const assigned = Math.min(remaining, available);
        account.monto_asignado_postura += assigned;
        account.capacidad_restante_postura -= assigned;
        remaining -= assigned;
        assignments.push({ banco: bank, cuenta: id, monto_asignado: assigned, moneda: 'VES' });
        steps.push({ banco: bank, cuenta: id, capacidad_antes: available, monto_asignado: assigned,
          capacidad_despues: account.capacidad_restante_postura, pendiente_despues: remaining, resultado: 'ASSIGNED' });
      }
    }
    if (!banks.length) steps.push({ resultado: 'NO_CONFIGURED_BANK_ORDER' });
    results.push({ ...base, monto_pendiente: pending, asignaciones: assignments, monto_localizado: pending - remaining,
      monto_no_localizado: remaining, estado_localizacion: remaining === 0 ? 'LOCALIZADA_TOTAL' : assignments.length ? 'LOCALIZADA_PARCIAL' : 'NO_LOCALIZADA',
      publicable: true, errors: [], recorrido: steps });
  }
  const bankIds = [...new Set([...accounts.map(a => a.banco), ...config.orden_bancos,
    ...results.filter(a => a.banco_asignado !== null).map(a => a.banco_asignado)])].sort(compare);
  const bankViews = bankIds.map(bank => {
    const bankAccounts = accounts.filter(a => a.banco === bank);
    const explicit = results.filter(a => a.banco_asignado === bank);
    const errors = [...bankAccounts.flatMap(a => a.errors), ...explicit.flatMap(a => a.errors)];
    const sum = key => consolidateMoney(bankAccounts.map(a => createMoney(a[key], 'VES')), 'VES', monetary).amount;
    const localized = results.filter(a => a.asignaciones.some(item => item.banco === bank));
    return { empresa, banco: bank, moneda: 'VES', publicable: errors.length === 0, errors,
      saldo_bancario: bankAccounts.every(a => a.publicable) ? sum('saldo_vigente') : null,
      monto_asignado_postura: sum('monto_asignado_postura'),
      capacidad_restante_postura: bankAccounts.every(a => a.publicable) ? sum('capacidad_restante_postura') : null,
      afectaciones_localizadas: localized.map(a => a.affectation_id),
      residual_no_localizado_en_banco: explicit.every(a => a.monto_no_localizado !== null)
        ? consolidateMoney(explicit.map(a => createMoney(a.monto_no_localizado, 'VES')), 'VES', monetary).amount : null };
  });
  const errors = [...queue.errors, ...results.flatMap(a => a.errors)];
  return freeze({ empresa, moneda: 'VES', publicable: queue.publicable && results.every(a => a.publicable), errors,
    saldo_disponible_gestion: queue.saldo_disponible_gestion, deficit: queue.deficit,
    criterios_orden: [...queue.criterios_orden, 'UNCLASSIFIED_NEED_AFTER_CLASSIFIED'],
    afectaciones: results, cuentas: accounts, bancos: bankViews });
}
