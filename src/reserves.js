import { registerAffectation, calculateCompanyPosition } from './position.js';
import { reclassifyAffectation } from './needs.js';
import { buildPosture } from './posture.js';
import { buildCoverageReport } from './coverage.js';
import { buildFxReport } from './fx.js';

export class ReserveError extends Error {
  constructor(code) { super(code); this.name = 'ReserveError'; this.code = code; }
}
const check = (ok, code) => { if (!ok) throw new ReserveError(code); };
const text = value => typeof value === 'string' && value.trim().length > 0;
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function timestamp(value) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)), 'INVALID_TIMESTAMP');
  const day = value.slice(0, 10);
  check(new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day, 'INVALID_TIMESTAMP');
}
function linked(state, id) {
  const a = state.affectations.find(a => a.affectation_id === id);
  check(a, 'UNKNOWN_AFFECTATION_REFERENCE'); return a;
}
export function buildReserveView(state, affectation_id) {
  const a = linked(state, affectation_id);
  const history = state.events.filter(e => (e.affectation_id ?? e.input?.affectation_id) === affectation_id);
  check(a.naturaleza_afectacion === 'RESERVA' || history.some(e => e.result?.naturaleza_afectacion === 'RESERVA'), 'NOT_A_RESERVE');
  const operations = history.filter(e => e.kind === 'RESERVE');
  const sum = operation => operations.filter(e => e.operacion === operation).reduce((s, e) => s + e.monto, 0);
  const released = sum('RELEASE_RESERVE'); const reassigned = sum('REASSIGN_RESERVE');
  const cancelled = history.filter(e => e.kind === 'AFECTACION' && e.input.operacion === 'ANULACION'
    && e.result.naturaleza_afectacion === 'RESERVA').reduce((s, e) => s + e.input.monto_anulado, 0);
  const converted = a.naturaleza_afectacion === 'COMPROMISO' || history.some(e =>
    e.kind === 'RESERVE' && e.operacion === 'CONVERT_RESERVE_TO_COMMITMENT'
    || e.kind === 'AFECTACION' && e.input.operacion === 'RECLASIFICACION' && e.input.naturaleza_destino === 'COMPROMISO');
  const blocked = !converted && a.naturaleza_afectacion === 'RESERVA' && a.estado === 'ACTIVA' ? a.monto_vigente : 0;
  const status = reserveStatus({ converted, cancelled: a.estado === 'ANULADA', blocked, released, reassigned, annulled: cancelled });
  const terminal = ['CONVERTIDA_A_COMPROMISO', 'ANULADA'].includes(status);
  return freeze({ affectation_id, empresa: a.empresa, amount_original: a.amount_original,
    monto_original: a.amount_original, currency_original: a.currency_original, monto_bloqueado: blocked,
    monto_liberado: released, monto_reasignado: reassigned, monto_liberado_disponible: terminal ? 0 : released - reassigned,
    monto_anulado_acumulado: cancelled, estado: status, historial: structuredClone(history) });
}
function reserveStatus({ converted, cancelled, blocked, released, reassigned, annulled }) {
  if (converted) return 'CONVERTIDA_A_COMPROMISO';
  if (cancelled) return 'ANULADA';
  if (annulled > 0 && blocked > 0) return 'PARCIALMENTE_ANULADA';
  if (blocked === 0 && released > 0) return 'LIBERADA';
  if (blocked > 0 && released > 0) return 'PARCIALMENTE_LIBERADA';
  if (reassigned > 0) return 'REASIGNADA';
  return 'ACTIVA';
}
const summary = view => { const { historial, ...rest } = view; return rest; };
function operate(state, row, request_id, operation) {
  check(text(request_id), 'INVALID_IDEMPOTENCY_KEY');
  const payload = JSON.stringify(canonical({ kind: operation, rows: [row] }));
  const receipt = state.receipts.find(r => r.scope === 'request_id' && r.id === request_id);
  if (receipt) { check(receipt.payload === payload, 'IDEMPOTENCY_CONFLICT'); return state; }
  check(text(row.motivo), 'RESERVE_REASON_REQUIRED'); check(text(row.origen), 'INVALID_ORIGIN');
  check(row.usuario === undefined || text(row.usuario), 'INVALID_USER'); timestamp(row.fecha_hora_evento);
  const a = linked(state, row.affectation_id); const before = summary(buildReserveView(state, row.affectation_id));
  check(before.estado !== 'CONVERTIDA_A_COMPROMISO', 'RESERVE_ALREADY_CONVERTED_TO_COMMITMENT');
  check(before.estado !== 'ANULADA', 'RESERVE_ALREADY_CANCELLED');
  check(a.naturaleza_afectacion === 'RESERVA', 'NOT_A_RESERVE');
  check(a.estado === 'ACTIVA', 'RESERVE_NOT_ACTIVE');
  check(a.monto_reflejado_confirmado === 0, 'RESERVE_HAS_CONFIRMED_AMOUNT');
  const history = state.events.filter(e => e.kind === 'RESERVE' && e.affectation_id === a.affectation_id);
  check([a, ...history].every(e => Date.parse(row.fecha_hora_evento) >= Date.parse(e.fecha_hora_evento)), 'RETROACTIVE_RESERVE_EVENT');
  const amount = row.monto;
  const provenance = { affectation_id: a.affectation_id, origen: row.origen, fecha_hora_evento: row.fecha_hora_evento,
    ...(row.usuario === undefined ? {} : { usuario: row.usuario }) };
  let next;
  if (operation === 'KEEP_RELEASED_FREE') {
    check(before.monto_liberado_disponible > 0, 'NO_RELEASED_AMOUNT');
    next = structuredClone(state);
  } else if (operation === 'CONVERT_RESERVE_TO_COMMITMENT') {
    check(amount === undefined || amount === before.monto_bloqueado, 'INVALID_RESERVE_CONVERSION_AMOUNT');
    next = reclassifyAffectation(state, { ...provenance, naturaleza_destino: 'COMPROMISO', motivo_reclasificacion: row.motivo }, request_id);
    next = structuredClone(next);
    next.receipts = next.receipts.filter(r => !(r.scope === 'request_id' && r.id === request_id));
  } else {
    check(Number.isFinite(amount) && amount > 0, 'INVALID_RESERVE_AMOUNT');
    if (operation === 'RELEASE_RESERVE') {
      check(amount <= before.monto_bloqueado, 'EXCESSIVE_RESERVE_RELEASE');
      next = registerAffectation(state, { ...provenance, operacion: 'AJUSTE', monto_vigente: a.monto_vigente - amount }, request_id);
    } else if (operation === 'REASSIGN_RESERVE') {
      check(amount <= before.monto_liberado_disponible, 'EXCESSIVE_RESERVE_REASSIGNMENT');
      next = registerAffectation(state, { ...provenance, operacion: 'AJUSTE', monto_vigente: a.monto_vigente + amount }, request_id);
    } else if (operation === 'CANCEL_RESERVE') {
      check(amount <= before.monto_bloqueado, 'EXCESSIVE_RESERVE_CANCELLATION');
      next = registerAffectation(state, { ...provenance, operacion: 'ANULACION', monto_anulado: amount }, request_id);
    } else throw new ReserveError('UNSUPPORTED_RESERVE_OPERATION');
    next = structuredClone(next);
    next.receipts = next.receipts.filter(r => !(r.scope === 'request_id' && r.id === request_id));
  }
  const after = { ...summary(buildReserveView(next, a.affectation_id)) };
  if (operation === 'RELEASE_RESERVE') { after.monto_liberado += amount; after.monto_liberado_disponible += amount; }
  if (operation === 'REASSIGN_RESERVE') { after.monto_reasignado += amount; after.monto_liberado_disponible -= amount; }
  after.estado = reserveStatus({ converted: after.estado === 'CONVERTIDA_A_COMPROMISO', cancelled: after.estado === 'ANULADA',
    blocked: after.monto_bloqueado, released: after.monto_liberado, reassigned: after.monto_reasignado, annulled: after.monto_anulado_acumulado });
  next.events.push({ kind: 'RESERVE', operacion: operation, ...provenance, request_id, motivo: row.motivo,
    monto: operation === 'KEEP_RELEASED_FREE' ? 0 : operation === 'CONVERT_RESERVE_TO_COMMITMENT' ? before.monto_bloqueado : amount, before, after,
    explicacion: operation === 'KEEP_RELEASED_FREE' ? 'IMPORTE_LIBRE_SIN_ASIGNACION_AUTOMATICA' : operation });
  next.receipts.push({ scope: 'request_id', id: request_id, payload });
  return freeze(next);
}
export const releaseReserve = (state, row, request_id) => operate(state, row, request_id, 'RELEASE_RESERVE');
export const reassignReserve = (state, row, request_id) => operate(state, row, request_id, 'REASSIGN_RESERVE');
export const keepReleasedFree = (state, row, request_id) => operate(state, row, request_id, 'KEEP_RELEASED_FREE');
export const convertReserveToCommitment = (state, row, request_id) => operate(state, row, request_id, 'CONVERT_RESERVE_TO_COMMITMENT');
export const cancelReserve = (state, row, request_id) => operate(state, row, request_id, 'CANCEL_RESERVE');

function comparison(state, scenario, monetaryState) {
  const position = calculateCompanyPosition(state, scenario.empresa, monetaryState);
  const coverage = scenario.contexto_cobertura === undefined ? null
    : buildCoverageReport(state, scenario.empresa, scenario.contexto_cobertura, monetaryState);
  return { ...position, postura: buildPosture(state, scenario.empresa, monetaryState),
    capacidad_cobertura: coverage?.monto_cubierto ?? null, cobertura: coverage,
    fx: scenario.contexto_fx === undefined ? null : buildFxReport(state, scenario.contexto_fx, monetaryState) };
}
export function simulateReserveScenario(state, scenario, monetaryState) {
  check(text(scenario.scenario_id) && Array.isArray(scenario.acciones), 'INVALID_RESERVE_SCENARIO');
  check(state.catalogue.empresas.includes(scenario.empresa), 'INVALID_COMPANY');
  let privateState = structuredClone(state); const log = []; const errors = [];
  const antes = comparison(privateState, scenario, monetaryState);
  const operations = { RELEASE_RESERVE: releaseReserve, REASSIGN_RESERVE: reassignReserve, KEEP_RELEASED_FREE: keepReleasedFree,
    CONVERT_RESERVE_TO_COMMITMENT: convertReserveToCommitment, CANCEL_RESERVE: cancelReserve };
  for (const [index, action] of scenario.acciones.entries()) {
    try {
      check(action && typeof action === 'object', 'INVALID_SCENARIO_ACTION');
      check(operations[action.operacion], 'UNSUPPORTED_RESERVE_OPERATION');
      const { operacion, ...row } = action;
      check(linked(privateState, row.affectation_id).empresa === scenario.empresa, 'SCENARIO_COMPANY_MISMATCH');
      let id = `WHAT_IF:${scenario.scenario_id}:${index}`;
      while (privateState.receipts.some(r => r.scope === 'request_id' && r.id === id)) id += ':';
      privateState = operations[operacion](privateState, row, id);
      log.push({ indice: index, operacion, resultado: 'PASS', evento: structuredClone(privateState.events.at(-1)) });
    } catch (error) {
      errors.push({ indice: index, code: error.code ?? 'INVALID_SCENARIO_ACTION' });
      log.push({ indice: index, operacion: action?.operacion ?? null, resultado: 'ERROR', code: error.code ?? 'INVALID_SCENARIO_ACTION' }); break;
    }
  }
  return freeze({ scenario_id: scenario.scenario_id, estado: errors.length ? 'INVALIDO' : 'VALIDO',
    antes, despues: errors.length ? null : comparison(privateState, scenario, monetaryState), log, errors,
    acciones_no_ejecutadas: scenario.acciones.length - log.length, solo_simulacion: true });
}
