import { createMoney, compareDecimal } from './money.js';
import { calculateCompanyPosition, getAffectationPending, registerAffectation } from './position.js';

export class NeedError extends Error {
  constructor(code, detail = code) { super(detail); this.name = 'NeedError'; this.code = code; }
}
const requireValue = (ok, code, detail) => { if (!ok) throw new NeedError(code, detail); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const priorities = ['P1_CRITICA', 'P2_ALTA', 'P3_NORMAL', 'P4_DISCRECIONAL'];
const rigidities = ['R1_HORA_RIGIDA', 'R2_VENTANA_DIA', 'R3_FECHA_RIGIDA', 'R4_FLEXIBLE'];
const criteria = ['rigidez_temporal', 'fecha_hora_objetivo', 'prioridad_economica', 'fecha_hora_evento', 'need_id'];
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function timestamp(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)), 'INVALID_TIMESTAMP');
  const day = value.slice(0, 10);
  requireValue(new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day, 'INVALID_TIMESTAMP');
}
function trace(row, request_id) {
  requireValue(text(row.origen), 'INVALID_ORIGIN'); timestamp(row.fecha_hora_evento);
  requireValue(row.usuario === undefined || text(row.usuario), 'INVALID_USER');
  return { origen: row.origen, fecha_hora_evento: row.fecha_hora_evento,
    ...(row.usuario === undefined ? {} : { usuario: row.usuario }), request_id };
}
function classification(need) {
  requireValue(priorities.includes(need.prioridad_economica), 'INVALID_ECONOMIC_PRIORITY');
  requireValue(rigidities.includes(need.rigidez_temporal), 'INVALID_TEMPORAL_RIGIDITY');
  const target = need.fecha_hora_objetivo;
  if (['R1_HORA_RIGIDA', 'R3_FECHA_RIGIDA'].includes(need.rigidez_temporal)) requireValue(target !== null && target !== undefined, 'TARGET_DATETIME_REQUIRED');
  if (target !== null && target !== undefined) timestamp(target);
}
function affectation(state, id) {
  const record = state.affectations.find(a => a.affectation_id === id);
  requireValue(record, 'UNKNOWN_AFFECTATION_REFERENCE'); return record;
}
function governedTime(row, need, linked) {
  for (const record of [need, linked].filter(Boolean)) requireValue(Date.parse(row.fecha_hora_evento) >= Date.parse(record.fecha_hora_evento), 'RETROACTIVE_NEED_EVENT');
}
function economicFields(a) {
  return { affectation_id: a.affectation_id, empresa: a.empresa, tipo_partida: a.tipo_partida,
    naturaleza: a.naturaleza_afectacion, amount_original: a.amount_original,
    currency_original: a.currency_original, monto_vigente: a.monto_vigente };
}
function immutableInput(row, fields) {
  for (const [key, value] of Object.entries(fields)) if (row[key] !== undefined) requireValue(row[key] === value, 'IMMUTABLE_NEED_FIELD');
}
function uniqueLink(state, id, need_id) {
  requireValue(!(state.needs ?? []).some(n => n.affectation_id === id && n.estado === 'ACTIVA' && n.need_id !== need_id), 'DUPLICATE_ACTIVE_NEED');
}
function operate(state, row, request_id, operation, apply) {
  requireValue(text(request_id), 'INVALID_IDEMPOTENCY_KEY');
  const payload = JSON.stringify(canonical({ kind: operation, rows: [row] }));
  const receipt = state.receipts.find(r => r.scope === 'request_id' && r.id === request_id);
  if (receipt) { requireValue(receipt.payload === payload, 'IDEMPOTENCY_CONFLICT'); return state; }
  const provenance = trace(row, request_id);
  const next = structuredClone(state); next.needs ??= [];
  const old = next.needs.find(n => n.need_id === row.need_id);
  const before = old ? structuredClone(old) : null;
  const result = apply(next, old, provenance);
  next.events.push({ kind: 'NEED', operacion: operation, need_id: result.need_id,
    affectation_id: result.affectation_id ?? null, anteriores: before, posteriores: structuredClone(result),
    motivo: row.motivo_prioridad ?? row.motivo_cierre ?? null, ...provenance });
  next.receipts.push({ scope: 'request_id', id: request_id, payload });
  return freeze(next);
}
export function createNeed(state, row, request_id) {
  return operate(state, row, request_id, 'CREATE_NEED', (next, old, provenance) => {
    requireValue(text(row.need_id) && !old, 'INVALID_OR_DUPLICATE_NEED_ID');
    const linked = row.affectation_id === undefined || row.affectation_id === null ? null : affectation(next, row.affectation_id);
    let fields;
    if (linked) {
      requireValue(linked.estado === 'ACTIVA', 'AFFECTATION_NOT_ACTIVE'); uniqueLink(next, linked.affectation_id, row.need_id);
      governedTime(row, null, linked); fields = economicFields(linked); immutableInput(row, fields);
    } else {
      requireValue(next.catalogue.empresas.includes(row.empresa), 'INVALID_COMPANY');
      requireValue(text(row.tipo_partida), 'INVALID_ITEM_TYPE');
      requireValue(['COMPROMISO', 'RESERVA'].includes(row.naturaleza), 'INVALID_AFFECTATION_NATURE');
      const original = createMoney(row.amount_original, row.currency_original);
      const current = row.monto_vigente === undefined ? original.amount_original : row.monto_vigente;
      requireValue(original.amount_original >= 0 && createMoney(current, original.currency_original).amount_original >= 0, 'INVALID_CURRENT_AMOUNT');
      fields = { affectation_id: null, empresa: row.empresa, tipo_partida: row.tipo_partida,
        naturaleza: row.naturaleza, ...original, monto_vigente: current };
    }
    requireValue(row.requiere_seguimiento_adicional === undefined || typeof row.requiere_seguimiento_adicional === 'boolean', 'INVALID_FOLLOW_UP_FLAG');
    const followUp = row.requiere_seguimiento_adicional ?? false;
    const need = { need_id: row.need_id, ...fields, prioridad_economica: row.prioridad_economica,
      rigidez_temporal: row.rigidez_temporal, fecha_hora_objetivo: row.fecha_hora_objetivo ?? null,
      estado: linked && getAffectationPending(linked) === 0 && !followUp ? 'CERRADA' : 'ACTIVA',
      requiere_seguimiento_adicional: followUp, ...provenance };
    if (row.motivo_prioridad !== undefined) { requireValue(text(row.motivo_prioridad), 'PRIORITY_REASON_REQUIRED'); need.motivo_prioridad = row.motivo_prioridad; }
    classification(need); next.needs.push(need); return need;
  });
}
export function linkNeedToAffectation(state, row, request_id) {
  return operate(state, row, request_id, 'LINK_NEED', (next, need, provenance) => {
    requireValue(need && need.estado === 'ACTIVA', 'NEED_NOT_ACTIVE');
    requireValue(!need.affectation_id || need.affectation_id === row.affectation_id, 'NEED_ALREADY_LINKED');
    const linked = affectation(next, row.affectation_id); requireValue(linked.estado === 'ACTIVA', 'AFFECTATION_NOT_ACTIVE');
    governedTime(row, need, linked); uniqueLink(next, linked.affectation_id, need.need_id);
    const fields = economicFields(linked);
    for (const key of ['empresa', 'tipo_partida', 'naturaleza', 'amount_original', 'currency_original', 'monto_vigente']) requireValue(need[key] === fields[key], 'NEED_AFFECTATION_MISMATCH');
    Object.assign(need, fields, provenance);
    if (getAffectationPending(linked) === 0 && !need.requiere_seguimiento_adicional) need.estado = 'CERRADA';
    return need;
  });
}
export function reprioritizeNeed(state, row, request_id) {
  return operate(state, row, request_id, 'REPRIORITIZE_NEED', (next, need, provenance) => {
    requireValue(need && need.estado === 'ACTIVA', 'NEED_NOT_ACTIVE');
    const linked = need.affectation_id ? affectation(next, need.affectation_id) : null;
    requireValue(!linked || linked.estado === 'ACTIVA', 'NEED_NOT_ACTIVE');
    governedTime(row, need, linked); requireValue(text(row.motivo_prioridad), 'PRIORITY_REASON_REQUIRED');
    immutableInput(row, linked ? economicFields(linked) : economicFields({ ...need, naturaleza_afectacion: need.naturaleza }));
    requireValue(['prioridad_economica', 'rigidez_temporal', 'fecha_hora_objetivo'].some(key => row[key] !== undefined), 'EMPTY_REPRIORITIZATION');
    if (linked) Object.assign(need, economicFields(linked));
    for (const key of ['prioridad_economica', 'rigidez_temporal', 'fecha_hora_objetivo']) if (row[key] !== undefined) need[key] = row[key];
    Object.assign(need, provenance, { motivo_prioridad: row.motivo_prioridad }); classification(need); return need;
  });
}
export function reclassifyAffectation(state, row, request_id) {
  return registerAffectation(state, { ...row, operacion: 'RECLASIFICACION' }, request_id);
}
export function closeNeedIfResolved(state, row, request_id) {
  return operate(state, row, request_id, 'CLOSE_NEED_IF_RESOLVED', (next, need, provenance) => {
    requireValue(need, 'UNKNOWN_NEED');
    const linked = affectation(next, need.affectation_id); governedTime(row, need, linked);
    requireValue(linked.estado === 'ANULADA' || getAffectationPending(linked) === 0, 'NEED_NOT_RESOLVED');
    requireValue(row.requiere_seguimiento_adicional === undefined || typeof row.requiere_seguimiento_adicional === 'boolean', 'INVALID_FOLLOW_UP_FLAG');
    const followUp = row.requiere_seguimiento_adicional ?? need.requiere_seguimiento_adicional;
    Object.assign(need, economicFields(linked), provenance, { requiere_seguimiento_adicional: followUp,
      estado: linked.estado === 'ANULADA' || !followUp ? 'CERRADA' : 'ACTIVA' }); return need;
  });
}
function orderKey(need) {
  return [rigidities.indexOf(need.rigidez_temporal), need.fecha_hora_objetivo ? Date.parse(need.fecha_hora_objetivo) : null,
    priorities.indexOf(need.prioridad_economica), Date.parse(need.fecha_hora_evento), need.need_id];
}
function compare(a, b) {
  const left = orderKey(a); const right = orderKey(b);
  for (let i = 0; i < left.length; i++) {
    const x = left[i] ?? Infinity; const y = right[i] ?? Infinity;
    if (x < y) return -1; if (x > y) return 1;
  }
  return 0;
}
export function buildNeedQueue(state, empresa, monetaryState) {
  const position = calculateCompanyPosition(state, empresa, monetaryState);
  const classified = []; const unclassified = []; const closed = []; const unlinked = []; const followUp = [];
  for (const stored of state.needs ?? []) {
    if (stored.empresa !== empresa) continue;
    const linked = stored.affectation_id ? affectation(state, stored.affectation_id) : null;
    if (stored.estado === 'CERRADA' || linked?.estado === 'ANULADA') {
      closed.push({ ...stored, ...(linked ? economicFields(linked) : {}), estado: 'CERRADA' }); continue;
    }
    if (linked && getAffectationPending(linked) === 0) {
      if (stored.requiere_seguimiento_adicional) followUp.push({ ...stored, ...economicFields(linked) });
      else closed.push({ ...stored, ...economicFields(linked), estado: 'CERRADA' });
      continue;
    }
    if (!linked) { unlinked.push({ ...stored }); continue; }
    const current = { ...stored, ...economicFields(linked), monto_pendiente: getAffectationPending(linked),
      necesidad_temporal_rigida: ['R1_HORA_RIGIDA', 'R3_FECHA_RIGIDA'].includes(stored.rigidez_temporal) };
    current.criterio_orden = Object.fromEntries(criteria.map((key, i) => [key, orderKey(current)[i]]));
    classified.push(current);
  }
  classified.sort(compare);
  for (const a of state.affectations.filter(a => a.empresa === empresa && getAffectationPending(a) > 0)) {
    if (classified.some(n => n.affectation_id === a.affectation_id)) continue;
    unclassified.push({ ...economicFields(a), tipo: 'UNCLASSIFIED_NEED', monto_pendiente: getAffectationPending(a),
      prioridad_economica: null, rigidez_temporal: null });
  }
  unclassified.sort((a, b) => a.affectation_id < b.affectation_id ? -1 : a.affectation_id > b.affectation_id ? 1 : 0);
  return freeze({ empresa, currency: 'VES', publicable: position.publicable, errors: position.errors,
    saldo_disponible_gestion: position.saldo_disponible_gestion, deficit: position.deficit,
    brecha_consolidada: position.deficit, necesidades_activas: classified, necesidades_sin_clasificar: unclassified,
    necesidades_cerradas: closed, necesidades_sin_vinculo: unlinked.sort(compare), necesidades_seguimiento: followUp,
    criterios_orden: criteria.slice(), total_necesidad_vigente: position.publicable
      ? createMoney(position.compromisos_por_ejecutar + position.reservas_bloqueadas, 'VES').amount_original : null });
}

const storageKey = 'kiri.liq-codex-003.state';
function validateStoredState(state) {
  const invalid = () => { throw new NeedError('INVALID_STORED_NEED_STATE'); };
  const validAmount = (value, positive = false) => typeof value === 'number' && Number.isFinite(value) && (positive ? value > 0 : value >= 0);
  const validId = value => typeof value === 'string' && value.trim().length > 0;
  try {
    if (!state || typeof state !== 'object' || !state.catalogue ||
      !['empresas', 'bancos', 'cuentas'].every(key => Array.isArray(state.catalogue[key])) ||
      !['balances', 'affectations', 'receipts', 'events'].every(key => Array.isArray(state[key])) ||
      (state.needs !== undefined && !Array.isArray(state.needs))) invalid();
    const affIds = new Set();
    for (const a of state.affectations) {
      if (!a || !validId(a.affectation_id) || affIds.has(a.affectation_id) ||
        !state.catalogue.empresas.includes(a.empresa) ||
        !['COMPROMISO', 'RESERVA'].includes(a.naturaleza_afectacion) ||
        !['ACTIVA', 'ANULADA'].includes(a.estado) ||
        !validAmount(a.amount_original, true) || !validAmount(a.monto_vigente) ||
        !validAmount(a.monto_reflejado_confirmado) || !validId(a.tipo_partida)) invalid();
      affIds.add(a.affectation_id);
      createMoney(a.amount_original, a.currency_original);
      if (compareDecimal(a.monto_reflejado_confirmado, a.monto_vigente) > 0) invalid();
      const pending = getAffectationPending(a);
      if (a.estado === 'ANULADA' &&
        (a.naturaleza_afectacion === 'COMPROMISO'
          ? compareDecimal(a.monto_vigente, a.monto_reflejado_confirmado) !== 0
          : compareDecimal(a.monto_vigente, 0) !== 0)) invalid();
      if (a.estado === 'ACTIVA' && pending < 0) invalid();
      if (a.fecha_hora_evento !== undefined) timestamp(a.fecha_hora_evento);
    }
    const ids = new Set(), activeLinks = new Set();
    for (const need of state.needs ?? []) {
      if (!need || !validId(need.need_id) || ids.has(need.need_id) ||
        !['ACTIVA', 'CERRADA'].includes(need.estado) ||
        !state.catalogue.empresas.includes(need.empresa) ||
        !validAmount(need.amount_original) || !validAmount(need.monto_vigente) ||
        !['COMPROMISO', 'RESERVA'].includes(need.naturaleza) ||
        !validId(need.tipo_partida) ||
        typeof need.requiere_seguimiento_adicional !== 'boolean') invalid();
      ids.add(need.need_id);
      createMoney(need.amount_original, need.currency_original);
      classification(need); timestamp(need.fecha_hora_evento);
      if (need.affectation_id !== null && need.affectation_id !== undefined) {
        if (!validId(need.affectation_id)) invalid();
        const a = state.affectations.find(row => row.affectation_id === need.affectation_id);
        if (!a) invalid();
        if (need.estado === 'ACTIVA') {
          if (activeLinks.has(a.affectation_id) || a.estado !== 'ACTIVA') invalid();
          activeLinks.add(a.affectation_id);
          if (need.empresa !== a.empresa || need.tipo_partida !== a.tipo_partida ||
            need.naturaleza !== a.naturaleza_afectacion ||
            need.currency_original !== a.currency_original ||
            compareDecimal(need.amount_original, a.amount_original) !== 0) invalid();
          // A classification may predate later adjustments; current pending is always
          // resolved from the linked affectation by buildNeedQueue.
          if (getAffectationPending(a) === 0 && !need.requiere_seguimiento_adicional) invalid();
        }
      }
    }
  } catch (error) {
    if (error.code === 'INVALID_STORED_NEED_STATE') throw error;
    invalid();
  }
}
export function saveNeedState(storage, state) {
  validateStoredState(state);
  storage.setItem(storageKey, JSON.stringify({ version: 1, state }));
}
export function loadNeedState(storage) {
  const raw = storage.getItem(storageKey); if (raw === null) return null;
  let saved;
  try { saved = JSON.parse(raw); } catch { throw new NeedError('INVALID_STORED_NEED_STATE'); }
  requireValue(saved?.version === 1, 'INVALID_STORED_NEED_STATE');
  validateStoredState(saved.state); return freeze(saved.state);
}
