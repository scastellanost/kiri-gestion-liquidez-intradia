import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/state.js';
import { createPositionState, registerBalance, registerAffectation, calculateCompanyPosition } from '../src/position.js';
import { createNeed, saveNeedState, loadNeedState } from '../src/needs.js';
import { setPostureConfig, buildPosture } from '../src/posture.js';
import { setBankRestriction } from '../src/bank-restrictions.js';
import { setCoveragePolicy, buildCoveragePlan } from '../src/coverage.js';
import { setFxObligation, buildFxPlan } from '../src/fx.js';
import { createMandate, submitMandate, approveMandate, rejectMandate, cancelMandate, expireMandate, buildMandateView, buildMandateReport } from '../src/mandates.js';

const trace = { origen: 'QA-009', usuario: 'tesoreria', fecha_hora_evento: '2026-10-08T09:00:00-04:00' };
const money = createState({ managedDate: '2026-10-08', rates: { VES_USD_BCV: { value: 10, source: 'BCV', timestamp: trace.fecha_hora_evento } } });
const context = { fecha_hora_evaluacion: trace.fecha_hora_evento, zona_horaria: 'America/Caracas', settlement: 'T0' };
const deadline = '2026-10-08T16:00:00-04:00';
const ids = ['EA1', 'EB1', 'FA1'];
function obligation(state, id = 'OB', amount = 20, bank = 'A') {
  return registerAffectation(state, { affectation_id: id, empresa: 'E', banco_asignado: bank, tipo_partida: 'PAGO',
    naturaleza_afectacion: 'COMPROMISO', amount_original: amount, currency_original: 'VES', operacion: 'ALTA', ...trace }, `aff-${id}`);
}
function balance(state, cuenta, amount, date = trace.fecha_hora_evento) {
  return registerBalance(state, { cuenta, empresa: cuenta[0], banco: cuenta[1], amount_original: amount, currency_original: 'VES',
    ...trace, fecha_hora_evento: date, fecha_hora_saldo: date }, `balance-${state.events.length}`);
}
function fixture(values = { EA1: 100, FA1: 100 }, bank = 'A') {
  let s = createPositionState({ empresas: ['E', 'F'], bancos: ['A', 'B'], cuentas: ids.map(cuenta => ({ cuenta, empresa: cuenta[0], banco: cuenta[1], monedas: ['VES'] })) });
  for (const [id, amount] of Object.entries(values)) s = balance(s, id, amount);
  for (const empresa of ['E', 'F']) s = setPostureConfig(s, { empresa, orden_bancos: ['A', 'B'],
    orden_cuentas_por_banco: { A: ids.filter(id => id[0] === empresa && id[1] === 'A'), B: ids.filter(id => id[0] === empresa && id[1] === 'B') }, ...trace }, `posture-${empresa}`);
  for (const banco of ['A', 'B']) s = setBankRestriction(s, { banco, reglas: { minutos_acreditacion: 0 }, ...trace }, `rule-${banco}`);
  return obligation(s, 'OB', 20, bank);
}
const tramo = (extra = {}) => ({ empresa_fuente: 'E', banco_fuente: 'A', cuenta_fuente: 'EA1', empresa_destino: 'E', banco_destino: 'A',
  monto_ves: 20, moneda_operacion: 'VES', monto_operacion: 20, settlement: 'T0', fecha_hora_objetivo: deadline, ...extra });
const row = (extra = {}) => ({ mandate_id: 'M', affectation_id: 'OB', empresa_destino: 'E', origen_funcional: 'MANUAL', motivo: 'Decision de tesoreria',
  fecha_hora_limite: deadline, tramos: [tramo()], contexto: context, ...trace, ...extra });
const create = (s, extra = {}) => createMandate(s, row(extra), `create-${extra.mandate_id ?? 'M'}`, money);
const submit = (s, id = 'M') => submitMandate(s, { mandate_id: id, ...trace }, `submit-${id}`);
const approval = (extra = {}) => ({ mandate_id: 'M', ...trace, aprobador: 'aprobador-explicito', fecha_hora_aprobacion: '2026-10-08T10:00:00-04:00', contexto: context, ...extra });
const approve = (s, extra = {}) => approveMandate(s, approval(extra), `approve-${extra.mandate_id ?? 'M'}`, money);
const pending = (s = fixture(), extra = {}) => submit(create(s, extra), extra.mandate_id ?? 'M');
const view = s => buildMandateView(s, 'M');
const cancel = s => cancelMandate(s, { mandate_id: 'M', ...trace, motivo: 'Cancelacion explicita' }, 'cancel');
const expire = s => expireMandate(s, { mandate_id: 'M', ...trace, fecha_hora_evento: '2026-10-08T17:00:00-04:00' }, 'expire');
const reject = s => rejectMandate(s, { mandate_id: 'M', ...trace, motivo: 'No autorizado' }, 'reject');
const rule = (s, reglas) => setBankRestriction(s, { banco: 'A', reglas, ...trace }, `rule-${s.events.length}`);
function pair(amount = 25) {
  let s = obligation(fixture({ FA1: amount }), 'OB2');
  s = pending(s, { tramos: [tramo({ empresa_fuente: 'F', cuenta_fuente: 'FA1' })] });
  return pending(s, { mandate_id: 'M2', affectation_id: 'OB2', tramos: [tramo({ empresa_fuente: 'F', cuenta_fuente: 'FA1', monto_ves: 10, monto_operacion: 10 })] });
}
function fxFixture() {
  let s = fixture(); s = setFxObligation(s, { fx_id: 'FX', affectation_id: 'OB', banco_negociador: 'A', moneda_objetivo: 'USD', monto_divisa: 2,
    fecha_hora_negociacion: trace.fecha_hora_evento, fecha_hora_critica: deadline, zona_horaria: context.zona_horaria, ...trace }, 'fx', money);
  const plan = buildFxPlan(s, 'FX', context, money);
  const instructions = plan.rutas.map(t => tramo({ ...t, monto_ves: t.monto_propuesto_ves }));
  return { s, plan, instructions };
}
test('QA-MND01 - Crear manual con afectacion valida', () => { assert.equal(view(create(fixture())).estado, 'BORRADOR'); });
test('QA-MND02 - Afectacion inexistente rechazada', () => { assert.throws(() => create(fixture(), { affectation_id: 'missing' }), { code: 'UNKNOWN_AFFECTATION_REFERENCE' }); });
test('QA-MND03 - No crea afectacion ni necesidad', () => { const s = fixture(); const n = create(s); assert.deepEqual(n.affectations, s.affectations); assert.deepEqual(n.needs, s.needs); });
test('QA-MND04 - Uno o varios tramos validos y montos positivos', () => {
  const s = create(fixture(), { tramos: [tramo({ monto_ves: 10, monto_operacion: 10 }), tramo({ monto_ves: 10, monto_operacion: 10 })] }); assert.equal(view(s).tramos.length, 2);
  assert.throws(() => create(fixture(), { tramos: [] }), { code: 'MANDATE_INSTRUCTIONS_REQUIRED' });
  assert.throws(() => create(fixture(), { tramos: [tramo({ monto_ves: 0 })] }), { code: 'INVALID_MANDATE_AMOUNT' });
});
test('QA-MND05 - Total no supera pendiente', () => { assert.throws(() => create(fixture(), { tramos: [tramo({ monto_ves: 21, monto_operacion: 21 })] }), { code: 'MANDATE_EXCEEDS_PENDING_AMOUNT' }); });
test('QA-MND06 - Borrador no reserva', () => { const s = create(fixture()); assert.deepEqual(view(s).capacidad_fisica_reservada, []); assert.equal(s.bankCapacityReservations, undefined); });
test('QA-MND07 - Submit deja pendiente sin reservas', () => { const s = pending(); assert.equal(view(s).estado, 'PENDIENTE_APROBACION'); assert.equal(s.bankCapacityReservations, undefined); });
test('QA-MND08 - Aprobacion revalida activa', () => {
  const s = registerAffectation(pending(), { affectation_id: 'OB', operacion: 'ANULACION', monto_anulado: 20, ...trace }, 'annul');
  assert.throws(() => approve(s), { code: 'AFFECTATION_NOT_ACTIVE' });
});
test('QA-MND09 - Aprobacion revalida pendiente', () => {
  const s = registerAffectation(pending(), { affectation_id: 'OB', operacion: 'AJUSTE', monto_vigente: 10, ...trace }, 'adjust');
  assert.throws(() => approve(s), { code: 'MANDATE_EXCEEDS_PENDING_AMOUNT' });
});
test('QA-MND10 - Aprobacion revalida capacidad fisica', () => {
  const s = balance(pending(), 'EA1', 10, '2026-10-08T09:30:00-04:00'); assert.throws(() => approve(s), { code: 'INSUFFICIENT_PHYSICAL_CAPACITY' });
});
test('QA-MND11 - Buffer intercompany se revalida', () => {
  let s = pending(fixture(), { tramos: [tramo({ empresa_fuente: 'F', cuenta_fuente: 'FA1' })] });
  s = setCoveragePolicy(s, { empresa: 'F', buffer_operativo_ves: 90, ...trace }, 'buffer'); assert.throws(() => approve(s), { code: 'SOURCE_BUFFER_VIOLATION' });
});
test('QA-MND12 - Restricciones vigentes se revalidan', () => { assert.throws(() => approve(rule(pending(), { cutoff: '09:30', minutos_acreditacion: 0 })), { code: 'AFTER_CUTOFF' }); });
test('QA-MND13 - ETA posterior bloquea', () => { assert.throws(() => approve(rule(pending(), { minutos_acreditacion: 400 })), { code: 'ACCREDITATION_DEADLINE' }); });
test('QA-MND14 - Aprobacion adicional obligatoria', () => { assert.throws(() => approve(rule(pending(), { requiere_aprobacion_adicional: true, minutos_acreditacion: 0 })), { code: 'BANK_ADDITIONAL_APPROVAL_REQUIRED' }); });
test('QA-MND15 - Aprobacion adicional explicita permite aprobar', () => {
  const s = approve(rule(pending(), { requiere_aprobacion_adicional: true, minutos_acreditacion: 0 }), { contexto: { ...context, aprobacion_bancaria_adicional: true } }); assert.equal(view(s).estado, 'APROBADO');
});
test('QA-MND16 - Aprobado reserva banco sin uso ejecutado', () => { const s = approve(pending()); assert.equal(s.bankCapacityReservations[0].monto, 20); assert.equal(s.bankUsage, undefined); });
test('QA-MND17 - Aprobado reserva fisicamente', () => { assert.equal(view(approve(pending())).capacidad_fisica_reservada[0].monto_ves, 20); });
test('QA-MND18 - Segundo mandato no duplica saldo fisico', () => {
  const reserved = approve(pair()); const before = structuredClone(reserved);
  assert.throws(() => approve(reserved, { mandate_id: 'M2' }), { code: 'INSUFFICIENT_PHYSICAL_CAPACITY' }); assert.deepEqual(reserved, before);
  const partial = { tramos: [tramo({ monto_ves: 10, monto_operacion: 10 })] };
  let s = pending(fixture({ EA1: 20 }), partial); s = pending(s, { ...partial, mandate_id: 'M2' });
  s = pending(s, { ...partial, mandate_id: 'M3' });
  s = approve(approve(s), { mandate_id: 'M2' }); assert.equal(s.mandates.filter(m => m.estado === 'APROBADO').length, 2);
  assert.throws(() => approve(s, { mandate_id: 'M3' }), { code: 'BLOCKED_BY_FUNCTIONAL_RULE' });
});
test('QA-MND19 - Segundo mandato respeta banco reservado', () => {
  const s = approve(rule(pair(100), { max_diario: 25, minutos_acreditacion: 0 })); assert.throws(() => approve(s, { mandate_id: 'M2' }), { code: 'DAILY_AMOUNT_LIMIT' });
});
test('QA-MND20 - Cancelar aprobado libera ambas capacidades', () => {
  const s = cancel(approve(pair())); assert.equal(view(s).estado, 'CANCELADO'); assert.deepEqual(view(s).capacidad_fisica_reservada, []);
  assert.equal(s.bankCapacityReservations[0].estado, 'LIBERADA'); assert.equal(buildMandateView(approve(s, { mandate_id: 'M2' }), 'M2').estado, 'APROBADO');
});
test('QA-MND21 - Expirar aprobado libera reservas', () => {
  const s = expire(approve(pending())); assert.equal(view(s).estado, 'EXPIRADO'); assert.equal(s.bankCapacityReservations[0].estado, 'LIBERADA'); assert.deepEqual(view(s).capacidad_fisica_reservada, []);
});
test('QA-MND22 - Rechazar no reserva capacidad', () => { const s = reject(pending()); assert.equal(view(s).estado, 'RECHAZADO'); assert.equal(s.bankCapacityReservations, undefined); });
test('QA-MND23 - Rechazado no reabrible', () => { assert.throws(() => approve(reject(pending())), { code: 'INVALID_MANDATE_TRANSITION' }); });
test('QA-MND24 - Cancelado no reabrible', () => { assert.throws(() => submitMandate(cancel(pending()), { mandate_id: 'M', ...trace }, 'resubmit'), { code: 'INVALID_MANDATE_TRANSITION' }); });
test('QA-MND25 - Expirado no reabrible ni aprobable fuera de plazo', () => {
  assert.throws(() => approve(expire(pending())), { code: 'INVALID_MANDATE_TRANSITION' });
  assert.throws(() => approve(pending(), { fecha_hora_aprobacion: '2026-10-08T17:00:00-04:00' }), { code: 'MANDATE_EXPIRED' });
});
test('QA-MND26 - Aprobado inmutable', () => {
  const s = approve(pending()); assert.ok(Object.isFrozen(s.mandates[0].tramos));
  assert.throws(() => cancelMandate(s, { mandate_id: 'M', motivo: 'cambio', tramos: [], ...trace }, 'edit'), { code: 'IMMUTABLE_MANDATE_INSTRUCTION' });
});
test('QA-MND27 - Cambio exige nuevo ID', () => {
  const s = cancel(approve(pending())); assert.throws(() => createMandate(s, row({ motivo: 'otra decision' }), 'new-decision', money), { code: 'INVALID_OR_DUPLICATE_MANDATE_ID' });
  assert.equal(buildMandateView(create(s, { mandate_id: 'NEW' }), 'NEW').estado, 'BORRADOR');
});
test('QA-MND28 - Coverage conserva instantanea de evidencia', () => {
  const s = fixture({ FA1: 100 }); const plan = buildCoveragePlan(s, 'OB', context, money);
  const tramos = plan.tramos.map(t => tramo({ ...t, monto_ves: t.monto_propuesto_ves })); const next = create(s, { origen_funcional: 'COVERAGE_PLAN', plan, tramos });
  assert.deepEqual(view(next).evidencia_plan, plan); assert.notStrictEqual(next.mandates[0].evidencia_plan, plan);
});
test('QA-MND29 - FX conserva identidad fecha valor y hora critica', () => {
  const { s, plan, instructions } = fxFixture(); const next = create(s, { origen_funcional: 'FX_PLAN', plan, tramos: instructions });
  for (const k of ['fx_id', 'banco_negociador', 'fecha_valor', 'fecha_hora_critica']) assert.equal(view(next)[k], plan[k]);
});
test('QA-MND30 - Excepcion FX no autorizada impide aprobar', () => {
  let s = fixture({ EA1: 20, EB1: 20 }, 'B');
  s = createNeed(s, { need_id: 'N-OB', affectation_id: 'OB', prioridad_economica: 'P2_ALTA', rigidez_temporal: 'R1_HORA_RIGIDA', fecha_hora_objetivo: deadline, ...trace }, 'need-ob');
  s = obligation(s, 'OTHER', 20);
  s = createNeed(s, { need_id: 'N-OTHER', affectation_id: 'OTHER', prioridad_economica: 'P1_CRITICA', rigidez_temporal: 'R4_FLEXIBLE', fecha_hora_objetivo: deadline, ...trace }, 'need-other');
  s = setBankRestriction(s, { banco: 'B', reglas: { hora_inicio: '14:00', minutos_acreditacion: 0 }, ...trace }, 'opening');
  s = setFxObligation(s, { fx_id: 'FX', affectation_id: 'OB', banco_negociador: 'A', moneda_objetivo: 'USD', monto_divisa: 2,
    fecha_hora_negociacion: trace.fecha_hora_evento, fecha_hora_critica: '2026-10-08T11:00:00-04:00', zona_horaria: context.zona_horaria, ...trace }, 'fx-exception', money);
  const ctx = { ...context, excepcion_temporal: { motivo: 'Hora critica anterior', desplazadas: [{ need_id_desplazada: 'N-OTHER', monto_desplazado_ves: 20 }] } };
  const plan = buildFxPlan(s, 'FX', ctx, money); assert.equal(plan.estado, 'PENDIENTE_APROBACION_EXCEPCION');
  const instructions = plan.rutas.map(t => tramo({ ...t, monto_ves: t.monto_propuesto_ves, fecha_hora_objetivo: plan.fecha_hora_critica }));
  const next = pending(s, { origen_funcional: 'FX_PLAN', plan, tramos: instructions, contexto: ctx });
  assert.throws(() => approve(next), { code: 'FX_EXCEPTION_AUTHORIZATION_REQUIRED' });
  assert.throws(() => approve(next, { contexto: { ...context, excepcion_fx_autorizada: true } }), { code: 'BLOCKED_BY_FUNCTIONAL_RULE' });
});
test('QA-MND31 - No segundo descuento economico', () => { const s = fixture(); assert.equal(calculateCompanyPosition(approve(pending(s)), 'E', money).saldo_disponible_gestion, 80); });
test('QA-MND32 - Posicion oficial intacta', () => { const s = fixture(); assert.deepEqual(calculateCompanyPosition(approve(pending(s)), 'E', money), calculateCompanyPosition(s, 'E', money)); });
test('QA-MND33 - Postura intacta con reserva separada', () => { const s = fixture(); assert.deepEqual(buildPosture(approve(pending(s)), 'E', money), buildPosture(s, 'E', money)); });
test('QA-MND34 - Balances intactos', () => { const s = fixture(); assert.deepEqual(approve(pending(s)).balances, s.balances); });
test('QA-MND35 - Confirmado pendiente y necesidades intactos', () => { const s = fixture(); const n = approve(pending(s)); assert.deepEqual(n.affectations, s.affectations); assert.deepEqual(n.needs, s.needs); });
test('QA-MND36 - CREATE y APPROVE idempotentes', () => { const s = create(fixture()); assert.strictEqual(create(s), s); const approved = approve(submit(s)); assert.strictEqual(approve(approved), approved); });
test('QA-MND37 - Conflicto de request_id', () => { assert.throws(() => create(create(fixture()), { motivo: 'distinto' }), { code: 'IDEMPOTENCY_CONFLICT' }); });
test('QA-MND38 - Reporte deterministico', () => { const s = approve(pending()); assert.deepEqual(buildMandateReport(s), buildMandateReport(s)); assert.equal(view(s).explicacion, 'AUTORIZADO_PARA_EJECUTAR_NO_EJECUTADO'); });
test('QA-MND39 - Snapshot compatible', () => {
  const s = approve(pending()); const data = new Map(); const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  saveNeedState(storage, s); const restored = loadNeedState(storage); assert.deepEqual(buildMandateReport(restored), buildMandateReport(s)); assert.equal(view(cancel(restored)).estado, 'CANCELADO');
});
test('QA-MND40 - Sin ejecucion bancaria UI ni SIGRF', () => {
  const s = fixture(); const before = structuredClone(s); const next = approve(pending(s)); assert.deepEqual(s, before);
  assert.ok(next.events.every(e => !['EJECUTADO', 'TRANSFERENCIA_EJECUTADA'].includes(e.operacion))); assert.equal(Object.hasOwn(next, 'sigrf'), false); assert.equal(Object.hasOwn(next, 'ui'), false);
});
