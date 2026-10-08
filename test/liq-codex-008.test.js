import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/state.js';
import { createPositionState, registerBalance, registerAffectation, calculateCompanyPosition } from '../src/position.js';
import { createNeed, saveNeedState, loadNeedState } from '../src/needs.js';
import { setPostureConfig, buildPosture } from '../src/posture.js';
import { setBankRestriction } from '../src/bank-restrictions.js';
import { setFxObligation } from '../src/fx.js';
import { releaseReserve, reassignReserve, keepReleasedFree, convertReserveToCommitment, cancelReserve, buildReserveView, simulateReserveScenario } from '../src/reserves.js';

const trace = { origen: 'QA-008', usuario: 'tesoreria', motivo: 'Decision explicita', fecha_hora_evento: '2026-10-07T09:00:00-04:00' };
const money = createState({ managedDate: '2026-10-07', rates: { VES_USD_BCV: { value: 10, source: 'BCV', timestamp: trace.fecha_hora_evento } } });
const context = { fecha_hora_evaluacion: '2026-10-07T10:00:00-04:00', zona_horaria: 'America/Caracas', settlement: 'T0' };
function add(state, id, amount, nature = 'RESERVA', bank = 'A') {
  state = registerAffectation(state, { affectation_id: id, empresa: 'E', banco_asignado: bank, tipo_partida: 'OPERATIVA',
    naturaleza_afectacion: nature, amount_original: amount, currency_original: 'VES', operacion: 'ALTA', ...trace }, `aff-${id}`);
  return createNeed(state, { need_id: `N-${id}`, affectation_id: id, prioridad_economica: nature === 'RESERVA' ? 'P1_CRITICA' : 'P2_ALTA',
    rigidez_temporal: 'R4_FLEXIBLE', ...trace }, `need-${id}`);
}
function fixture(balance = 100, commitment = 0) {
  let state = createPositionState({ empresas: ['E'], bancos: ['A', 'B'], cuentas: ['A', 'B'].map(banco => ({ cuenta: `${banco}1`, banco, empresa: 'E', monedas: ['VES'] })) });
  state = registerBalance(state, { cuenta: 'A1', banco: 'A', empresa: 'E', amount_original: balance, currency_original: 'VES', fecha_hora_saldo: trace.fecha_hora_evento, ...trace }, 'balance');
  state = setPostureConfig(state, { empresa: 'E', orden_bancos: ['A', 'B'], orden_cuentas_por_banco: { A: ['A1'], B: ['B1'] }, ...trace }, 'posture');
  for (const banco of ['A', 'B']) state = setBankRestriction(state, { banco, reglas: { minutos_acreditacion: 0 }, ...trace }, `bank-${banco}`);
  state = add(state, 'R', 20);
  return commitment ? add(state, 'C', commitment, 'COMPROMISO', 'B') : state;
}
const row = (monto, extra = {}) => ({ affectation_id: 'R', monto, ...trace, ...extra });
const release = (state, amount = 10, id = 'release') => releaseReserve(state, row(amount), id);
const reassign = (state, amount = 5, id = 'reassign') => reassignReserve(state, row(amount), id);
const view = state => buildReserveView(state, 'R');
const position = state => calculateCompanyPosition(state, 'E', money);
const action = (operacion, monto, extra = {}) => ({ operacion, ...row(monto, extra) });
const scenario = (acciones, extra = {}) => ({ scenario_id: 'S', empresa: 'E', acciones, ...extra });
const simulate = (state, actions, extra = {}) => simulateReserveScenario(state, scenario(actions, extra), money);

test('QA-RSV01 - Reserva activa visible', () => {
  const r = view(fixture()); assert.equal(r.estado, 'ACTIVA'); assert.equal(r.monto_bloqueado, 20); assert.equal(r.monto_original, 20);
});
test('QA-RSV02 - Originales intactos', () => {
  const state = fixture(); const next = reassign(release(state));
  assert.equal(view(next).amount_original, 20); assert.equal(view(next).currency_original, 'VES'); assert.deepEqual(next.balances, state.balances);
  const usd = registerAffectation(state, { affectation_id: 'USD', empresa: 'E', tipo_partida: 'OPERATIVA', naturaleza_afectacion: 'RESERVA',
    amount_original: 2, currency_original: 'USD', operacion: 'ALTA', ...trace }, 'usd');
  const freed = releaseReserve(usd, row(1, { affectation_id: 'USD' }), 'usd-release');
  assert.equal(buildReserveView(freed, 'USD').currency_original, 'USD');
  assert.equal(position(freed).saldo_disponible_gestion - position(usd).saldo_disponible_gestion, 10);
});
test('QA-RSV03 - Liberacion parcial correcta', () => {
  const r = view(release(fixture(), 7)); assert.equal(r.monto_bloqueado, 13); assert.equal(r.monto_liberado, 7); assert.equal(r.estado, 'PARCIALMENTE_LIBERADA');
});
test('QA-RSV04 - Liberacion total correcta', () => {
  const r = view(release(fixture(), 20)); assert.equal(r.monto_bloqueado, 0); assert.equal(r.monto_liberado, 20); assert.equal(r.estado, 'LIBERADA');
});
test('QA-RSV05 - No liberar mas de bloqueado ni importes invalidos', () => {
  for (const amount of [21, 0, -1, NaN, Infinity]) assert.throws(() => release(fixture(), amount));
  const state = release(fixture());
  assert.throws(() => releaseReserve(state, row(1, { fecha_hora_evento: '2026-10-06T09:00:00-04:00' }), 'retroactive'), { code: 'RETROACTIVE_RESERVE_EVENT' });
});
test('QA-RSV06 - Saldo gestion aumenta al liberar', () => {
  const state = fixture(); assert.equal(position(state).saldo_disponible_gestion, 80); assert.equal(position(release(state, 7)).saldo_disponible_gestion, 87);
});
test('QA-RSV07 - Liberada persiste en historia', () => {
  const state = release(fixture(), 20); assert.equal(state.affectations.length, 1);
  assert.equal(view(state).historial.at(-1).operacion, 'RELEASE_RESERVE'); assert.equal(view(state).monto_original, 20);
});
test('QA-RSV08 - Mantener libre no reasigna automaticamente', () => {
  const state = release(fixture(), 20); const next = keepReleasedFree(state, row(undefined), 'keep');
  assert.deepEqual(next.affectations, state.affectations); assert.equal(position(next).saldo_disponible_gestion, 100); assert.equal(view(next).estado, 'LIBERADA');
});
test('QA-RSV09 - Reasignacion parcial', () => {
  const r = view(reassign(release(fixture(), 20), 5)); assert.equal(r.monto_bloqueado, 5); assert.equal(r.monto_liberado, 20);
  assert.equal(r.monto_reasignado, 5); assert.equal(r.monto_liberado_disponible, 15);
});
test('QA-RSV10 - Reasignacion total', () => {
  const r = view(reassign(release(fixture(), 20), 20)); assert.equal(r.monto_bloqueado, 20); assert.equal(r.monto_liberado_disponible, 0); assert.equal(r.estado, 'PARCIALMENTE_LIBERADA');
});
test('QA-RSV11 - No reasignar mas de liberado', () => {
  assert.throws(() => reassign(release(fixture(), 10), 11), { code: 'EXCESSIVE_RESERVE_REASSIGNMENT' });
});
test('QA-RSV12 - Saldo gestion baja al reasignar', () => {
  assert.equal(position(reassign(release(fixture(), 20), 7)).saldo_disponible_gestion, 93);
});
test('QA-RSV13 - Conversion conserva la misma afectacion y solo bloqueado vigente', () => {
  const state = release(fixture(), 7); const next = convertReserveToCommitment(state, row(undefined), 'convert');
  assert.equal(next.affectations.length, 1); assert.equal(next.affectations[0].affectation_id, 'R');
  assert.equal(next.affectations[0].naturaleza_afectacion, 'COMPROMISO'); assert.equal(next.affectations[0].monto_vigente, 13);
  assert.equal(view(next).monto_original, 20); assert.equal(view(next).monto_bloqueado, 0); assert.equal(view(next).monto_liberado, 7);
  assert.strictEqual(convertReserveToCommitment(next, row(undefined), 'convert'), next);
});
test('QA-RSV14 - Conversion no cambia disponibilidad ni aplica doble descuento', () => {
  const state = release(fixture(), 7); const next = convertReserveToCommitment(state, row(undefined), 'convert');
  assert.equal(position(next).saldo_disponible_gestion, position(state).saldo_disponible_gestion);
  assert.equal(position(next).reservas_bloqueadas, 0); assert.equal(position(next).compromisos_por_ejecutar, 13);
});
test('QA-RSV15 - Confirmado impide conversion y convertido no admite reactivacion', () => {
  const confirmed = registerAffectation(fixture(), { affectation_id: 'R', operacion: 'AJUSTE', monto_reflejado_confirmado: 1, ...trace }, 'confirmed');
  assert.throws(() => convertReserveToCommitment(confirmed, row(undefined), 'convert'), { code: 'RESERVE_HAS_CONFIRMED_AMOUNT' });
  const converted = convertReserveToCommitment(release(fixture(), 7), row(undefined), 'convert');
  assert.throws(() => reassign(converted, 7), { code: 'RESERVE_ALREADY_CONVERTED_TO_COMMITMENT' });
  assert.equal(view(converted).monto_liberado_disponible, 0);
});
test('QA-RSV16 - Anulacion parcial separa acumulado anulado de liberado', () => {
  const state = cancelReserve(fixture(), row(5), 'cancel'); const r = view(state);
  assert.equal(r.estado, 'PARCIALMENTE_ANULADA'); assert.equal(r.monto_anulado_acumulado, 5); assert.equal(r.monto_liberado, 0);
  assert.equal(r.monto_bloqueado, 15); assert.equal(position(state).saldo_disponible_gestion, 85);
  assert.throws(() => reassign(state, 5), { code: 'EXCESSIVE_RESERVE_REASSIGNMENT' });
});
test('QA-RSV17 - Anulacion total es terminal incluso con liberaciones anteriores', () => {
  const state = cancelReserve(release(fixture(), 7), row(13), 'cancel'); const r = view(state);
  assert.equal(r.estado, 'ANULADA'); assert.equal(r.monto_anulado_acumulado, 13); assert.equal(r.monto_liberado, 7);
  assert.equal(r.monto_liberado_disponible, 0); assert.equal(position(state).saldo_disponible_gestion, 100);
  assert.throws(() => reassign(state, 7), { code: 'RESERVE_ALREADY_CANCELLED' });
  assert.strictEqual(cancelReserve(state, row(13), 'cancel'), state);
});
test('QA-RSV18 - Estados respetan precedencia historica y terminal', () => {
  let state = fixture(); assert.equal(view(state).estado, 'ACTIVA');
  state = release(state, 10); assert.equal(view(state).estado, 'PARCIALMENTE_LIBERADA');
  state = reassign(state, 5); assert.equal(view(state).estado, 'PARCIALMENTE_LIBERADA');
  state = cancelReserve(state, row(3), 'cancel'); assert.equal(view(state).estado, 'PARCIALMENTE_ANULADA');
  state = reassign(state, 5, 'reassign2'); assert.equal(view(state).estado, 'PARCIALMENTE_ANULADA');
  state = convertReserveToCommitment(state, row(undefined), 'convert'); assert.equal(view(state).estado, 'CONVERTIDA_A_COMPROMISO');
  assert.equal(view(state).monto_anulado_acumulado, 3); assert.equal(view(state).monto_liberado, 10); assert.equal(view(state).monto_reasignado, 10);
  const mixed = cancelReserve(fixture(), row(5), 'mixed-cancel'); const before = structuredClone(mixed);
  const freed = release(mixed, 15); const r = view(freed);
  assert.equal(r.estado, 'LIBERADA'); assert.equal(r.monto_anulado_acumulado, 5);
  assert.equal(r.monto_liberado, 15); assert.equal(r.monto_bloqueado, 0); assert.equal(r.monto_liberado_disponible, 15);
  assert.equal(position(freed).saldo_disponible_gestion, 100); assert.deepEqual(mixed, before);
  assert.strictEqual(release(freed, 15), freed);
  for (const amount of [1, 7, 15]) {
    const revived = reassign(freed, amount); const current = view(revived);
    assert.equal(current.estado, 'PARCIALMENTE_ANULADA'); assert.equal(current.monto_bloqueado, amount);
    assert.equal(current.monto_liberado_disponible, 15 - amount); assert.equal(current.monto_anulado_acumulado, 5);
    assert.equal(current.monto_liberado, 15); assert.equal(current.monto_reasignado, amount);
    assert.equal(position(revived).saldo_disponible_gestion, 100 - amount);
    assert.throws(() => reassign(revived, 16 - amount, 'excess'), { code: 'EXCESSIVE_RESERVE_REASSIGNMENT' });
  }
  assert.throws(() => reassign(freed, 20), { code: 'EXCESSIVE_RESERVE_REASSIGNMENT' });
  const official = fixture(); const original = structuredClone(official);
  const simulated = simulate(official, [action('CANCEL_RESERVE', 5), action('RELEASE_RESERVE', 15), action('REASSIGN_RESERVE', 7)]);
  assert.equal(simulated.estado, 'VALIDO'); assert.equal(simulated.log[1].evento.after.estado, 'LIBERADA');
  assert.equal(simulated.log[2].evento.after.estado, 'PARCIALMENTE_ANULADA'); assert.equal(simulated.despues.saldo_disponible_gestion, 93);
  assert.deepEqual(official, original);
});
test('QA-RSV19 - Idempotencia release', () => {
  const state = release(fixture()); assert.strictEqual(release(state), state);
});
test('QA-RSV20 - Conflicto idempotencia', () => {
  assert.throws(() => release(release(fixture()), 5), { code: 'IDEMPOTENCY_CONFLICT' });
});
test('QA-RSV21 - What If no muta estado completo', () => {
  const state = fixture(); const before = structuredClone(state); const result = simulate(state, [action('RELEASE_RESERVE', 10)]);
  assert.equal(result.estado, 'VALIDO'); assert.deepEqual(state, before); assert.equal(view(state).monto_bloqueado, 20);
});
test('QA-RSV22 - Secuencia release y reassign', () => {
  const result = simulate(fixture(), [action('RELEASE_RESERVE', 20), action('REASSIGN_RESERVE', 5)]);
  assert.equal(result.despues.saldo_disponible_gestion, 95); assert.equal(result.log[1].evento.after.monto_liberado_disponible, 15);
});
test('QA-RSV23 - Secuencia invalida se detiene sin resultado parcial publicable', () => {
  const result = simulate(fixture(), [action('RELEASE_RESERVE', 10), action('REASSIGN_RESERVE', 11), action('RELEASE_RESERVE', 1)]);
  assert.equal(result.estado, 'INVALIDO'); assert.equal(result.despues, null); assert.equal(result.log.length, 2); assert.equal(result.acciones_no_ejecutadas, 1);
  assert.equal(simulate(fixture(), [null]).estado, 'INVALIDO');
});
test('QA-RSV24 - Comparacion antes despues completa', () => {
  const result = simulate(fixture(), [action('RELEASE_RESERVE', 10)]);
  for (const side of [result.antes, result.despues]) for (const key of ['saldo_bancario', 'compromisos_por_ejecutar', 'reservas_bloqueadas', 'saldo_disponible_gestion', 'deficit', 'capacidad_cobertura', 'postura']) assert.ok(Object.hasOwn(side, key));
  assert.equal(result.antes.reservas_bloqueadas, 20); assert.equal(result.despues.reservas_bloqueadas, 10);
});
test('QA-RSV25 - Deficit cambia correctamente', () => {
  const result = simulate(fixture(10), [action('RELEASE_RESERVE', 7)]); assert.equal(result.antes.deficit, 10); assert.equal(result.despues.deficit, 3);
});
test('QA-RSV26 - Cobertura recalculada tras liberar', () => {
  const result = simulate(fixture(100, 90), [action('RELEASE_RESERVE', 10)], { contexto_cobertura: context });
  assert.equal(result.antes.capacidad_cobertura, 80); assert.equal(result.despues.capacidad_cobertura, 90);
});
test('QA-RSV27 - Cobertura recalculada tras reasignar', () => {
  const result = simulate(release(fixture(100, 90), 10), [action('REASSIGN_RESERVE', 10)], { contexto_cobertura: context });
  assert.equal(result.antes.capacidad_cobertura, 90); assert.equal(result.despues.capacidad_cobertura, 80);
});
test('QA-RSV28 - Postura recalculada sin mutacion oficial', () => {
  const state = fixture(); const before = buildPosture(state, 'E', money); const result = simulate(state, [action('RELEASE_RESERVE', 10)]);
  assert.notDeepEqual(result.antes.postura, result.despues.postura); assert.deepEqual(buildPosture(state, 'E', money), before);
});
test('QA-RSV29 - Restricciones siguen aplicando al escenario', () => {
  const state = setBankRestriction(fixture(100, 90), { banco: 'A', reglas: { cutoff: '09:30', minutos_acreditacion: 0 }, ...trace }, 'cutoff');
  const result = simulate(state, [action('RELEASE_RESERVE', 10)], { contexto_cobertura: context });
  assert.equal(result.despues.capacidad_cobertura, 0); assert.ok(result.despues.cobertura.planes.some(p => p.fuentes_descartadas.length > 0));
});
test('QA-RSV30 - FX mejora hipoteticamente sin modificar FX oficial', () => {
  const state = setFxObligation(fixture(100, 90), { fx_id: 'FX', affectation_id: 'C', banco_negociador: 'B', moneda_objetivo: 'USD', monto_divisa: 9,
    fecha_hora_negociacion: trace.fecha_hora_evento, fecha_hora_critica: '2026-10-08T12:00:00-04:00', zona_horaria: context.zona_horaria, ...trace }, 'fx', money);
  const before = structuredClone(state); const result = simulate(state, [action('RELEASE_RESERVE', 10)], { contexto_fx: context });
  assert.equal(result.antes.fx.gap_fx, 10); assert.equal(result.despues.fx.gap_fx, 0); assert.deepEqual(state, before);
});
test('QA-RSV31 - Multiples reservas independientes', () => {
  const state = add(fixture(), 'R2', 15); const next = release(state);
  assert.equal(buildReserveView(next, 'R2').monto_bloqueado, 15); assert.equal(view(next).monto_bloqueado, 10);
});
test('QA-RSV32 - No doble uso del monto liberado en ciclos', () => {
  let state = reassign(release(fixture(), 20), 20); assert.throws(() => reassign(state, 1, 'excess'), { code: 'EXCESSIVE_RESERVE_REASSIGNMENT' });
  state = reassign(release(state, 10, 'release2'), 10, 'reassign2');
  assert.equal(view(state).monto_liberado, 30); assert.equal(view(state).monto_reasignado, 30); assert.equal(view(state).monto_bloqueado, 20);
});
test('QA-RSV33 - Reasignacion conserva trazabilidad', () => {
  const event = reassign(release(fixture())).events.at(-1); assert.equal(event.operacion, 'REASSIGN_RESERVE');
  assert.equal(event.before.monto_bloqueado, 10); assert.equal(event.after.monto_bloqueado, 15);
  for (const key of ['affectation_id', 'motivo', 'origen', 'usuario', 'fecha_hora_evento', 'request_id']) assert.ok(event[key]);
});
test('QA-RSV34 - Conversion conserva vinculo need y affectation tambien en What If', () => {
  const state = fixture(); const next = convertReserveToCommitment(state, row(undefined), 'convert');
  assert.equal(next.needs[0].need_id, 'N-R'); assert.equal(next.needs[0].affectation_id, 'R'); assert.equal(next.needs[0].naturaleza, 'COMPROMISO');
  const before = structuredClone(state); const result = simulate(state, [action('RELEASE_RESERVE', 7), action('CONVERT_RESERVE_TO_COMMITMENT')]);
  assert.equal(result.estado, 'VALIDO'); assert.equal(result.despues.compromisos_por_ejecutar, 13); assert.equal(result.despues.saldo_disponible_gestion, 87);
  assert.deepEqual(state, before);
});
test('QA-RSV35 - KEEP_RELEASED_FREE explicable', () => {
  const state = keepReleasedFree(release(fixture()), row(undefined), 'keep');
  assert.equal(state.events.at(-1).explicacion, 'IMPORTE_LIBRE_SIN_ASIGNACION_AUTOMATICA'); assert.strictEqual(keepReleasedFree(state, row(undefined), 'keep'), state);
});
test('QA-RSV36 - CANCEL conserva historia y escenario cancelado no reactiva', () => {
  const state = cancelReserve(fixture(), row(20), 'cancel'); const r = view(state);
  assert.equal(state.affectations.length, 1); assert.equal(r.amount_original, 20); assert.equal(r.historial.at(-1).operacion, 'CANCEL_RESERVE');
  assert.equal(r.historial.at(-1).before.monto_bloqueado, 20); assert.equal(r.historial.at(-1).after.monto_anulado_acumulado, 20);
  const result = simulate(fixture(), [action('RELEASE_RESERVE', 7), action('CANCEL_RESERVE', 13), action('REASSIGN_RESERVE', 7)]);
  assert.equal(result.estado, 'INVALIDO'); assert.equal(result.errors[0].code, 'RESERVE_ALREADY_CANCELLED');
});
test('QA-RSV37 - Escenario deterministico', () => {
  const state = fixture(); const actions = [action('RELEASE_RESERVE', 10)]; assert.deepEqual(simulate(state, actions), simulate(state, actions));
});
test('QA-RSV38 - Snapshot persistente compatible', () => {
  const state = reassign(release(fixture())); const data = new Map(); const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  saveNeedState(storage, state); const restored = loadNeedState(storage); assert.deepEqual(view(restored), view(state)); assert.strictEqual(reassign(restored), restored);
  for (const terminal of [cancelReserve(state, row(15), 'cancel'), convertReserveToCommitment(state, row(undefined), 'convert')]) {
    saveNeedState(storage, terminal); assert.deepEqual(view(loadNeedState(storage)), view(terminal));
  }
});
test('QA-RSV39 - Sin ejecucion bancaria ni mandato', () => {
  const state = fixture(); const result = simulate(state, [action('RELEASE_RESERVE', 10)]);
  assert.equal(result.solo_simulacion, true); assert.equal(state.events.some(e => e.kind === 'RESERVE'), false); assert.equal(Object.hasOwn(result, 'mandatos'), false);
});
test('QA-RSV40 - Sin UI ni SIGRF y salida inmutable', () => {
  const result = simulate(fixture(), []); assert.ok(Object.isFrozen(result)); assert.equal(Object.hasOwn(result, 'ui'), false); assert.equal(Object.hasOwn(result, 'sigrf'), false);
});
