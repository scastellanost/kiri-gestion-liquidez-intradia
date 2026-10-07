import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/state.js';
import { createPositionState, registerBalance, registerAffectation, calculateCompanyPosition } from '../src/position.js';
import { createNeed, saveNeedState, loadNeedState } from '../src/needs.js';
import { setPostureConfig, buildPosture } from '../src/posture.js';
import { setBankRestriction } from '../src/bank-restrictions.js';
import { setFxObligation, clearFxObligation, buildFxPlan, buildFxReport } from '../src/fx.js';

const trace = { origen: 'QA-007', usuario: 'tesoreria', fecha_hora_evento: '2026-10-05T09:00:00-04:00' };
const money = createState({ managedDate: '2026-10-05', rates: { VES_USD_BCV: { value: 10, source: 'BCV', timestamp: trace.fecha_hora_evento } } });
const context = { fecha_hora_evaluacion: '2026-10-05T10:00:00-04:00', settlement: 'T0' };
const ids = ['EA1', 'EA2', 'EB1', 'FA1', 'FB1'];
function fixture(values = { EA1: 20 }, amount = 20, bank = 'A') {
  let state = createPositionState({ empresas: ['E', 'F'], bancos: ['A', 'B'], cuentas: ids.map(cuenta => ({ cuenta,
    empresa: cuenta[0], banco: cuenta[1], monedas: ['VES'] })) });
  for (const [cuenta, amount_original] of Object.entries(values)) state = registerBalance(state, {
    cuenta, empresa: cuenta[0], banco: cuenta[1], amount_original, currency_original: 'VES', fecha_hora_saldo: trace.fecha_hora_evento, ...trace
  }, `saldo-${cuenta}`);
  for (const empresa of ['E', 'F']) state = setPostureConfig(state, { empresa, orden_bancos: ['A', 'B'],
    orden_cuentas_por_banco: { A: ids.filter(a => a[0] === empresa && a[1] === 'A'), B: ids.filter(a => a[0] === empresa && a[1] === 'B') }, ...trace }, `posture-${empresa}`);
  for (const banco of ['A', 'B']) state = setBankRestriction(state, { banco, reglas: { minutos_acreditacion: 0 }, ...trace }, `bank-${banco}`);
  return add(state, 'OB', amount, bank);
}
function add(state, id, amount, bank = 'A', priority = 'P2_ALTA', rigidity = 'R1_HORA_RIGIDA', deadline = '2026-10-06T12:00:00-04:00') {
  state = registerAffectation(state, { affectation_id: id, empresa: 'E', banco_asignado: bank, tipo_partida: 'PAGO', naturaleza_afectacion: 'COMPROMISO',
    amount_original: amount, currency_original: 'VES', operacion: 'ALTA', ...trace }, `aff-${id}`);
  return createNeed(state, { need_id: `N-${id}`, affectation_id: id, prioridad_economica: priority, rigidez_temporal: rigidity,
    fecha_hora_objetivo: deadline, ...trace }, `need-${id}`);
}
const row = (extra = {}) => ({ fx_id: 'FX', affectation_id: 'OB', banco_negociador: 'A', moneda_objetivo: 'USD', monto_divisa: 2,
  fecha_hora_negociacion: trace.fecha_hora_evento, fecha_hora_critica: '2026-10-06T12:00:00-04:00', zona_horaria: 'America/Caracas', ...trace, ...extra });
const set = (state, extra = {}, monetary = money) => setFxObligation(state, row(extra), `fx-${extra.fx_id ?? 'FX'}`, monetary);
const run = (state, ctx = {}, monetary = money) => buildFxPlan(state, 'FX', { ...context, ...ctx }, monetary);
const rule = (state, banco, reglas, extra = {}) => setBankRestriction(state, { banco, reglas, ...trace, ...extra }, `rule-${state.events.length}`);
function exceptionFixture(available = 20, deadline = '2026-10-05T16:00:00-04:00') {
  let state = fixture({ EA1: 20, EB1: available }, 20, 'B');
  state = add(state, 'OTHER', 20, 'A', 'P1_CRITICA', 'R4_FLEXIBLE', deadline);
  state = rule(state, 'B', { hora_inicio: '14:00', minutos_acreditacion: 0 });
  return set(state, { fecha_hora_critica: '2026-10-05T11:00:00-04:00' });
}
const exceptionContext = (extra = {}) => ({ excepcion_temporal: { motivo: 'Hora critica FX anterior a obligacion flexible',
  desplazadas: [{ need_id_desplazada: 'N-OTHER', monto_desplazado_ves: 20, ...extra }] } });

test('QA-FX01 - Vinculo obligatorio, FX unico e importe completo coincidente', () => {
  const state = fixture(); assert.throws(() => set(state, { affectation_id: undefined }), { code: 'FX_AFFECTATION_REQUIRED' });
  for (const monto_divisa of [1, 3]) assert.throws(() => set(state, { monto_divisa }), { code: 'FX_AMOUNT_PENDING_MISMATCH' });
  assert.throws(() => set(state, { equivalente_ves: 21 }), { code: 'FX_AMOUNT_PENDING_MISMATCH' });
  const configured = set(state);
  assert.throws(() => set(configured, { fx_id: 'SECOND' }), { code: 'DUPLICATE_ACTIVE_FX_FOR_AFFECTATION' });
});
test('QA-FX02 - Afectacion inexistente rechazada sin mutacion', () => {
  const state = fixture(); const before = structuredClone(state);
  assert.throws(() => set(state, { affectation_id: 'missing' }), { code: 'UNKNOWN_AFFECTATION_REFERENCE' }); assert.deepEqual(state, before);
});
test('QA-FX03 - Configurar y actualizar no crea segunda afectacion', () => {
  let state = fixture(); const before = structuredClone(state.affectations); state = set(state);
  state = setFxObligation(state, row({ banco_negociador: 'B' }), 'update', money);
  assert.deepEqual(state.affectations, before); assert.equal(state.fxObligations.length, 1); assert.equal(state.events.at(-1).before.banco_negociador, 'A');
});
test('QA-FX04 - Configuracion no descuenta nuevamente la obligacion', () => {
  const state = fixture({ EA1: 100 }); const before = calculateCompanyPosition(state, 'E', money);
  assert.equal(before.saldo_disponible_gestion, 80); assert.deepEqual(calculateCompanyPosition(set(state), 'E', money), before);
});
test('QA-FX05 - Equivalente USD a VES deriva de CODEX-001 y se revalida', () => {
  let state = set(fixture()); assert.equal(state.fxObligations[0].equivalente_ves, 20);
  state = registerAffectation(state, { affectation_id: 'OB', operacion: 'AJUSTE', monto_vigente: 15, ...trace }, 'adjust');
  assert.equal(run(state).publicable, false); assert.equal(run(state).errors[0].code, 'FX_AMOUNT_PENDING_MISMATCH');
  state = setFxObligation(state, row({ monto_divisa: 1.5 }), 'refresh', money); assert.equal(run(state).equivalente_ves, 15);
});
test('QA-FX06 - Falta tasa no publicable sin equivalente parcial', () => {
  const noRate = createState({ managedDate: '2026-10-05' }); const state = set(fixture(), {}, noRate);
  const result = run(state, {}, noRate); assert.equal(result.publicable, false); assert.equal(result.equivalente_ves, null);
  assert.equal(result.gap_fx, null); assert.equal(result.errors[0].code, 'MISSING_EXCHANGE_RATE');
});
test('QA-FX07 - Banco negociador debe existir', () => {
  assert.throws(() => set(fixture(), { banco_negociador: 'missing' }), { code: 'INVALID_BANK' });
});
test('QA-FX08 - T1 lunes a martes, fecha manual contradictoria rechazada', () => {
  assert.equal(set(fixture()).fxObligations[0].fecha_valor, '2026-10-06');
  assert.throws(() => set(fixture(), { fecha_valor: '2026-10-07' }), { code: 'FX_VALUE_DATE_MISMATCH' });
});
test('QA-FX09 - Feriados y precedencia cuenta sobre empresa sobre banco', () => {
  let state = rule(fixture(), 'A', { feriados: ['2026-10-06'], minutos_acreditacion: 0 });
  assert.equal(set(state).fxObligations[0].fecha_valor, '2026-10-07');
  state = rule(state, 'A', { feriados: ['2026-10-06', '2026-10-07'] }, { empresa: 'E' });
  assert.equal(set(state).fxObligations[0].fecha_valor, '2026-10-08');
  state = rule(state, 'A', { feriados: [] }, { cuenta: 'EA1' });
  assert.equal(set(state, { cuenta_destino_fx: 'EA1' }).fxObligations[0].fecha_valor, '2026-10-06');
});
test('QA-FX10 - Fin de semana se salta solo con calendario configurado', () => {
  const at = { fecha_hora_negociacion: '2026-10-09T10:00:00-04:00', fecha_hora_critica: '2026-10-12T12:00:00-04:00' };
  assert.equal(set(rule(fixture(), 'A', { dias_habiles_semana: [1, 2, 3, 4, 5] }), at).fxObligations[0].fecha_valor, '2026-10-12');
  assert.equal(set(fixture(), at).fxObligations[0].fecha_valor, '2026-10-10');
  const denied = set(rule(fixture(), 'A', { settlement: 'T0' })); assert.equal(run(denied).estado, 'BLOQUEADA_POR_RESTRICCION');
});
test('QA-FX11 - ETA antes o en hora critica es viable', () => {
  const state = set(rule(fixture(), 'A', { minutos_acreditacion: 30 }), { fecha_hora_critica: '2026-10-05T10:30:00-04:00' });
  const result = run(state); assert.equal(result.estado, 'COBERTURA_COMPLETA'); assert.equal(result.rutas[0].eta, '2026-10-05T14:30:00.000Z');
});
test('QA-FX12 - ETA posterior a hora critica bloquea aunque need tenga plazo posterior', () => {
  const result = run(set(rule(fixture(), 'A', { minutos_acreditacion: 31 }), { fecha_hora_critica: '2026-10-05T10:30:00-04:00' }));
  assert.equal(result.estado, 'BLOQUEADA_POR_RESTRICCION'); assert.equal(result.gap_fx, 20);
});
test('QA-FX13 - Prioridad economica y rigidez se heredan separadas', () => {
  let state = add(fixture({}, 20), 'FLEX', 10, 'A', 'P1_CRITICA', 'R4_FLEXIBLE', null);
  state = set(set(state), { fx_id: 'FX-FLEX', affectation_id: 'FLEX', monto_divisa: 1 });
  const result = buildFxReport(state, context, money);
  assert.deepEqual(result.planes.map(p => [p.prioridad_economica, p.rigidez_temporal]), [['P2_ALTA', 'R1_HORA_RIGIDA'], ['P1_CRITICA', 'R4_FLEXIBLE']]);
});
test('QA-FX14 - Mismo banco primero, sin segundo descuento intraempresa', () => {
  const result = run(set(fixture({ EA1: 20, EB1: 100, FA1: 100 })));
  assert.equal(result.monto_localizado_banco_negociador, 20); assert.deepEqual(result.rutas.map(r => r.nivel_cobertura), [1]);
  assert.equal(result.rutas[0].saldo_fuente_antes, result.rutas[0].saldo_fuente_despues);
});
test('QA-FX15 - Otro banco propio completa despues de banco negociador', () => {
  const result = run(set(fixture({ EA1: 10, EB1: 20 })));
  assert.deepEqual(result.rutas.map(r => [r.nivel_cobertura, r.monto_propuesto_ves]), [[1, 10], [2, 10]]);
  const elsewhere = run(set(fixture({ EB1: 20 }, 20, 'B'))); assert.equal(elsewhere.monto_localizado_otros_bancos_propios, 20);
  assert.equal(elsewhere.gap_fx, 0);
});
test('QA-FX16 - Intercompany mismo banco tras agotar propia empresa', () => {
  const result = run(set(fixture({ EB1: 10, FA1: 20 })));
  assert.deepEqual(result.rutas.map(r => r.nivel_cobertura), [2, 3]); assert.equal(result.monto_cobertura_intercompany, 10);
});
test('QA-FX17 - Intercompany otro banco ultimo nivel', () => {
  const result = run(set(fixture({ FB1: 20 }))); assert.equal(result.rutas[0].nivel_cobertura, 4);
  assert.equal(result.monto_cobertura_intercompany, 20);
});
test('QA-FX18 - Una cuenta no financia dos rutas con el mismo saldo', () => {
  const result = run(set(fixture({ EA1: 10, EA2: 5 })));
  assert.equal(result.monto_cubierto_total, 15); assert.equal(new Set(result.rutas.map(r => r.cuenta_fuente)).size, result.rutas.length);
  assert.ok(result.rutas.every(r => r.capacidad_fisica_despues >= 0));
});
test('QA-FX19 - Gap derivado no crea otra necesidad', () => {
  const state = set(fixture({ EA1: 5 })); const count = state.needs.length;
  assert.equal(run(state).gap_fx, 15); assert.equal(state.needs.length, count); assert.equal(state.affectations.length, 1);
});
test('QA-FX20 - Banco sin orden de cuentas no inventa destino', () => {
  let state = fixture({ EB1: 20 });
  state = setPostureConfig(state, { empresa: 'E', orden_bancos: ['B'], orden_cuentas_por_banco: { B: ['EB1'] }, ...trace }, 'no-A');
  const result = run(set(state)); assert.equal(result.monto_localizado_banco_negociador, 0); assert.equal(result.gap_fx, 0);
  assert.ok(result.rutas.every(r => !Object.hasOwn(r, 'cuenta_destino')));
});
test('QA-FX21 - Cuenta destino explicita validada y saldo propio no es autotransferencia', () => {
  for (const cuenta_destino_fx of ['FA1', 'EB1', 'missing']) assert.throws(() => set(fixture(), { cuenta_destino_fx }), { code: 'INVALID_FX_DESTINATION_ACCOUNT' });
  const result = run(set(fixture(), { cuenta_destino_fx: 'EA1' }));
  assert.equal(result.rutas[0].tipo_tramo, 'LOCALIZACION_SIN_TRANSFERENCIA'); assert.equal(result.gap_fx, 0);
  assert.equal(run(set(fixture()), { cuenta_destino_fx: 'EA1' }).rutas[0].tipo_tramo, 'LOCALIZACION_SIN_TRANSFERENCIA');
  assert.equal(run(set(fixture()), { cuenta_destino_fx: 'FA1' }).errors[0].code, 'INVALID_FX_DESTINATION_ACCOUNT');
});
test('QA-FX22 - Cutoff bloquea rutas tardias', () => {
  const result = run(set(rule(fixture(), 'A', { cutoff: '09:30', minutos_acreditacion: 0 })));
  assert.equal(result.estado, 'BLOQUEADA_POR_RESTRICCION'); assert.ok(result.restricciones.some(r => r.rule_id === 'AFTER_CUTOFF'));
});
test('QA-FX23 - Maximo diario permite solo capacidad bancaria restante', () => {
  const result = run(set(rule(fixture(), 'A', { max_diario: 12, minutos_acreditacion: 0 })));
  assert.equal(result.monto_cubierto_total, 12); assert.equal(result.gap_fx, 8);
});
test('QA-FX24 - Aprobacion adicional se conserva en las rutas', () => {
  const result = run(set(rule(fixture(), 'A', { requiere_aprobacion_adicional: true, minutos_acreditacion: 0 })));
  assert.ok(result.rutas[0].acciones_requeridas.includes('APROBACION_ADICIONAL'));
});
test('QA-FX25 - Cobertura parcial con gap positivo', () => {
  const result = run(set(fixture({ EA1: 10 }))); assert.equal(result.estado, 'COBERTURA_PARCIAL'); assert.equal(result.gap_fx, 10);
});
test('QA-FX26 - Sin fuentes queda sin cobertura', () => {
  const result = run(set(fixture({}))); assert.equal(result.estado, 'SIN_COBERTURA'); assert.equal(result.gap_fx, 20);
});
test('QA-FX27 - Cobertura completa con gap cero', () => {
  assert.equal(run(set(fixture())).estado, 'COBERTURA_COMPLETA'); assert.equal(run(set(fixture())).gap_fx, 0);
});
test('QA-FX28 - Excepcion temporal viable solo queda pendiente de aprobacion', () => {
  const state = exceptionFixture(); assert.notEqual(run(state).estado, 'COBERTURA_COMPLETA');
  const result = run(state, exceptionContext()); assert.equal(result.estado, 'PENDIENTE_APROBACION_EXCEPCION');
  assert.equal(result.excepcion_temporal.aceptable, true); assert.equal(result.excepcion_temporal.requiere_aprobacion, true);
});
test('QA-FX29 - Excepcion no altera prioridad ni rigidez', () => {
  const state = exceptionFixture(); const before = structuredClone(state.needs);
  const result = run(state, exceptionContext()); assert.equal(result.prioridad_economica, 'P2_ALTA'); assert.deepEqual(state.needs, before);
});
test('QA-FX30 - Excepcion identifica necesidad y monto desplazados', () => {
  const result = run(exceptionFixture(), exceptionContext());
  assert.equal(result.excepcion_temporal.desplazadas[0].need_id_desplazada, 'N-OTHER');
  assert.equal(result.excepcion_temporal.desplazadas[0].monto_desplazado_ves, 20);
});
test('QA-FX31 - Recomposicion ausente, parcial o sin plazo no habilita excepcion', () => {
  const partial = run(exceptionFixture(10), exceptionContext());
  assert.equal(partial.estado, 'BLOQUEADA_POR_RESTRICCION'); assert.equal(partial.excepcion_temporal.aceptable, false);
  assert.equal(partial.recomposicion[0].estado_recomposicion, 'NO_VIABLE'); assert.equal(partial.recomposicion[0].monto_recompuesto, 10);
  const noDeadline = run(exceptionFixture(20, null), exceptionContext());
  assert.equal(noDeadline.excepcion_temporal.errors[0].code, 'FX_RECOMPOSITION_DEADLINE_REQUIRED');
  assert.notEqual(noDeadline.estado, 'PENDIENTE_APROBACION_EXCEPCION');
});
test('QA-FX32 - Recomposicion cubre 100% con ruta, fecha y monto sin otro desplazamiento', () => {
  const result = run(exceptionFixture(), exceptionContext()); const r = result.recomposicion[0];
  assert.equal(r.estado_recomposicion, 'VIABLE'); assert.equal(r.monto_recompuesto, 20); assert.equal(r.residual_recomposicion, 0);
  assert.equal(r.rutas_recomposicion[0].cuenta_fuente, 'EB1'); assert.equal(r.eta_maxima, '2026-10-05T18:00:00.000Z');
  assert.equal(result.rutas[0].cuenta_fuente, 'EA1');
  const extended = run(exceptionFixture(), exceptionContext({ fecha_hora_limite_recomposicion: '2026-10-05T17:00:00-04:00' }));
  assert.equal(extended.excepcion_temporal.errors[0].code, 'FX_RECOMPOSITION_DEADLINE_EXTENDED');
  const late = run(exceptionFixture(), exceptionContext({ fecha_hora_limite_recomposicion: '2026-10-05T13:00:00-04:00' }));
  assert.equal(late.excepcion_temporal.aceptable, false);
});
test('QA-FX33 - Ningun plan modifica estado oficial ni postura', () => {
  const state = exceptionFixture(); const before = structuredClone(state); const posture = buildPosture(state, 'E', money);
  run(state, exceptionContext()); assert.deepEqual(state, before); assert.deepEqual(buildPosture(state, 'E', money), posture);
});
test('QA-FX34 - Multiples FX se ordenan por rigidez, critica, prioridad, evento e ID', () => {
  let state = fixture({}, 20); state = add(state, 'EARLY', 10, 'A', 'P3_NORMAL', 'R1_HORA_RIGIDA');
  state = add(state, 'FLEX', 10, 'A', 'P1_CRITICA', 'R4_FLEXIBLE', null);
  state = set(set(set(state), { fx_id: 'EARLY', affectation_id: 'EARLY', monto_divisa: 1, fecha_hora_critica: '2026-10-05T11:00:00-04:00' }),
    { fx_id: 'FLEX', affectation_id: 'FLEX', monto_divisa: 1, fecha_hora_critica: '2026-10-05T10:30:00-04:00' });
  assert.deepEqual(buildFxReport(state, context, money).planes.map(p => p.fx_id), ['EARLY', 'FX', 'FLEX']);
});
test('QA-FX35 - Reporte comparte capacidad fisica y bancaria', () => {
  let state = add(fixture({ EA1: 30 }), 'SECOND', 20); state = set(set(state), { fx_id: 'SECOND', affectation_id: 'SECOND' });
  let result = buildFxReport(state, context, money); assert.equal(result.monto_cubierto_total, 30); assert.equal(result.gap_fx, 10);
  state = rule(state, 'A', { max_diario: 25, minutos_acreditacion: 0 }); result = buildFxReport(state, context, money);
  assert.equal(result.monto_cubierto_total, 25); assert.equal(result.gap_fx, 15);
});
test('QA-FX36 - SET idempotente y persistencia mediante snapshot existente', () => {
  const state = set(fixture()); assert.strictEqual(set(state), state);
  const data = new Map(); const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  saveNeedState(storage, state); const restored = loadNeedState(storage); assert.deepEqual(restored, state); assert.strictEqual(set(restored), restored);
});
test('QA-FX37 - Conflicto por identificador de solicitud repetido', () => {
  assert.throws(() => set(set(fixture()), { banco_negociador: 'B' }), { code: 'IDEMPOTENCY_CONFLICT' });
});
test('QA-FX38 - CLEAR elimina FX con trazabilidad sin alterar posicion', () => {
  const state = set(fixture()); const cleared = clearFxObligation(state, { fx_id: 'FX', ...trace }, 'clear');
  assert.deepEqual(cleared.fxObligations, []); assert.deepEqual(calculateCompanyPosition(cleared, 'E', money), calculateCompanyPosition(state, 'E', money));
  assert.equal(cleared.events.at(-1).operacion, 'CLEAR_FX_OBLIGATION'); assert.equal(cleared.events.at(-1).after, null);
  assert.strictEqual(clearFxObligation(cleared, { fx_id: 'FX', ...trace }, 'clear'), cleared);
});
test('QA-FX39 - Originales intactos al configurar y planificar', () => {
  const state = fixture(); const before = structuredClone(state); const configured = set(state); run(configured);
  assert.deepEqual(configured.affectations, before.affectations); assert.deepEqual(configured.balances, before.balances);
});
test('QA-FX40 - No crea ejecucion, mandato, conciliacion ni UI', () => {
  const state = set(fixture()); const count = state.events.length; const result = run(state);
  assert.equal(state.events.length, count); assert.ok(!['EJECUTADA'].includes(result.estado));
  assert.ok(!Object.hasOwn(result, 'mandatos')); assert.ok(!Object.hasOwn(result, 'conciliacion')); assert.ok(Object.isFrozen(result));
});
