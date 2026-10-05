import { createMoney, convertMoney } from './money.js';
import { calculateCompanyPosition } from './position.js';
import { buildPosture } from './posture.js';
import { evaluateAssignmentRoute, evaluateAffectationRoute } from './bank-restrictions.js';

export class CoverageError extends Error {
  constructor(code) { super(code); this.name = 'CoverageError'; this.code = code; }
}
const requireValue = (ok, code) => { if (!ok) throw new CoverageError(code); };
const text = value => typeof value === 'string' && value.trim().length > 0;
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
function policyChange(state, row, request_id, operation) {
  requireValue(text(request_id), 'INVALID_IDEMPOTENCY_KEY');
  const payload = JSON.stringify(canonical({ kind: operation, rows: [row] }));
  const receipt = state.receipts.find(r => r.scope === 'request_id' && r.id === request_id);
  if (receipt) { requireValue(receipt.payload === payload, 'IDEMPOTENCY_CONFLICT'); return state; }
  requireValue(state.catalogue.empresas.includes(row.empresa), 'INVALID_COMPANY');
  requireValue(text(row.origen), 'INVALID_ORIGIN');
  requireValue(row.usuario === undefined || text(row.usuario), 'INVALID_USER');
  timestamp(row.fecha_hora_evento);
  const setting = operation === 'SET_COVERAGE_POLICY';
  if (setting) requireValue(typeof row.buffer_operativo_ves === 'number' && Number.isFinite(row.buffer_operativo_ves)
    && row.buffer_operativo_ves >= 0, 'INVALID_COVERAGE_BUFFER');
  const next = structuredClone(state); next.coveragePolicies ??= [];
  const index = next.coveragePolicies.findIndex(p => p.empresa === row.empresa);
  const before = index < 0 ? null : next.coveragePolicies.splice(index, 1)[0];
  const after = setting ? { empresa: row.empresa, buffer_operativo_ves: row.buffer_operativo_ves } : null;
  if (after) next.coveragePolicies.push(after);
  next.events.push({ kind: 'COVERAGE_POLICY', operacion: operation, empresa: row.empresa,
    antes: before, despues: after, origen: row.origen, fecha_hora_evento: row.fecha_hora_evento,
    ...(row.usuario === undefined ? {} : { usuario: row.usuario }), request_id });
  next.receipts.push({ scope: 'request_id', id: request_id, payload });
  return freeze(next);
}
export const setCoveragePolicy = (state, row, request_id) => policyChange(state, row, request_id, 'SET_COVERAGE_POLICY');
export const clearCoveragePolicy = (state, row, request_id) => policyChange(state, row, request_id, 'CLEAR_COVERAGE_POLICY');

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const hierarchy = ['MISMA_EMPRESA_MISMO_BANCO', 'MISMA_EMPRESA_OTRO_BANCO', 'OTRA_EMPRESA_MISMO_BANCO', 'OTRA_EMPRESA_OTRO_BANCO'];
function validateContext(context) {
  timestamp(context.fecha_hora_evaluacion);
  requireValue(text(context.zona_horaria), 'TIME_ZONE_REQUIRED');
  try { new Intl.DateTimeFormat('en', { timeZone: context.zona_horaria }); }
  catch { throw new CoverageError('INVALID_TIME_ZONE'); }
  requireValue(['T0', 'T1'].includes(context.settlement), 'INVALID_SETTLEMENT');
  if (context.tipo_ruta !== undefined) requireValue(['INTRABANCO', 'INTERBANCO'].includes(context.tipo_ruta), 'INVALID_ROUTE_TYPE');
  if (context.fecha_hora_objetivo != null) timestamp(context.fecha_hora_objetivo);
}
function simulation(state, monetaryState) {
  const companies = state.catalogue.empresas.map(empresa => {
    const position = calculateCompanyPosition(state, empresa, monetaryState);
    const posture = buildPosture(state, empresa, monetaryState);
    const buffer = (state.coveragePolicies ?? []).find(p => p.empresa === empresa)?.buffer_operativo_ves ?? 0;
    return { empresa, position, posture, buffer, available: position.saldo_disponible_gestion,
      config: (state.postureConfigs ?? []).find(p => p.empresa === empresa),
      accounts: new Map(posture.cuentas.map(a => [a.cuenta, { ...a }])) };
  });
  // Only this private copy records proposed banking consumption; no official events/reservations.
  const bankState = { ...state, bankCapacityReservations: structuredClone(state.bankCapacityReservations ?? []) };
  return { companies, bankState };
}
const capacity = company => company.position.publicable ? Math.max(0, company.available - company.buffer) : 0;
function destination(state, affectation, context) {
  const bank = affectation.banco_asignado ?? context.banco_destino;
  requireValue(text(bank), 'DESTINATION_BANK_REQUIRED');
  requireValue(state.catalogue.bancos.includes(bank), 'INVALID_BANK');
  if (affectation.banco_asignado && context.banco_destino !== undefined)
    requireValue(context.banco_destino === affectation.banco_asignado, 'DESTINATION_BANK_MISMATCH');
  if (context.cuenta_destino !== undefined) {
    const account = state.catalogue.cuentas.find(a => a.cuenta === context.cuenta_destino);
    requireValue(account && account.empresa === affectation.empresa && account.banco === bank, 'INVALID_DESTINATION_ACCOUNT');
  }
  return bank;
}
function operationCurrency(state, account, context) {
  const catalogue = state.catalogue.cuentas.find(a => a.cuenta === account.cuenta);
  const explicit = context.moneda_operacion_por_cuenta?.[account.cuenta] ?? context.moneda_operacion;
  const currency = explicit ?? (catalogue.monedas.length === 1 ? catalogue.monedas[0] : undefined);
  requireValue(text(currency), 'OPERATION_CURRENCY_REQUIRED');
  requireValue(catalogue.monedas.includes(currency), 'ACCOUNT_CURRENCY_MISMATCH');
  return currency;
}
function bankingContext(state, account, context, bank, deadline) {
  return { fecha_hora_evaluacion: context.fecha_hora_evaluacion, zona_horaria: context.zona_horaria,
    settlement: context.settlement, empresa: account.empresa,
    tipo_ruta: account.banco === bank ? 'INTRABANCO' : 'INTERBANCO',
    moneda_operacion: operationCurrency(state, account, context),
    fecha_hora_objetivo: deadline };
}
function evaluateCandidate(bankState, account, amount, ctx, monetaryState) {
  const evaluate = value => evaluateAssignmentRoute(bankState, { banco: account.banco, cuenta: account.cuenta,
    moneda: 'VES', monto_asignado: value }, ctx, monetaryState);
  let result = evaluate(amount);
  if (result.resultado !== 'BLOQUEADA') return { amount, result };
  const blocked = result.explicaciones.filter(e => e.impacto === 'BLOQUEO');
  if (blocked.some(e => !['DAILY_AMOUNT_LIMIT', 'DAILY_OPERATION_LIMIT'].includes(e.rule_id))) return { amount: 0, result };
  let allowed = result.monto_propuesto;
  for (const explanation of blocked) {
    const observed = explanation.valor_observado;
    const remaining = Math.max(0, explanation.valor_configurado - observed.usado - observed.reservado - observed.propuesto_previo);
    if (explanation.rule_id === 'DAILY_AMOUNT_LIMIT') allowed = Math.min(allowed, remaining);
    else if (remaining === 0) allowed = 0;
    else if (result.reglas_efectivas.max_por_operacion)
      allowed = Math.min(allowed, remaining * result.reglas_efectivas.max_por_operacion.value);
  }
  if (allowed <= 0) return { amount: 0, result };
  const reduced = Math.min(amount, convertMoney(createMoney(allowed, result.moneda), 'VES', monetaryState).amount);
  if (reduced >= amount) return { amount: 0, result };
  // CODEX-005 remains the authority after reducing the proposed amount.
  result = evaluate(reduced);
  return { amount: result.resultado === 'BLOQUEADA' ? 0 : reduced, result };
}
function consumeBankCapacity(sim, evaluation) {
  sim.bankState.bankCapacityReservations.push({ banco: evaluation.banco, empresa: evaluation.empresa, cuenta: evaluation.cuenta,
    moneda: evaluation.moneda, fecha: evaluation.fecha, monto: evaluation.monto_propuesto,
    operaciones: evaluation.operaciones_requeridas, estado: 'ACTIVA' });
}
function recordProposal(sim, company, account, amount, evaluation) {
  company.available -= amount;
  account.capacidad_restante_postura -= amount;
  consumeBankCapacity(sim, evaluation);
}
function plan(state, affectation_id, context, monetaryState, sim) {
  validateContext(context);
  const affectation = state.affectations.find(a => a.affectation_id === affectation_id);
  requireValue(affectation, 'UNKNOWN_AFFECTATION_REFERENCE');
  const owner = sim.companies.find(c => c.empresa === affectation.empresa);
  const localized = owner.posture.afectaciones.find(a => a.affectation_id === affectation_id);
  const base = { affectation_id, empresa_destino: affectation.empresa, moneda: 'VES',
    monto_necesario: 0, monto_cubierto: 0, residual_no_cubierto: 0, estado: 'SIN_NECESIDAD_DE_COBERTURA',
    tramos: [], fuentes_descartadas: [], explicacion_jerarquia: hierarchy.map((motivo, i) => ({ nivel: i + 1, motivo })), errors: [] };
  if (!localized) return base;
  if (localized.monto_no_localizado === null || !owner.position.publicable) {
    return { ...base, monto_necesario: null, residual_no_cubierto: null, estado: 'SIN_COBERTURA', publicable: false,
      errors: [...owner.position.errors, ...localized.errors] };
  }
  const bank = destination(state, affectation, context);
  base.banco_destino = bank;
  const linked = (state.needs ?? []).find(n => n.affectation_id === affectation_id && n.estado === 'ACTIVA');
  const deadline = linked?.fecha_hora_objetivo ?? context.fecha_hora_objetivo;
  let blockedAmount = 0;
  const perAccount = {};
  for (const assignment of localized.asignaciones) {
    const account = owner.accounts.get(assignment.cuenta);
    try { perAccount[assignment.cuenta] = bankingContext(state, account, context, bank, deadline); }
    catch (error) { base.errors.push({ code: error.code, cuenta: assignment.cuenta }); }
  }
  if (base.errors.length) return { ...base, estado: 'SIN_COBERTURA', publicable: false, monto_necesario: null, residual_no_cubierto: null };
  const localEvaluation = evaluateAffectationRoute(sim.bankState, localized,
    { ...context, tipo_ruta: context.tipo_ruta ?? 'INTRABANCO', por_cuenta: perAccount }, monetaryState);
  for (const evaluated of localEvaluation.asignaciones) if (evaluated.resultado === 'BLOQUEADA') {
    const original = localized.asignaciones.find(a => a.cuenta === evaluated.cuenta);
    blockedAmount += original.monto_asignado;
  } else consumeBankCapacity(sim, evaluated);
  base.evaluacion_localizacion = localEvaluation;
  let remaining = localized.monto_no_localizado + blockedAmount;
  base.monto_necesario = remaining;
  if (remaining === 0) return base;
  const discard = (company, account, motivo, detail = {}) => base.fuentes_descartadas.push({ empresa_fuente: company.empresa,
    ...(account ? { banco_fuente: account.banco, cuenta_fuente: account.cuenta } : {}), motivo, ...detail });
  for (let level = 1; level <= 4 && remaining > 0; level++) {
    const companies = sim.companies.filter(c => (c.empresa === owner.empresa) === (level <= 2))
      .sort((a, b) => capacity(b) - capacity(a) || compare(a.empresa, b.empresa));
    for (const company of companies) {
      if (remaining <= 0) break;
      if (!company.position.publicable) {
        discard(company, null, company.position.errors[0]?.code ?? 'POSITION_NOT_PUBLISHABLE'); continue;
      }
      if (capacity(company) <= 0) { discard(company, null, 'NO_CEDIBLE_CAPACITY'); continue; }
      if (!company.config) { discard(company, null, 'NO_POSTURE_CONFIG'); continue; }
      const sameBank = level === 1 || level === 3;
      const banks = sameBank ? [bank] : company.config.orden_bancos.filter(b => b !== bank);
      for (const sourceBank of banks) {
        const ids = company.config.orden_cuentas_por_banco[sourceBank] ?? [];
        if (!ids.length) discard(company, null, 'NO_CONFIGURED_ACCOUNT_ORDER', { banco_fuente: sourceBank });
        for (const id of ids) {
          if (remaining <= 0 || capacity(company) <= 0) break;
          const account = company.accounts.get(id);
          if (id === context.cuenta_destino) {
            discard(company, account, 'SAME_ACCOUNT_REQUIRES_LOCALIZATION', { capacidad_localizable_ves: account.capacidad_restante_postura }); continue;
          }
          if (!account.publicable || !account.elegible || account.capacidad_restante_postura <= 0) {
            discard(company, account, account.motivo_no_elegible ?? 'PHYSICAL_CAPACITY_EXHAUSTED'); continue;
          }
          const requested = Math.min(remaining, capacity(company), account.capacidad_restante_postura);
          let evaluated;
          try {
            const ctx = bankingContext(state, account, context, bank, deadline);
            evaluated = evaluateCandidate(sim.bankState, account, requested, ctx, monetaryState);
          } catch (error) { discard(company, account, error.code ?? 'INVALID_ROUTE'); continue; }
          if (evaluated.amount === 0) {
            discard(company, account, 'BANK_ROUTE_BLOCKED', { evaluacion: evaluated.result }); continue;
          }
          const amount = evaluated.amount; const before = company.available; const physical = account.capacidad_restante_postura;
          requireValue(before - amount >= company.buffer, 'SOURCE_BUFFER_VIOLATION');
          recordProposal(sim, company, account, amount, evaluated.result);
          remaining -= amount;
          base.tramos.push({ nivel_cobertura: level, empresa_fuente: company.empresa, banco_fuente: sourceBank,
            cuenta_fuente: id, empresa_destino: owner.empresa, banco_destino: bank,
            ...(context.cuenta_destino ? { cuenta_destino: context.cuenta_destino } : {}), affectation_id,
            monto_propuesto_ves: amount, saldo_fuente_antes: before, saldo_fuente_despues: company.available,
            buffer_fuente: company.buffer, capacidad_fisica_antes: physical, capacidad_fisica_despues: account.capacidad_restante_postura,
            viabilidad_bancaria: evaluated.result.resultado, restricciones: evaluated.result.explicaciones,
            acciones_requeridas: evaluated.result.acciones_requeridas, operaciones_requeridas: evaluated.result.operaciones_requeridas,
            operaciones_bancarias: evaluated.result.tramos, moneda_operacion: evaluated.result.moneda,
            monto_operacion: evaluated.result.monto_propuesto, eta: evaluated.result.eta, motivo_seleccion: hierarchy[level - 1] });
          if (amount < requested) discard(company, account, 'BANK_CAPACITY_PARTIALLY_AVAILABLE', { monto_no_utilizable_ves: requested - amount, evaluacion: evaluated.result });
        }
      }
    }
  }
  base.monto_cubierto = base.monto_necesario - remaining;
  base.residual_no_cubierto = remaining;
  base.estado = remaining === 0 ? 'COBERTURA_TOTAL' : base.monto_cubierto > 0 ? 'COBERTURA_PARCIAL' : 'SIN_COBERTURA';
  return base;
}
export function buildCoveragePlan(state, affectation_id, context, monetaryState) {
  validateContext(context);
  return freeze(plan(state, affectation_id, context, monetaryState, simulation(state, monetaryState)));
}
export function buildCoverageReport(state, empresa, context, monetaryState) {
  validateContext(context); requireValue(state.catalogue.empresas.includes(empresa), 'INVALID_COMPANY');
  const sim = simulation(state, monetaryState);
  const owner = sim.companies.find(c => c.empresa === empresa);
  const plans = owner.posture.afectaciones.map(a => plan(state, a.affectation_id,
    { ...context, ...(context.por_afectacion?.[a.affectation_id] ?? {}) }, monetaryState, sim));
  return freeze({ empresa, fecha_hora_evaluacion: context.fecha_hora_evaluacion, zona_horaria: context.zona_horaria,
    planes: plans, publicable: plans.every(p => p.publicable !== false),
    monto_cubierto: plans.reduce((sum, p) => sum + p.monto_cubierto, 0),
    residual_no_cubierto: plans.some(p => p.residual_no_cubierto === null) ? null : plans.reduce((sum, p) => sum + p.residual_no_cubierto, 0),
    criterios_orden: owner.posture.criterios_orden });
}
