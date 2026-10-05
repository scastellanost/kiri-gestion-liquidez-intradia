import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPositionState, registerBalance, registerAffectation, calculateCompanyPosition } from '../src/position.js';
import { createState } from '../src/state.js';
import { setPostureConfig, buildPosture } from '../src/posture.js';
import { saveNeedState, loadNeedState } from '../src/needs.js';
import { setBankRestriction, setBankUsage, reserveBankCapacity, releaseBankCapacity,
  evaluateAssignmentRoute, buildBankRestrictionReport } from '../src/bank-restrictions.js';

const trace = { origen: 'QA-005A', fecha_hora_evento: '2026-10-09T10:00:00-04:00' };
const money = createState({ managedDate: '2026-10-09' });
const initial = () => createPositionState({ empresas: ['E'], bancos: ['A'], cuentas: [
  { cuenta: 'A1', empresa: 'E', banco: 'A', monedas: ['VES'] },
  { cuenta: 'A2', empresa: 'E', banco: 'A', monedas: ['VES'] }
] });
const night = { hora_inicio: '22:00', cutoff: '02:00', minutos_acreditacion: 0 };
const configure = (rules = night, state = initial()) => setBankRestriction(state, { banco: 'A', reglas: rules, ...trace }, 'config');
const context = (at, extra = {}) => ({ empresa: 'E', fecha_hora_evaluacion: at,
  zona_horaria: 'America/Caracas', tipo_ruta: 'INTRABANCO', settlement: 'T0', ...extra });
const assignment = { banco: 'A', cuenta: 'A1', moneda: 'VES', monto_asignado: 25 };
const evaluate = (at, state = configure(), extra = {}) => evaluateAssignmentRoute(state, assignment, context(at, extra), money);
const has = (result, id) => result.explicaciones.find(row => row.rule_id === id);
const reservation = { banco: 'A', empresa: 'E', cuenta: 'A1', moneda: 'VES', fecha: '2026-10-09',
  reservation_id: 'CAP', monto: 10, operaciones: 1, ...trace };

test('QA-5A01 - Antes de apertura nocturna espera la siguiente ventana', () => {
  const result = evaluate('2026-10-09T21:00:00-04:00');
  assert.equal(result.resultado, 'VIABLE_CON_RESTRICCION');
  assert.ok(result.acciones_requeridas.includes('ESPERAR_APERTURA'));
  assert.ok(has(result, 'INTERVALO_ENTRE_VENTANAS'));
  assert.equal(result.eta, '2026-10-10T02:00:00.000Z');
  assert.equal(result.fecha, '2026-10-09');
});
test('QA-5A02 - 22:30 dentro del tramo inicial', () => {
  const result = evaluate('2026-10-09T22:30:00-04:00');
  assert.equal(result.resultado, 'VIABLE'); assert.equal(result.fecha, '2026-10-09');
  assert.equal(evaluate('2026-10-09T22:00:00-04:00').resultado, 'VIABLE');
});
test('QA-5A03 - 23:59 dentro de ventana', () => {
  assert.equal(evaluate('2026-10-09T23:59:00-04:00').resultado, 'VIABLE');
  assert.equal(evaluate('2026-10-09T23:59:59.999-04:00').resultado, 'VIABLE');
});
test('QA-5A04 - Continuacion pertenece al dia de inicio', () => {
  const result = evaluate('2026-10-10T00:30:00-04:00');
  assert.equal(result.resultado, 'VIABLE'); assert.equal(result.fecha, '2026-10-09');
  assert.equal(result.eta, '2026-10-10T04:30:00.000Z');
  assert.equal(evaluate('2026-11-01T00:30:00-04:00').fecha, '2026-10-31');
  assert.equal(evaluate('2027-01-01T00:30:00-04:00').fecha, '2026-12-31');
});
test('QA-5A05 - Cutoff nocturno inclusivo hasta el instante exacto', () => {
  const result = evaluate('2026-10-10T02:00:00-04:00');
  assert.equal(result.resultado, 'VIABLE'); assert.equal(result.fecha, '2026-10-09');
  const after = evaluate('2026-10-10T02:00:00.001-04:00');
  assert.equal(after.resultado, 'VIABLE_CON_RESTRICCION'); assert.equal(after.fecha, '2026-10-10');
});
test('QA-5A06 - Intervalo espera apertura y calcula ETA desde ella', () => {
  for (const time of ['02:01', '08:00', '12:00', '21:59']) {
    const result = evaluate(`2026-10-10T${time}:00-04:00`, configure({ ...night, minutos_acreditacion: 30 }));
    assert.equal(result.resultado, 'VIABLE_CON_RESTRICCION');
    assert.equal(result.eta, '2026-10-11T02:30:00.000Z'); assert.equal(result.fecha, '2026-10-10');
    assert.ok(result.acciones_requeridas.includes('ESPERAR_APERTURA'));
  }
  assert.equal(evaluate('2026-10-10T02:01:00-04:00', configure(), {
    fecha_hora_objetivo: '2026-10-10T22:00:00-04:00'
  }).resultado, 'VIABLE_CON_RESTRICCION');
  assert.equal(evaluate('2026-10-10T02:01:00-04:00', configure({ hora_inicio: '22:00', cutoff: '02:00' })).resultado, 'VIABLE_CON_RESTRICCION');
});
test('QA-5A06B - Deadline anterior a siguiente apertura bloquea', () => {
  const result = evaluate('2026-10-10T02:01:00-04:00', configure(), { fecha_hora_objetivo: '2026-10-10T12:00:00-04:00' });
  assert.equal(result.resultado, 'BLOQUEADA');
  assert.equal(has(result, 'ACCREDITATION_DEADLINE').impacto, 'BLOQUEO');
  const missing = evaluate('2026-10-10T02:01:00-04:00', configure({ hora_inicio: '22:00', cutoff: '02:00' }), {
    fecha_hora_objetivo: '2026-10-10T12:00:00-04:00'
  });
  assert.equal(missing.resultado, 'BLOQUEADA'); assert.ok(has(missing, 'ACCREDITATION_TIME_REQUIRED'));
});
test('QA-5A07 - Continuacion sabatina usa calendario del viernes', () => {
  const state = configure({ ...night, dias_habiles_semana: [1, 2, 3, 4, 5], feriados: ['2026-10-10'] });
  assert.equal(evaluate('2026-10-10T00:30:00-04:00', state).resultado, 'VIABLE');
  const holiday = configure({ ...night, feriados: ['2026-10-09'] });
  assert.equal(evaluate('2026-10-10T00:30:00-04:00', holiday).resultado, 'BLOQUEADA');
  const t1 = evaluate('2026-10-10T00:30:00-04:00', state, { settlement: 'T1' });
  assert.equal(t1.eta, '2026-10-13T04:30:00.000Z');
});
test('QA-5A08 - Inicio sabatino inhabil bloquea T0', () => {
  const state = configure({ ...night, dias_habiles_semana: [1, 2, 3, 4, 5] });
  for (const at of ['2026-10-10T22:30:00-04:00', '2026-10-11T00:30:00-04:00', '2026-10-10T02:01:00-04:00']) {
    const result = evaluate(at, state);
    assert.equal(result.resultado, 'BLOQUEADA');
    assert.equal(has(result, 'NON_BUSINESS_DAY').valor_observado, '2026-10-10');
  }
});
test('QA-5A09 - Uso, reservas y propuestas comparten jornada a traves de medianoche', () => {
  let state = configure({ ...night, max_diario: 100, max_operaciones_dia: 3 });
  state = setBankUsage(state, { ...reservation, monto_usado_dia: 70, operaciones_usadas_dia: 2 }, 'used');
  state = reserveBankCapacity(state, reservation, 'reserve');
  for (const at of ['2026-10-09T23:00:00-04:00', '2026-10-10T00:30:00-04:00']) {
    const result = evaluate(at, state);
    assert.equal(result.resultado, 'BLOQUEADA');
    assert.equal(has(result, 'DAILY_AMOUNT_LIMIT').valor_observado.total, 105);
    assert.equal(has(result, 'DAILY_OPERATION_LIMIT').valor_observado.total, 4);
  }
  const next = evaluate('2026-10-10T02:01:00-04:00', state);
  assert.equal(next.resultado, 'VIABLE_CON_RESTRICCION');
  assert.equal(has(next, 'DAILY_AMOUNT_LIMIT').valor_observado.usado, 0);
  const posture = { empresa: 'E', afectaciones: [{ affectation_id: 'OB', empresa: 'E', monto_no_localizado: 0,
    asignaciones: [assignment, { ...assignment, cuenta: 'A2' }] }] };
  const report = buildBankRestrictionReport(configure({ ...night, max_diario: 40, max_operaciones_dia: 1 }), posture,
    context('2026-10-09T23:00:00-04:00', { por_cuenta: { A2: { fecha_hora_evaluacion: '2026-10-10T00:30:00-04:00' } } }), money);
  const second = report.afectaciones[0].asignaciones[1];
  assert.equal(has(second, 'DAILY_AMOUNT_LIMIT').valor_observado.propuesto_previo, 25);
  assert.equal(has(second, 'DAILY_OPERATION_LIMIT').valor_observado.total, 2);
  assert.equal(second.resultado, 'BLOQUEADA');
});
test('QA-5A10 - Hora inexistente avanza al primer instante valido, incluso salto de media hora', () => {
  const result = evaluate('2026-03-08T01:00:00-05:00', configure({ hora_inicio: '02:30', cutoff: '04:00', minutos_acreditacion: 0 }), { zona_horaria: 'America/New_York' });
  assert.equal(result.eta, '2026-03-08T07:00:00.000Z'); assert.equal(result.resultado, 'VIABLE_CON_RESTRICCION');
  assert.equal(has(result, 'DST_NONEXISTENT_LOCAL_TIME_SHIFTED').impacto, 'RESTRICCION');
  assert.ok(result.acciones_requeridas.includes('USAR_PRIMER_INSTANTE_VALIDO'));
  const halfHour = evaluate('2026-10-04T01:00:00+10:30', configure({ hora_inicio: '02:15', minutos_acreditacion: 0 }), { zona_horaria: 'Australia/Lord_Howe' });
  assert.equal(halfHour.eta, '2026-10-03T15:30:00.000Z');
  const t1 = evaluate('2026-03-07T02:30:15.123-05:00', configure({ minutos_acreditacion: 0 }), { zona_horaria: 'America/New_York', settlement: 'T1' });
  assert.equal(t1.eta, '2026-03-08T07:00:00.000Z');
});
test('QA-5A11 - Desplazamiento que incumple deadline bloquea', () => {
  const result = evaluate('2026-03-08T01:00:00-05:00', configure({ hora_inicio: '02:30', minutos_acreditacion: 15 }), {
    zona_horaria: 'America/New_York', fecha_hora_objetivo: '2026-03-08T03:10:00-04:00'
  });
  assert.equal(result.eta, '2026-03-08T07:15:00.000Z'); assert.equal(result.resultado, 'BLOQUEADA');
  assert.ok(has(result, 'DST_NONEXISTENT_LOCAL_TIME_SHIFTED'));
  assert.equal(has(result, 'ACCREDITATION_DEADLINE').impacto, 'BLOQUEO');
  const cutoff = evaluate('2026-03-08T03:00:00.001-04:00', configure({ cutoff: '02:30' }), { zona_horaria: 'America/New_York' });
  assert.equal(cutoff.resultado, 'BLOQUEADA'); assert.ok(has(cutoff, 'AFTER_CUTOFF'));
});
test('QA-5A12 - Hora repetida usa primera ocurrencia con INFO', () => {
  const state = configure({ hora_inicio: '01:30', cutoff: '03:00', minutos_acreditacion: 0 });
  const result = evaluate('2026-11-01T00:30:00-04:00', state, { zona_horaria: 'America/New_York' });
  assert.equal(result.eta, '2026-11-01T05:30:00.000Z');
  assert.equal(has(result, 'DST_AMBIGUOUS_LOCAL_TIME_FIRST_OCCURRENCE').impacto, 'INFO');
  const second = evaluate('2026-11-01T01:15:00-05:00', state, { zona_horaria: 'America/New_York' });
  assert.equal(second.resultado, 'VIABLE'); assert.equal(second.eta, '2026-11-01T06:15:00.000Z');
  const afterCutoff = evaluate('2026-11-01T01:15:00-05:00', configure({ cutoff: '01:30' }), { zona_horaria: 'America/New_York' });
  assert.equal(afterCutoff.resultado, 'BLOQUEADA');
  const halfHour = evaluate('2026-04-05T00:30:00+11:00', configure({ hora_inicio: '01:45', minutos_acreditacion: 0 }), { zona_horaria: 'Australia/Lord_Howe' });
  assert.equal(halfHour.eta, '2026-04-04T14:45:00.000Z');
});
test('QA-5A13 - Zona sin cambio estacional conserva comportamiento', () => {
  const state = configure({ hora_inicio: '09:00', cutoff: '17:00', minutos_acreditacion: 30 });
  const before = evaluate('2026-10-09T08:00:00-04:00', state);
  assert.equal(before.eta, '2026-10-09T13:30:00.000Z'); assert.ok(has(before, 'BEFORE_OPENING'));
  assert.equal(evaluate('2026-10-09T17:00:00-04:00', state).resultado, 'VIABLE');
  assert.equal(evaluate('2026-10-09T17:00:00.001-04:00', state).resultado, 'BLOQUEADA');
  assert.ok(before.explicaciones.every(row => !row.rule_id.startsWith('DST_')));
  assert.throws(() => evaluate(undefined, state), { code: 'INVALID_TIMESTAMP' });
  assert.throws(() => evaluate('2026-10-09T08:00:00-04:00', state, { zona_horaria: undefined }), { code: 'TIME_ZONE_REQUIRED' });
});
test('QA-5A14 - Configuracion y reservas siguen siendo idempotentes tras recarga', () => {
  const row = { banco: 'A', reglas: night, ...trace };
  let state = configure(); assert.strictEqual(setBankRestriction(state, row, 'config'), state);
  state = reserveBankCapacity(state, reservation, 'reserve');
  const data = new Map(); const storage = { setItem: (k, v) => data.set(k, v), getItem: k => data.get(k) ?? null };
  saveNeedState(storage, state); state = loadNeedState(storage);
  assert.strictEqual(reserveBankCapacity(state, reservation, 'reserve'), state);
  assert.throws(() => reserveBankCapacity(state, { ...reservation, monto: 11 }, 'reserve'), { code: 'IDEMPOTENCY_CONFLICT' });
  const release = { reservation_id: 'CAP', ...trace };
  state = releaseBankCapacity(state, release, 'release');
  assert.strictEqual(releaseBankCapacity(state, release, 'release'), state);
});
test('QA-5A15 - Evaluacion no muta restricciones, uso, postura ni posicion', () => {
  let state = initial();
  state = registerBalance(state, { empresa: 'E', banco: 'A', cuenta: 'A1', amount_original: 100, currency_original: 'VES', fecha_hora_saldo: trace.fecha_hora_evento, ...trace }, 'balance');
  state = registerAffectation(state, { affectation_id: 'OB', empresa: 'E', tipo_partida: 'PAGO', naturaleza_afectacion: 'COMPROMISO', amount_original: 25, currency_original: 'VES', operacion: 'ALTA', ...trace }, 'ob');
  state = setPostureConfig(state, { empresa: 'E', orden_bancos: ['A'], orden_cuentas_por_banco: { A: ['A1', 'A2'] }, ...trace }, 'posture');
  state = configure(night, state); state = reserveBankCapacity(state, reservation, 'reserve');
  state = setBankUsage(state, { ...reservation, monto_usado_dia: 5, operaciones_usadas_dia: 1 }, 'usage');
  const posture = buildPosture(state, 'E', money); const position = calculateCompanyPosition(state, 'E', money);
  const before = structuredClone({ state, posture });
  const ctx = context('2026-10-10T00:30:00-04:00');
  const result = buildBankRestrictionReport(state, posture, ctx, money);
  assert.deepEqual(buildBankRestrictionReport(state, posture, ctx, money), result);
  assert.deepEqual({ state, posture }, before); assert.deepEqual(calculateCompanyPosition(state, 'E', money), position);
});
