import { createMoney, convertMoney } from './money.js';
import { getAffectationPending } from './position.js';
import { getBankValueDate } from './bank-restrictions.js';
import { createCoverageSimulation, releaseCoverageAllocation, buildCoverageRequest } from './coverage.js';

export class FxError extends Error {
  constructor(code) { super(code); this.name = 'FxError'; this.code = code; }
}
const check = (ok, code) => { if (!ok) throw new FxError(code); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const priorities = ['P1_CRITICA', 'P2_ALTA', 'P3_NORMAL', 'P4_DISCRECIONAL'];
const rigidities = ['R1_HORA_RIGIDA', 'R2_VENTANA_DIA', 'R3_FECHA_RIGIDA', 'R4_FLEXIBLE'];
const rank = (values, value) => values.includes(value) ? values.indexOf(value) : values.length;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
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
function economicLink(state, row) {
  check(text(row.affectation_id), 'FX_AFFECTATION_REQUIRED');
  const affectation = state.affectations.find(a => a.affectation_id === row.affectation_id);
  check(affectation, 'UNKNOWN_AFFECTATION_REFERENCE');
  check(affectation.estado === 'ACTIVA' && getAffectationPending(affectation) > 0, 'FX_AFFECTATION_NOT_ACTIVE');
  check(row.empresa === undefined || row.empresa === affectation.empresa, 'FX_COMPANY_MISMATCH');
  const need = (state.needs ?? []).find(n => n.affectation_id === affectation.affectation_id && n.estado === 'ACTIVA');
  check(row.need_id == null || row.need_id === need?.need_id, 'FX_NEED_LINK_MISMATCH');
  return { affectation, need };
}
function equivalent(state, row, monetaryState) {
  const { affectation } = economicLink(state, row);
  const converted = convertMoney(createMoney(row.monto_divisa, row.moneda_objetivo), 'VES', monetaryState).amount;
  const pending = convertMoney(createMoney(getAffectationPending(affectation), affectation.currency_original), 'VES', monetaryState).amount;
  check(converted === pending, 'FX_AMOUNT_PENDING_MISMATCH');
  return converted;
}
function calendar(state, row) {
  return getBankValueDate(state, { banco: row.banco_negociador, empresa: row.empresa, moneda: 'VES',
    ...(row.cuenta_destino_fx === undefined ? {} : { cuenta: row.cuenta_destino_fx }) }, row.fecha_hora_negociacion, row.zona_horaria);
}
function validateDestination(state, row) {
  check(state.catalogue.bancos.includes(row.banco_negociador), 'INVALID_BANK');
  if (row.cuenta_destino_fx !== undefined) {
    const account = state.catalogue.cuentas.find(a => a.cuenta === row.cuenta_destino_fx);
    check(account && account.empresa === row.empresa && account.banco === row.banco_negociador, 'INVALID_FX_DESTINATION_ACCOUNT');
  }
}
function change(state, row, request_id, operation, monetaryState) {
  check(text(request_id), 'INVALID_IDEMPOTENCY_KEY');
  const payload = JSON.stringify(canonical({ kind: operation, rows: [row] }));
  const receipt = state.receipts.find(r => r.scope === 'request_id' && r.id === request_id);
  if (receipt) { check(receipt.payload === payload, 'IDEMPOTENCY_CONFLICT'); return state; }
  check(text(row.fx_id), 'INVALID_FX_ID'); check(text(row.origen), 'INVALID_ORIGIN');
  check(row.usuario === undefined || text(row.usuario), 'INVALID_USER'); timestamp(row.fecha_hora_evento);
  const records = state.fxObligations ?? []; const before = records.find(f => f.fx_id === row.fx_id) ?? null;
  let after = null;
  if (operation === 'SET_FX_OBLIGATION') {
    const { affectation, need } = economicLink(state, row);
    check(!before || before.affectation_id === row.affectation_id, 'IMMUTABLE_FX_AFFECTATION');
    check(!records.some(f => f.fx_id !== row.fx_id && f.affectation_id === row.affectation_id), 'DUPLICATE_ACTIVE_FX_FOR_AFFECTATION');
    createMoney(row.monto_divisa, row.moneda_objetivo); check(row.monto_divisa > 0, 'INVALID_FX_AMOUNT');
    timestamp(row.fecha_hora_negociacion); timestamp(row.fecha_hora_critica);
    after = { fx_id: row.fx_id, affectation_id: affectation.affectation_id, need_id: need?.need_id ?? null,
      empresa: affectation.empresa, banco_negociador: row.banco_negociador, moneda_objetivo: row.moneda_objetivo,
      monto_divisa: row.monto_divisa, fecha_hora_negociacion: row.fecha_hora_negociacion,
      fecha_hora_critica: row.fecha_hora_critica, zona_horaria: row.zona_horaria,
      ...(row.cuenta_destino_fx === undefined ? {} : { cuenta_destino_fx: row.cuenta_destino_fx }),
      origen: row.origen, fecha_hora_evento: row.fecha_hora_evento, ...(row.usuario === undefined ? {} : { usuario: row.usuario }),
      estado: 'CONFIGURADA', publicable: true, errors: [] };
    validateDestination(state, after);
    const valueDate = calendar(state, after).fecha_valor;
    check(row.fecha_valor === undefined || row.fecha_valor === valueDate, 'FX_VALUE_DATE_MISMATCH'); after.fecha_valor = valueDate;
    try {
      after.equivalente_ves = equivalent(state, after, monetaryState);
      check(row.equivalente_ves === undefined || row.equivalente_ves === after.equivalente_ves, 'FX_AMOUNT_PENDING_MISMATCH');
    } catch (error) {
      if (error.code !== 'MISSING_EXCHANGE_RATE') throw error;
      after.equivalente_ves = null; after.publicable = false; after.errors = [{ code: error.code }];
    }
  } else check(before, 'UNKNOWN_FX_REFERENCE');
  const next = structuredClone(state); next.fxObligations = next.fxObligations?.filter(f => f.fx_id !== row.fx_id) ?? [];
  if (after) next.fxObligations.push(after);
  next.events.push({ kind: 'FX', operacion: operation, fx_id: row.fx_id,
    affectation_id: (after ?? before).affectation_id, empresa: (after ?? before).empresa,
    before: structuredClone(before), after: structuredClone(after), origen: row.origen,
    fecha_hora_evento: row.fecha_hora_evento, ...(row.usuario === undefined ? {} : { usuario: row.usuario }), request_id });
  next.receipts.push({ scope: 'request_id', id: request_id, payload }); return freeze(next);
}
export const setFxObligation = (state, row, request_id, monetaryState) => change(state, row, request_id, 'SET_FX_OBLIGATION', monetaryState);
export const clearFxObligation = (state, row, request_id) => change(state, row, request_id, 'CLEAR_FX_OBLIGATION');

function current(state, fx, monetaryState) {
  const { need } = economicLink(state, { ...fx, need_id: undefined });
  const value = equivalent(state, { ...fx, need_id: undefined }, monetaryState);
  const dates = calendar(state, fx); check(fx.fecha_valor === dates.fecha_valor, 'FX_VALUE_DATE_MISMATCH');
  return { ...fx, equivalente_ves: value, need_id: need?.need_id ?? null,
    prioridad_economica: need?.prioridad_economica ?? null, rigidez_temporal: need?.rigidez_temporal ?? null,
    publicable: true, errors: [], calendario: dates };
}
function routeContext(fx, context, deadline = fx.fecha_hora_critica) {
  const result = { ...context, zona_horaria: fx.zona_horaria, fecha_hora_objetivo: deadline,
    banco_destino: fx.banco_negociador,
    ...(fx.cuenta_destino_fx === undefined ? {} : { cuenta_destino: fx.cuenta_destino_fx }) };
  return result;
}
const request = (fx, amount) => ({ affectation_id: fx.affectation_id, monto_ves: amount,
  banco_destino: fx.banco_negociador, permitir_localizacion_destino: true });
function emptyResult(fx) {
  return { ...fx, monto_localizado_banco_negociador: 0, monto_localizado_otros_bancos_propios: 0,
    capacidad_fisica_libre_propia: 0, monto_cobertura_intercompany: 0, monto_cubierto_total: 0,
    gap_fx: fx.equivalente_ves, estado: 'SIN_COBERTURA', rutas: [], restricciones: [],
    excepcion_temporal: null, recomposicion: [], explicacion: [] };
}
function constraints(plan) {
  return [...plan.tramos.flatMap(t => t.restricciones), ...plan.fuentes_descartadas.flatMap(f => f.evaluacion?.explicaciones ?? [])];
}
function exception(state, fx, input, context, monetaryState, sim, gap) {
  const result = { aceptable: false, requiere_aprobacion: true, motivo: input?.motivo ?? null, desplazadas: [], errors: [] };
  const recompositions = []; const trial = structuredClone(sim);
  try {
    check(text(input?.motivo) && Array.isArray(input.desplazadas) && input.desplazadas.length > 0, 'FX_RECOMPOSITION_REQUIRED');
    const seen = new Set(); let displaced = 0;
    for (const row of input.desplazadas) {
      const need = (state.needs ?? []).find(n => n.need_id === row.need_id_desplazada && n.estado === 'ACTIVA');
      check(need && need.empresa === fx.empresa && need.affectation_id !== fx.affectation_id, 'INVALID_DISPLACED_NEED');
      check(!seen.has(need.need_id), 'DUPLICATE_DISPLACED_NEED'); seen.add(need.need_id);
      check(rank(priorities, need.prioridad_economica) < rank(priorities, fx.prioridad_economica)
        && rank(rigidities, fx.rigidez_temporal) < rigidities.length - 1
        && (need.fecha_hora_objetivo ? Date.parse(fx.fecha_hora_critica) < Date.parse(need.fecha_hora_objetivo) : need.rigidez_temporal === 'R4_FLEXIBLE'), 'FX_TEMPORAL_EXCEPTION_NOT_ELIGIBLE');
      const limit = row.fecha_hora_limite_recomposicion ?? need.fecha_hora_objetivo;
      check(limit != null, 'FX_RECOMPOSITION_DEADLINE_REQUIRED'); timestamp(limit);
      check(!need.fecha_hora_objetivo || Date.parse(limit) <= Date.parse(need.fecha_hora_objetivo), 'FX_RECOMPOSITION_DEADLINE_EXTENDED');
      const a = state.affectations.find(a => a.affectation_id === need.affectation_id);
      const pending = convertMoney(createMoney(getAffectationPending(a), a.currency_original), 'VES', monetaryState).amount;
      check(Number.isFinite(row.monto_desplazado_ves) && row.monto_desplazado_ves > 0 && row.monto_desplazado_ves <= pending, 'INVALID_DISPLACED_AMOUNT');
      const released = releaseCoverageAllocation(trial, a.affectation_id, row.monto_desplazado_ves);
      check(released === row.monto_desplazado_ves, 'DISPLACED_CAPACITY_NOT_AVAILABLE');
      displaced += released;
      const bank = a.banco_asignado ?? row.banco_destino;
      check(state.catalogue.bancos.includes(bank), 'RECOMPOSITION_DESTINATION_REQUIRED');
      result.desplazadas.push({ need_id_desplazada: need.need_id, affectation_id: a.affectation_id,
        monto_desplazado_ves: released, fecha_hora_limite_recomposicion: limit, banco_destino: bank });
    }
    check(displaced <= gap, 'DISPLACEMENT_EXCEEDS_FX_GAP');
    const extra = buildCoverageRequest(state, request(fx, gap), routeContext(fx, context), monetaryState, trial);
    check(extra.monto_cubierto === gap, 'FX_EXCEPTION_COVERAGE_INCOMPLETE');
    for (const item of result.desplazadas) {
      const restored = buildCoverageRequest(state, { affectation_id: item.affectation_id, monto_ves: item.monto_desplazado_ves,
        banco_destino: item.banco_destino }, { ...context, zona_horaria: fx.zona_horaria,
        banco_destino: item.banco_destino, cuenta_destino: undefined, fecha_hora_objetivo: item.fecha_hora_limite_recomposicion }, monetaryState, trial);
      const viable = restored.monto_cubierto === item.monto_desplazado_ves && restored.tramos.every(t => t.eta && Date.parse(t.eta) <= Date.parse(item.fecha_hora_limite_recomposicion));
      recompositions.push({ ...item, estado_recomposicion: viable ? 'VIABLE' : 'NO_VIABLE',
        monto_recompuesto: restored.monto_cubierto, residual_recomposicion: restored.residual_no_cubierto,
        rutas_recomposicion: restored.tramos, restricciones: constraints(restored),
        eta_maxima: restored.tramos.length ? restored.tramos.map(t => t.eta).filter(Boolean).sort().at(-1) ?? null : null,
        explicacion: viable ? 'COBERTURA_COMPLETA_SOBRE_CAPACIDAD_REMANENTE' : 'RECOMPOSICION_INCOMPLETA_O_FUERA_DE_PLAZO' });
    }
    check(recompositions.every(r => r.estado_recomposicion === 'VIABLE'), 'FX_RECOMPOSITION_NOT_VIABLE');
    result.aceptable = true;
    return { result, recompositions, trial, extra };
  } catch (error) { result.errors.push({ code: error.code ?? 'INVALID_FX_EXCEPTION' }); return { result, recompositions }; }
}
function evaluateFx(state, fx, context, monetaryState, sim) {
  const output = emptyResult(fx);
  const owner = sim.companies.find(c => c.empresa === fx.empresa);
  const located = owner.posture.afectaciones.find(a => a.affectation_id === fx.affectation_id);
  const hasAccounts = (owner.config?.orden_cuentas_por_banco[fx.banco_negociador]?.length ?? 0) > 0;
  output.monto_localizado_banco_negociador = hasAccounts ? (located?.asignaciones ?? []).filter(a => a.banco === fx.banco_negociador).reduce((s, a) => s + a.monto_asignado, 0) : 0;
  output.monto_localizado_otros_bancos_propios = (located?.asignaciones ?? []).filter(a => a.banco !== fx.banco_negociador).reduce((s, a) => s + a.monto_asignado, 0);
  output.capacidad_fisica_libre_propia = owner.posture.cuentas.filter(a => a.elegible && a.publicable).reduce((s, a) => s + a.capacidad_restante_postura, 0);
  if (!fx.calendario.settlement_permitido) {
    output.estado = 'BLOQUEADA_POR_RESTRICCION'; output.restricciones = [{ rule_id: 'FX_BANK_T1_NOT_ALLOWED', impacto: 'BLOQUEO' }]; return output;
  }
  const coverage = buildCoverageRequest(state, request(fx, fx.equivalente_ves), routeContext(fx, context), monetaryState, sim);
  output.rutas = [...coverage.tramos]; output.restricciones = constraints(coverage);
  output.publicable = coverage.publicable !== false;
  output.errors = coverage.errors;
  output.monto_cubierto_total = coverage.monto_cubierto; output.gap_fx = fx.equivalente_ves - coverage.monto_cubierto;
  output.estado = output.gap_fx === 0 ? 'COBERTURA_COMPLETA' : output.monto_cubierto_total > 0 ? 'COBERTURA_PARCIAL'
    : output.restricciones.some(r => r.impacto === 'BLOQUEO') ? 'BLOQUEADA_POR_RESTRICCION' : 'SIN_COBERTURA';
  const proposal = context.excepcion_temporal;
  if (proposal && output.gap_fx > 0) {
    const checked = exception(state, fx, proposal, context, monetaryState, sim, output.gap_fx);
    output.excepcion_temporal = checked.result; output.recomposicion = checked.recompositions;
    if (checked.result.aceptable) {
      Object.assign(sim, checked.trial); output.rutas.push(...checked.extra.tramos);
      output.restricciones.push(...constraints(checked.extra));
      output.monto_cubierto_total += checked.extra.monto_cubierto; output.gap_fx = 0;
      output.estado = 'PENDIENTE_APROBACION_EXCEPCION';
    } else output.estado = 'BLOQUEADA_POR_RESTRICCION';
  }
  output.monto_cobertura_intercompany = output.rutas.filter(r => r.nivel_cobertura >= 3).reduce((sum, r) => sum + r.monto_propuesto_ves, 0);
  output.explicacion = ['MISMA_OBLIGACION_ECONOMICA', 'JERARQUIA_CODEX_006', 'HORA_CRITICA_GOBIERNA_RUTAS', 'SIN_EJECUCION'];
  return output;
}
function build(state, records, context, monetaryState) {
  timestamp(context.fecha_hora_evaluacion);
  check(['T0', 'T1'].includes(context.settlement), 'INVALID_SETTLEMENT');
  const validated = records.map(record => {
    try {
      const destination = context.por_fx?.[record.fx_id]?.cuenta_destino_fx ?? context.cuenta_destino_fx ?? record.cuenta_destino_fx;
      const configured = { ...record, ...(destination === undefined ? {} : { cuenta_destino_fx: destination }) };
      validateDestination(state, configured); return current(state, configured, monetaryState);
    } catch (error) { return { ...record, publicable: false, errors: [{ code: error.code ?? 'INVALID_FX' }] }; }
  }).sort((a, b) => rank(rigidities, a.rigidez_temporal) - rank(rigidities, b.rigidez_temporal)
    || Date.parse(a.fecha_hora_critica) - Date.parse(b.fecha_hora_critica)
    || rank(priorities, a.prioridad_economica) - rank(priorities, b.prioridad_economica)
    || Date.parse(a.fecha_hora_evento) - Date.parse(b.fecha_hora_evento) || compare(a.fx_id, b.fx_id));
  const sim = createCoverageSimulation(state, monetaryState);
  for (const fx of validated) if (fx.publicable) releaseCoverageAllocation(sim, fx.affectation_id);
  return validated.map(fx => {
    if (!fx.publicable) return { ...emptyResult(fx), equivalente_ves: null, gap_fx: null, estado: 'BLOQUEADA_POR_RESTRICCION' };
    return evaluateFx(state, fx, { ...context, ...(context.por_fx?.[fx.fx_id] ?? {}) }, monetaryState, sim);
  });
}
export function buildFxPlan(state, fx_id, context, monetaryState) {
  const fx = (state.fxObligations ?? []).find(f => f.fx_id === fx_id); check(fx, 'UNKNOWN_FX_REFERENCE');
  return freeze(build(state, [fx], context, monetaryState)[0]);
}
export function buildFxReport(state, context, monetaryState) {
  const planes = build(state, state.fxObligations ?? [], context, monetaryState);
  return freeze({ fecha_hora_evaluacion: context.fecha_hora_evaluacion, planes,
    publicable: planes.every(p => p.publicable), monto_cubierto_total: planes.reduce((s, p) => s + p.monto_cubierto_total, 0),
    gap_fx: planes.some(p => p.gap_fx === null) ? null : planes.reduce((s, p) => s + p.gap_fx, 0) });
}
