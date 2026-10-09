import { createMoney, consolidateMoney, convertMoney, addDecimal, subtractDecimal, compareDecimal } from './money.js';
import { setDisplayCurrency } from './state.js';

export class PositionError extends Error {
  constructor(code, detail = code) { super(detail); this.name = 'PositionError'; this.code = code; }
}
const fail = (code, detail) => { throw new PositionError(code, detail); };
const requireValue = (condition, code) => { if (!condition) fail(code); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);
function timestamp(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)), 'INVALID_TIMESTAMP');
  const date = value.slice(0, 10);
  requireValue(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date, 'INVALID_TIMESTAMP');
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const fingerprint = value => JSON.stringify(canonical(value));
function money(row) {
  const amount = row.amount_original === undefined ? row.monto_original : row.amount_original;
  const currency = row.currency_original === undefined ? row.moneda_original : row.currency_original;
  if (row.monto_original !== undefined && row.amount_original !== undefined) requireValue(row.monto_original === row.amount_original, 'CONFLICTING_ORIGINALS');
  if (row.moneda_original !== undefined && row.currency_original !== undefined) requireValue(row.moneda_original === row.currency_original, 'CONFLICTING_ORIGINALS');
  return createMoney(amount, currency);
}
function trace(row, identity) {
  requireValue(text(row.origen), 'INVALID_ORIGIN');
  timestamp(row.fecha_hora_evento);
  if (row.usuario !== undefined) requireValue(text(row.usuario), 'INVALID_USER');
  return { origen: row.origen, fecha_hora_evento: row.fecha_hora_evento,
    ...(row.usuario === undefined ? {} : { usuario: row.usuario }), ...identity };
}
function entity(state, empresa, banco) {
  requireValue(state.catalogue.empresas.includes(empresa), 'INVALID_COMPANY');
  if (banco !== undefined && banco !== null && banco !== '') requireValue(state.catalogue.bancos.includes(banco), 'INVALID_BANK');
}
export function createPositionState({ empresas, bancos, cuentas }) {
  for (const list of [empresas, bancos]) {
    requireValue(Array.isArray(list) && list.every(text) && new Set(list).size === list.length, 'INVALID_CATALOGUE');
  }
  requireValue(Array.isArray(cuentas), 'INVALID_CATALOGUE');
  const ids = new Set();
  for (const account of cuentas) {
    requireValue(text(account.cuenta) && !ids.has(account.cuenta), 'INVALID_ACCOUNT'); ids.add(account.cuenta);
    requireValue(empresas.includes(account.empresa) && bancos.includes(account.banco), 'INVALID_ACCOUNT_OWNER');
    requireValue(Array.isArray(account.monedas) && account.monedas.length > 0 && new Set(account.monedas).size === account.monedas.length, 'INVALID_ACCOUNT_CURRENCIES');
    account.monedas.forEach(code => createMoney(0, code));
  }
  return freeze(structuredClone({ catalogue: { empresas, bancos, cuentas }, balances: [], affectations: [], receipts: [], events: [] }));
}
function balance(state, row, identity) {
  entity(state, row.empresa, row.banco);
  requireValue(text(row.banco) && state.catalogue.bancos.includes(row.banco), 'INVALID_BANK');
  const account = state.catalogue.cuentas.find(a => a.cuenta === row.cuenta);
  requireValue(account, 'INVALID_ACCOUNT');
  requireValue(account.empresa === row.empresa && account.banco === row.banco, 'ACCOUNT_OWNER_MISMATCH');
  const original = money(row);
  requireValue(account.monedas.includes(original.currency_original), 'ACCOUNT_CURRENCY_MISMATCH');
  timestamp(row.fecha_hora_saldo);
  return { empresa: row.empresa, banco: row.banco, cuenta: row.cuenta, ...original,
    fecha_hora_saldo: row.fecha_hora_saldo, ...trace(row, identity) };
}
const stockKey = row => fingerprint([row.empresa, row.banco, row.cuenta, row.currency_original]);
function applyBalances(state, rows, identity) {
  const seen = new Map();
  for (const row of rows) {
    const next = balance(state, row, identity); const key = stockKey(next);
    if (seen.has(key)) {
      requireValue(fingerprint(seen.get(key)) === fingerprint(next), 'CONFLICTING_BATCH_DUPLICATE');
      continue;
    }
    seen.set(key, next);
    const index = state.balances.findIndex(b => stockKey(b) === key);
    if (index >= 0) {
      const old = state.balances[index];
      if (Date.parse(next.fecha_hora_saldo) < Date.parse(old.fecha_hora_saldo)) {
        state.events.push({ kind: 'SALDO', ...next, treatment: 'HISTORICAL_ONLY' });
        continue;
      }
      if (Date.parse(next.fecha_hora_saldo) === Date.parse(old.fecha_hora_saldo)) requireValue(next.amount_original === old.amount_original, 'CONFLICTING_STOCK_TIMESTAMP');
      state.balances[index] = next;
    } else state.balances.push(next);
    state.events.push({ kind: 'SALDO', ...next });
  }
}
function applyAffectations(state, rows, identity) {
  const seen = new Set();
  for (const row of rows) {
    requireValue(text(row.affectation_id), 'INVALID_AFFECTATION_ID');
    requireValue(row.observacion === undefined || typeof row.observacion === 'string', 'INVALID_OBSERVATION');
    requireValue(!seen.has(row.affectation_id), 'CONFLICTING_BATCH_DUPLICATE'); seen.add(row.affectation_id);
    requireValue(['ALTA', 'AJUSTE', 'ANULACION', 'RECLASIFICACION'].includes(row.operacion), 'UNSUPPORTED_OPERATION');
    const provenance = trace(row, identity);
    const index = state.affectations.findIndex(a => a.affectation_id === row.affectation_id);
    let next;
    const previous = index < 0 ? null : structuredClone(state.affectations[index]);
    if (row.operacion === 'ALTA') {
      requireValue(index < 0, 'AFFECTATION_ALREADY_EXISTS');
      entity(state, row.empresa, row.banco_asignado);
      requireValue(text(row.tipo_partida), 'INVALID_ITEM_TYPE');
      requireValue(['COMPROMISO', 'RESERVA'].includes(row.naturaleza_afectacion), 'INVALID_AFFECTATION_NATURE');
      const original = money(row);
      requireValue(original.amount_original > 0, 'INVALID_INITIAL_AMOUNT');
      requireValue(row.estado === undefined || row.estado === 'ACTIVA', 'INVALID_AFFECTATION_STATUS');
      next = { affectation_id: row.affectation_id, empresa: row.empresa, tipo_partida: row.tipo_partida,
        naturaleza_afectacion: row.naturaleza_afectacion, ...original,
        monto_vigente: row.monto_vigente === undefined ? original.amount_original : row.monto_vigente,
        monto_reflejado_confirmado: row.monto_reflejado_confirmado === undefined ? 0 : row.monto_reflejado_confirmado,
        estado: 'ACTIVA', banco_asignado: row.banco_asignado || null };
    } else {
      requireValue(index >= 0, 'UNKNOWN_AFFECTATION_REFERENCE');
      const old = state.affectations[index];
      requireValue(old.estado === 'ACTIVA', 'AFFECTATION_NOT_ACTIVE');
      for (const key of ['empresa', 'tipo_partida', 'naturaleza_afectacion', 'amount_original', 'currency_original', 'banco_asignado']) {
        if (row[key] !== undefined) requireValue(row[key] === old[key], 'IMMUTABLE_AFFECTATION_FIELD');
      }
      if (row.monto_original !== undefined) requireValue(row.monto_original === old.amount_original, 'IMMUTABLE_AFFECTATION_FIELD');
      if (row.moneda_original !== undefined) requireValue(row.moneda_original === old.currency_original, 'IMMUTABLE_AFFECTATION_FIELD');
      const reclassifying = row.operacion === 'RECLASIFICACION';
      const linkedNeeds = (state.needs ?? []).filter(n => n.affectation_id === old.affectation_id);
      if (Date.parse(row.fecha_hora_evento) < Date.parse(old.fecha_hora_evento)
        || (reclassifying && linkedNeeds.some(n => Date.parse(row.fecha_hora_evento) < Date.parse(n.fecha_hora_evento)))) {
        fail(reclassifying ? 'RETROACTIVE_NEED_EVENT' : 'RETROACTIVE_AFFECTATION_EVENT');
      }
      next = { ...old };
      if (reclassifying) {
        requireValue(text(row.motivo_reclasificacion), 'RECLASSIFICATION_REASON_REQUIRED');
        requireValue(['COMPROMISO', 'RESERVA'].includes(row.naturaleza_destino)
          && row.naturaleza_destino !== old.naturaleza_afectacion, 'INVALID_RECLASSIFICATION_TARGET');
        for (const key of ['monto_vigente', 'monto_reflejado_confirmado']) {
          if (row[key] !== undefined) requireValue(row[key] === old[key], 'IMMUTABLE_RECLASSIFICATION_AMOUNT');
        }
        if (old.naturaleza_afectacion === 'COMPROMISO' && old.monto_reflejado_confirmado > 0) fail('RECLASSIFICATION_AFTER_CONFIRMED_EXECUTION_NOT_ALLOWED');
        next.naturaleza_afectacion = row.naturaleza_destino;
        next.monto_reflejado_confirmado = 0;
        next.motivo_reclasificacion = row.motivo_reclasificacion;
      } else if (row.operacion === 'AJUSTE') {
        requireValue(row.monto_vigente !== undefined || row.monto_reflejado_confirmado !== undefined, 'EMPTY_ADJUSTMENT');
        if (row.monto_vigente !== undefined) next.monto_vigente = row.monto_vigente;
        if (row.monto_reflejado_confirmado !== undefined) {
          if (row.monto_reflejado_confirmado < old.monto_reflejado_confirmado) fail('CONFIRMED_AMOUNT_REVERSAL_NOT_ALLOWED');
          next.monto_reflejado_confirmado = row.monto_reflejado_confirmado;
        }
      } else {
        const pending = old.naturaleza_afectacion === 'COMPROMISO' ? subtractDecimal(old.monto_vigente, old.monto_reflejado_confirmado) : old.monto_vigente;
        requireValue(finite(row.monto_anulado) && row.monto_anulado > 0 && compareDecimal(row.monto_anulado, pending) <= 0, 'EXCESSIVE_OR_INVALID_CANCELLATION');
        next.monto_vigente = subtractDecimal(next.monto_vigente, row.monto_anulado);
        const remaining = next.naturaleza_afectacion === 'COMPROMISO'
          ? subtractDecimal(next.monto_vigente, next.monto_reflejado_confirmado) : next.monto_vigente;
        next.estado = remaining > 0 ? 'ACTIVA' : 'ANULADA';
      }
      if (row.estado !== undefined) requireValue(row.estado === next.estado, 'INVALID_AFFECTATION_STATUS');
    }
    requireValue(finite(next.monto_vigente) && next.monto_vigente >= 0, 'INVALID_CURRENT_AMOUNT');
    requireValue(finite(next.monto_reflejado_confirmado) && next.monto_reflejado_confirmado >= 0
      && compareDecimal(next.monto_reflejado_confirmado, next.monto_vigente) <= 0, 'INVALID_CONFIRMED_AMOUNT');
    next = { ...next, operacion: row.operacion, ...provenance,
      ...(row.observacion === undefined ? {} : { observacion: row.observacion }) };
    if (index < 0) state.affectations.push(next); else state.affectations[index] = next;
    state.events.push({ kind: 'AFECTACION', input: structuredClone(row), result: structuredClone(next), ...provenance });
    // Cancellation resolves the linked decision record atomically with its
    // economic record, so valid terminal snapshots remain persistable.
    if (next.estado === 'ANULADA' || getAffectationPending(next) === 0) {
      for (const need of (state.needs ?? []).filter(n => n.affectation_id === next.affectation_id && n.estado === 'ACTIVA'
        && (next.estado === 'ANULADA' || !n.requiere_seguimiento_adicional))) {
        const before = structuredClone(need);
        Object.assign(need, { monto_vigente: next.monto_vigente, estado: 'CERRADA' });
        state.events.push({ kind: 'NEED', operacion: 'CLOSE_NEED_IF_RESOLVED',
          need_id: need.need_id, affectation_id: next.affectation_id,
          anteriores: before, posteriores: structuredClone(need), ...provenance });
      }
    }
    if (row.operacion === 'RECLASIFICACION') {
      const linked = (state.needs ?? []).filter(n => n.affectation_id === next.affectation_id && n.estado === 'ACTIVA');
      const before = structuredClone(linked);
      for (const need of linked) Object.assign(need, {
        naturaleza: next.naturaleza_afectacion, monto_vigente: next.monto_vigente,
        motivo_reclasificacion: row.motivo_reclasificacion, ...provenance
      });
      state.events.push({ kind: 'NEED', operacion: 'RECLASIFICACION', need_id: linked[0]?.need_id ?? null,
        affectation_id: next.affectation_id, anteriores: { affectation: previous, needs: before },
        posteriores: { affectation: structuredClone(next), needs: structuredClone(linked) },
        motivo: row.motivo_reclasificacion, ...provenance });
    }
  }
}
function prepare(state, rows, identity, kind) {
  requireValue(Array.isArray(rows) && rows.length > 0, 'INVALID_BATCH');
  requireValue(identity && ((text(identity.batch_id) && identity.request_id === undefined)
    || (text(identity.request_id) && identity.batch_id === undefined)), 'INVALID_IDEMPOTENCY_KEY');
  if (identity.request_id !== undefined) requireValue(rows.length === 1, 'INVALID_MANUAL_REQUEST');
  const id = identity.batch_id ?? identity.request_id;
  const scope = identity.batch_id === undefined ? 'request_id' : 'batch_id';
  const payload = fingerprint({ kind, rows });
  const receipt = state.receipts.find(r => r.scope === scope && r.id === id);
  if (receipt) { requireValue(receipt.payload === payload, 'IDEMPOTENCY_CONFLICT'); return state; }
  const next = structuredClone(state);
  const provenance = { [scope]: id };
  (kind === 'SALDOS' ? applyBalances : applyAffectations)(next, rows, provenance);
  next.receipts.push({ scope, id, payload });
  return freeze(next);
}
function preview(state, rows, identity, kind) {
  try { const next = prepare(state, rows, identity, kind); return { status: 'VALID', errors: [], idempotent: next === state }; }
  catch (error) { return { status: 'ERROR', errors: [{ code: error.code ?? 'INVALID_INPUT', detail: error.message }] }; }
}
export const previewBalances = (state, rows, identity) => preview(state, rows, identity, 'SALDOS');
export const previewAffectations = (state, rows, identity) => preview(state, rows, identity, 'AFECTACIONES');
export const applyBalanceBatch = (state, rows, batch_id) => prepare(state, rows, { batch_id }, 'SALDOS');
export const registerBalance = (state, row, request_id) => prepare(state, [row], { request_id }, 'SALDOS');
export const applyAffectationBatch = (state, rows, batch_id) => prepare(state, rows, { batch_id }, 'AFECTACIONES');
export const registerAffectation = (state, row, request_id) => prepare(state, [row], { request_id }, 'AFECTACIONES');

// Shared economic amount for position and the decision layer; originals are untouched.
export function getAffectationPending(affectation) {
  if (affectation.estado !== 'ACTIVA') return 0;
  return affectation.naturaleza_afectacion === 'COMPROMISO'
    ? subtractDecimal(affectation.monto_vigente, affectation.monto_reflejado_confirmado) : affectation.monto_vigente;
}

const companyFields = ['saldo_bancario', 'compromisos_por_ejecutar', 'reservas_bloqueadas', 'saldo_disponible_gestion', 'deficit'];
const bankFields = ['saldo_bancario', 'compromisos_por_ejecutar', 'reservas_bloqueadas', 'disponibilidad_localizada_preliminar'];
// Exact destination-currency arithmetic is safe only for original VES
// components; converted components retain the existing FX numeric path.
export function hasNativePositionComponents(state, empresa, banco) {
  return state.balances.filter(b => b.empresa === empresa && (banco === undefined || b.banco === banco))
    .concat(state.affectations.filter(a => a.empresa === empresa && a.estado === 'ACTIVA'
      && (banco === undefined || a.banco_asignado === banco)))
    .every(record => record.currency_original === 'VES');
}
// Only economic components within the requested scope determine whether
// an exact calculation in their ORIGINAL currency can be made.
function singleOriginalCurrency(state, empresa, banco) {
  const rows = state.balances.filter(b => b.empresa === empresa && (banco === undefined || b.banco === banco))
    .concat(state.affectations.filter(a => a.empresa === empresa && a.estado === 'ACTIVA'
      && (banco === undefined || a.banco_asignado === banco)));
  const currencies = new Set(rows.map(row => row.currency_original));
  return currencies.size === 1 ? [...currencies][0] : null;
}
function nativePositionAvailable(state, empresa, banco, currency) {
  const selected = state.balances.filter(b => b.empresa === empresa && (banco === undefined || b.banco === banco));
  const active = state.affectations.filter(a => a.empresa === empresa && a.estado === 'ACTIVA'
    && (banco === undefined || a.banco_asignado === banco));
  const sum = items => items.reduce((acc, amount) => addDecimal(acc, amount), 0);
  const balance = sum(selected.map(row => row.amount_original));
  const commitments = sum(active.filter(a => a.naturaleza_afectacion === 'COMPROMISO').map(getAffectationPending));
  const reserves = sum(active.filter(a => a.naturaleza_afectacion === 'RESERVA').map(getAffectationPending));
  return subtractDecimal(subtractDecimal(balance, commitments), reserves);
}
function calculate(state, empresa, banco, monetaryState) {
  entity(state, empresa, banco);
  const fields = banco === undefined ? companyFields : bankFields;
  const base = { empresa, ...(banco === undefined ? {} : { banco }), currency: 'VES' };
  const active = state.affectations.filter(a => a.empresa === empresa && a.estado === 'ACTIVA');
  const localizations = active.map(a => ({ affectation_id: a.affectation_id, banco_asignado: a.banco_asignado,
    localizacion: a.banco_asignado === null ? 'NO LOCALIZADO' : 'LOCALIZADO' }));
  try {
    const canonicalState = setDisplayCurrency(monetaryState, 'VES');
    const sum = rows => consolidateMoney(rows, 'VES', canonicalState).amount;
    const assigned = active.filter(a => banco === undefined || a.banco_asignado === banco);
    const saldo_bancario = sum(state.balances.filter(b => b.empresa === empresa && (banco === undefined || b.banco === banco)));
    const compromisos_por_ejecutar = sum(assigned.filter(a => a.naturaleza_afectacion === 'COMPROMISO')
      .map(a => createMoney(getAffectationPending(a), a.currency_original)));
    const reservas_bloqueadas = sum(assigned.filter(a => a.naturaleza_afectacion === 'RESERVA')
      .map(a => createMoney(getAffectationPending(a), a.currency_original)));
    const native = hasNativePositionComponents(state, empresa, banco);
    const singleCurrency = singleOriginalCurrency(state, empresa, banco);
    const nativeAvailable = singleCurrency
      ? nativePositionAvailable(state, empresa, banco, singleCurrency) : null;
    const available = singleCurrency
      ? (singleCurrency === 'VES' ? nativeAvailable
        : convertMoney(createMoney(nativeAvailable, singleCurrency), 'VES', canonicalState).amount)
      : saldo_bancario - compromisos_por_ejecutar - reservas_bloqueadas;
    createMoney(available, 'VES'); // Reject numeric overflow, without changing monetary policy.
    const deficit = singleCurrency
      ? (nativeAvailable < 0
        ? (singleCurrency === 'VES' ? subtractDecimal(0, nativeAvailable)
          : convertMoney(createMoney(subtractDecimal(0, nativeAvailable), singleCurrency), 'VES', canonicalState).amount)
        : 0)
      : Math.max(0, -available);
    return freeze({ ...base, publicable: true, errors: [], saldo_bancario, compromisos_por_ejecutar, reservas_bloqueadas,
      ...(banco === undefined ? { saldo_disponible_gestion: available, deficit, localizaciones: localizations }
        : { disponibilidad_localizada_preliminar: available }) });
  } catch (error) {
    return freeze({ ...base, publicable: false, ...Object.fromEntries(fields.map(key => [key, null])),
      errors: [{ code: error.code ?? 'INVALID_INPUT', detail: error.message }] });
  }
}
export const calculateCompanyPosition = (state, empresa, monetaryState) => calculate(state, empresa, undefined, monetaryState);
export function calculateBankPosition(state, empresa, banco, monetaryState) {
  requireValue(state.catalogue.bancos.includes(banco), 'INVALID_BANK');
  return calculate(state, empresa, banco, monetaryState);
}
export function displayPosition(position, monetaryState) {
  if (!position.publicable) return position;
  const fields = position.banco === undefined ? companyFields : bankFields;
  try {
    const values = Object.fromEntries(fields.map(key => [key, convertMoney(createMoney(position[key], position.currency), monetaryState.displayCurrency, monetaryState).amount]));
    return freeze({ ...position, ...values, currency: monetaryState.displayCurrency });
  } catch (error) {
    return freeze({ ...position, currency: monetaryState.displayCurrency, publicable: false,
      ...Object.fromEntries(fields.map(key => [key, null])), errors: [{ code: error.code ?? 'INVALID_INPUT', detail: error.message }] });
  }
}
