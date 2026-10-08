import { createMoney, convertMoney } from './money.js';
import { getAffectationPending } from './position.js';
import { validateCoverageInstructions } from './coverage.js';
import { reserveBankCapacity, releaseBankCapacity } from './bank-restrictions.js';
import { buildFxPlan } from './fx.js';

export class MandateError extends Error {
  constructor(code, detail = code) { super(detail); this.name = 'MandateError'; this.code = code; }
}
const check = (ok, code) => { if (!ok) throw new MandateError(code); };
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
  const day = value.slice(0, 10); check(new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day, 'INVALID_TIMESTAMP');
}
const activeReservations = state => (state.mandates ?? []).filter(m => m.estado === 'APROBADO').flatMap(m => m.capacidad_fisica_reservada);
function validate(state, mandate, context, monetaryState, approving) {
  const a = state.affectations.find(a => a.affectation_id === mandate.affectation_id);
  check(a, 'UNKNOWN_AFFECTATION_REFERENCE'); check(a.estado === 'ACTIVA' && getAffectationPending(a) > 0, 'AFFECTATION_NOT_ACTIVE');
  check(a.empresa === mandate.empresa_destino, 'DESTINATION_COMPANY_MISMATCH');
  const pending = convertMoney(createMoney(getAffectationPending(a), a.currency_original), 'VES', monetaryState).amount;
  check(mandate.importe_total_ves <= pending, 'MANDATE_EXCEEDS_PENDING_AMOUNT');
  const already = (state.mandates ?? []).filter(m => m.estado === 'APROBADO' && m.affectation_id === a.affectation_id)
    .reduce((sum, m) => sum + m.importe_total_ves, 0);
  if (approving && already > 0 && already + mandate.importe_total_ves > pending)
    throw new MandateError('BLOCKED_BY_FUNCTIONAL_RULE', 'Falta definir el limite conjunto de mandatos aprobados para una afectacion.');
  let displaced = [];
  if (mandate.origen_funcional === 'FX_PLAN') {
    const fx = (state.fxObligations ?? []).find(f => f.fx_id === mandate.fx_id);
    check(fx && fx.affectation_id === mandate.affectation_id, 'INVALID_MANDATE_FX_REFERENCE');
    for (const key of ['banco_negociador', 'fecha_valor', 'fecha_hora_critica']) check(fx[key] === mandate[key], 'STALE_MANDATE_FX');
    const evidence = mandate.evidencia_plan.excepcion_temporal;
    const current = buildFxPlan(state, mandate.fx_id, { ...context, settlement: mandate.tramos[0].settlement,
      excepcion_temporal: context.excepcion_temporal ?? (evidence ? { motivo: evidence.motivo, desplazadas: evidence.desplazadas } : undefined) }, monetaryState);
    check(current.publicable, current.errors[0]?.code ?? 'FX_NOT_PUBLISHABLE');
    const exception = mandate.evidencia_plan.estado === 'PENDIENTE_APROBACION_EXCEPCION' || current.estado === 'PENDIENTE_APROBACION_EXCEPCION';
    if (current.excepcion_temporal?.aceptable) displaced = current.excepcion_temporal.desplazadas;
    if (approving && exception) {
      check(context.excepcion_fx_autorizada === true, 'FX_EXCEPTION_AUTHORIZATION_REQUIRED');
      throw new MandateError('BLOCKED_BY_FUNCTIONAL_RULE', 'Falta definir si la aprobacion reserva tambien las rutas de recomposicion FX.');
    }
  }
  return validateCoverageInstructions(state, a.affectation_id, mandate.tramos, { ...context,
    settlement: mandate.tramos[0].settlement }, monetaryState, activeReservations(state), displaced);
}
const transitions = { SUBMIT_MANDATE: ['BORRADOR'], APPROVE_MANDATE: ['PENDIENTE_APROBACION'],
  REJECT_MANDATE: ['PENDIENTE_APROBACION'], CANCEL_MANDATE: ['BORRADOR', 'PENDIENTE_APROBACION', 'APROBADO'],
  EXPIRE_MANDATE: ['BORRADOR', 'PENDIENTE_APROBACION', 'APROBADO'] };
const targets = { SUBMIT_MANDATE: 'PENDIENTE_APROBACION', APPROVE_MANDATE: 'APROBADO', REJECT_MANDATE: 'RECHAZADO', CANCEL_MANDATE: 'CANCELADO', EXPIRE_MANDATE: 'EXPIRADO' };
function create(state, row, monetaryState) {
  check(text(row.mandate_id) && !(state.mandates ?? []).some(m => m.mandate_id === row.mandate_id), 'INVALID_OR_DUPLICATE_MANDATE_ID');
  check(text(row.motivo), 'MANDATE_REASON_REQUIRED'); timestamp(row.fecha_hora_limite);
  check(['MANUAL', 'COVERAGE_PLAN', 'FX_PLAN'].includes(row.origen_funcional), 'INVALID_MANDATE_ORIGIN');
  check(Array.isArray(row.tramos) && row.tramos.length > 0, 'MANDATE_INSTRUCTIONS_REQUIRED');
  const tramos = row.tramos.map(t => {
    check(t && typeof t === 'object', 'INVALID_MANDATE_INSTRUCTION');
    check(Number.isFinite(t.monto_ves) && t.monto_ves > 0 && Number.isFinite(t.monto_operacion) && t.monto_operacion > 0, 'INVALID_MANDATE_AMOUNT');
    check(['T0', 'T1'].includes(t.settlement), 'INVALID_SETTLEMENT'); timestamp(t.fecha_hora_objetivo);
    check(t.empresa_destino === row.empresa_destino, 'DESTINATION_COMPANY_MISMATCH');
    check(convertMoney(createMoney(t.monto_operacion, t.moneda_operacion), 'VES', monetaryState).amount === t.monto_ves, 'MANDATE_OPERATION_AMOUNT_MISMATCH');
    return structuredClone(t);
  });
  const m = { mandate_id: row.mandate_id, affectation_id: row.affectation_id, empresa_destino: row.empresa_destino,
    origen_funcional: row.origen_funcional, motivo: row.motivo, estado: 'BORRADOR', tramos,
    importe_total_ves: tramos.reduce((sum, t) => sum + t.monto_ves, 0), fecha_hora_limite: row.fecha_hora_limite,
    reservas_bancarias_asociadas: [], capacidad_fisica_reservada: [], aprobador: null, fecha_hora_aprobacion: null };
  if (row.origen_funcional !== 'MANUAL') {
    check(row.plan?.affectation_id === row.affectation_id, 'INVALID_MANDATE_PLAN_REFERENCE');
    m.evidencia_plan = structuredClone(row.plan);
    const routes = row.origen_funcional === 'FX_PLAN' ? row.plan.rutas : row.plan.tramos;
    check(Array.isArray(routes) && tramos.every(t => routes.some(r =>
      ['empresa_fuente', 'banco_fuente', 'cuenta_fuente', 'empresa_destino', 'banco_destino', 'cuenta_destino', 'moneda_operacion', 'monto_operacion']
        .every(k => r[k] === t[k]) && r.monto_propuesto_ves === t.monto_ves)), 'MANDATE_PLAN_INSTRUCTION_MISMATCH');
    if (row.origen_funcional === 'FX_PLAN') {
      for (const k of ['fx_id', 'banco_negociador', 'fecha_valor', 'fecha_hora_critica']) m[k] = row.plan[k];
      timestamp(m.fecha_hora_critica);
      for (const t of tramos) {
        check(t.banco_destino === m.banco_negociador, 'FX_NEGOTIATING_BANK_MISMATCH');
        check(Date.parse(t.fecha_hora_objetivo) <= Date.parse(m.fecha_hora_critica), 'FX_CRITICAL_TIME_EXCEEDED');
      }
    }
  }
  timestamp(row.contexto?.fecha_hora_evaluacion);
  check(Date.parse(row.contexto.fecha_hora_evaluacion) <= Date.parse(m.fecha_hora_limite), 'MANDATE_EXPIRED');
  m.tramos = structuredClone(validate(state, m, row.contexto, monetaryState, false));
  return m;
}
function operate(state, row, request_id, operation, monetaryState) {
  check(text(request_id), 'INVALID_IDEMPOTENCY_KEY');
  const payload = JSON.stringify(canonical({ kind: operation, rows: [row] }));
  const receipt = state.receipts.find(r => r.scope === 'request_id' && r.id === request_id);
  if (receipt) { check(receipt.payload === payload, 'IDEMPOTENCY_CONFLICT'); return state; }
  check(text(row.origen), 'INVALID_ORIGIN'); check(text(row.usuario), 'MANDATE_USER_REQUIRED'); timestamp(row.fecha_hora_evento);
  let next = structuredClone(state); next.mandates ??= [];
  let mandate = next.mandates.find(m => m.mandate_id === row.mandate_id); const before = structuredClone(mandate ?? null);
  if (operation === 'CREATE_MANDATE') {
    mandate = create(next, row, monetaryState); next.mandates.push(mandate);
  } else {
    check(mandate, 'UNKNOWN_MANDATE_REFERENCE');
    check(transitions[operation].includes(mandate.estado), 'INVALID_MANDATE_TRANSITION');
    check(['tramos', 'affectation_id', 'empresa_destino', 'importe_total_ves', 'fecha_hora_limite', 'fx_id', 'plan'].every(k => row[k] === undefined), 'IMMUTABLE_MANDATE_INSTRUCTION');
    check(Date.parse(row.fecha_hora_evento) >= Date.parse(mandate.fecha_hora_evento), 'RETROACTIVE_MANDATE_EVENT');
    if (['REJECT_MANDATE', 'CANCEL_MANDATE'].includes(operation)) check(text(row.motivo), 'MANDATE_REASON_REQUIRED');
    if (operation === 'EXPIRE_MANDATE') check(Date.parse(row.fecha_hora_evento) > Date.parse(mandate.fecha_hora_limite), 'MANDATE_NOT_EXPIRED');
    if (operation === 'APPROVE_MANDATE') {
      check(text(row.aprobador), 'MANDATE_APPROVER_REQUIRED'); timestamp(row.fecha_hora_aprobacion);
      check(Date.parse(row.fecha_hora_aprobacion) >= Date.parse(row.fecha_hora_evento), 'RETROACTIVE_MANDATE_APPROVAL');
      check(Date.parse(row.fecha_hora_aprobacion) <= Date.parse(mandate.fecha_hora_limite), 'MANDATE_EXPIRED');
      const validated = validate(next, mandate, { ...row.contexto, fecha_hora_evaluacion: row.fecha_hora_aprobacion }, monetaryState, true);
      if (validated.some(t => t.acciones_requeridas.includes('APROBACION_ADICIONAL')))
        check(row.contexto?.aprobacion_bancaria_adicional === true, 'BANK_ADDITIONAL_APPROVAL_REQUIRED');
      mandate.validacion_aprobacion = structuredClone(validated);
      for (const [i, t] of validated.entries()) {
        const e = t.evaluacion; const id = JSON.stringify(['MANDATE', mandate.mandate_id, i]);
        next = structuredClone(reserveBankCapacity(next, { reservation_id: id, banco: t.banco_fuente, empresa: t.empresa_fuente,
          cuenta: t.cuenta_fuente, moneda: e.moneda, fecha: e.fecha, monto: e.monto_propuesto, operaciones: e.operaciones_requeridas,
          origen: row.origen, usuario: row.usuario, fecha_hora_evento: row.fecha_hora_evento }, JSON.stringify([request_id, 'BANK_RESERVE', i])));
        mandate = next.mandates.find(m => m.mandate_id === row.mandate_id);
        mandate.reservas_bancarias_asociadas.push(id);
        mandate.capacidad_fisica_reservada.push({ affectation_id: mandate.affectation_id, empresa_fuente: t.empresa_fuente,
          empresa_destino: t.empresa_destino, cuenta_fuente: t.cuenta_fuente, banco_fuente: t.banco_fuente, monto_ves: t.monto_ves });
      }
      mandate.aprobador = row.aprobador; mandate.fecha_hora_aprobacion = row.fecha_hora_aprobacion;
      mandate.aprobacion_bancaria_adicional = row.contexto?.aprobacion_bancaria_adicional === true;
    }
    if (before.estado === 'APROBADO' && ['CANCEL_MANDATE', 'EXPIRE_MANDATE'].includes(operation)) {
      for (const [i, reservation_id] of mandate.reservas_bancarias_asociadas.entries()) {
        next = structuredClone(releaseBankCapacity(next, { reservation_id, origen: row.origen, usuario: row.usuario,
          fecha_hora_evento: row.fecha_hora_evento }, JSON.stringify([request_id, 'BANK_RELEASE', i])));
      }
      mandate = next.mandates.find(m => m.mandate_id === row.mandate_id);
    }
    mandate.estado = targets[operation];
  }
  Object.assign(mandate, { fecha_hora_evento: row.fecha_hora_evento, usuario: row.usuario, origen: row.origen });
  next.events.push({ kind: 'MANDATE', operacion: operation, mandate_id: mandate.mandate_id, affectation_id: mandate.affectation_id,
    before, after: structuredClone(mandate), usuario: row.usuario, origen: row.origen, fecha_hora_evento: row.fecha_hora_evento,
    motivo: row.motivo ?? null, request_id });
  next.receipts.push({ scope: 'request_id', id: request_id, payload }); return freeze(next);
}
export const createMandate = (state, row, request_id, monetaryState) => operate(state, row, request_id, 'CREATE_MANDATE', monetaryState);
export const submitMandate = (state, row, request_id) => operate(state, row, request_id, 'SUBMIT_MANDATE');
export const approveMandate = (state, row, request_id, monetaryState) => operate(state, row, request_id, 'APPROVE_MANDATE', monetaryState);
export const rejectMandate = (state, row, request_id) => operate(state, row, request_id, 'REJECT_MANDATE');
export const cancelMandate = (state, row, request_id) => operate(state, row, request_id, 'CANCEL_MANDATE');
export const expireMandate = (state, row, request_id) => operate(state, row, request_id, 'EXPIRE_MANDATE');
export function buildMandateView(state, mandate_id) {
  const m = (state.mandates ?? []).find(m => m.mandate_id === mandate_id); check(m, 'UNKNOWN_MANDATE_REFERENCE');
  const tramos = m.validacion_aprobacion ?? m.tramos;
  return freeze({ ...structuredClone(m), restricciones: structuredClone(tramos.flatMap(t => t.restricciones)),
    acciones_requeridas: [...new Set(tramos.flatMap(t => t.acciones_requeridas))],
    capacidad_fisica_reservada: m.estado === 'APROBADO' ? structuredClone(m.capacidad_fisica_reservada) : [],
    reservas_bancarias: structuredClone((state.bankCapacityReservations ?? []).filter(r => m.reservas_bancarias_asociadas.includes(r.reservation_id))),
    explicacion: m.estado === 'APROBADO' ? 'AUTORIZADO_PARA_EJECUTAR_NO_EJECUTADO' : 'SIN_EJECUCION_BANCARIA' });
}
export function buildMandateReport(state) {
  return freeze({ mandatos: [...(state.mandates ?? [])].sort((a, b) => a.mandate_id < b.mandate_id ? -1 : a.mandate_id > b.mandate_id ? 1 : 0)
    .map(m => buildMandateView(state, m.mandate_id)) });
}
