import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPositionState, registerBalance, registerAffectation, calculateCompanyPosition } from '../src/position.js';
import { createState } from '../src/state.js';
import { setPostureConfig, buildPosture } from '../src/posture.js';
import { saveNeedState, loadNeedState } from '../src/needs.js';
import { setBankRestriction, clearBankRestriction, setBankUsage, reserveBankCapacity, releaseBankCapacity,
  getBankUsage, evaluateAssignmentRoute, evaluateAffectationRoute, buildBankRestrictionReport } from '../src/bank-restrictions.js';

const trace = () => ({ origen: 'QA-005', usuario: 'tesoreria', fecha_hora_evento: '2026-10-05T10:00:00-04:00' });
const monetary = createState({ managedDate: '2026-10-05', rates: { VES_USD_BCV: { value: 36.5, source: 'BCV', timestamp: '2026-10-05T09:00:00-04:00' } } });
function initial() {
  return createPositionState({ empresas: ['E', 'F'], bancos: ['A', 'B'], cuentas: [
    { cuenta: 'A1', empresa: 'E', banco: 'A', monedas: ['VES', 'USD'] },
    { cuenta: 'A2', empresa: 'E', banco: 'A', monedas: ['VES'] },
    { cuenta: 'B1', empresa: 'E', banco: 'B', monedas: ['VES'] },
    { cuenta: 'F1', empresa: 'F', banco: 'A', monedas: ['VES'] }
  ] });
}
const context = extra => ({ empresa: 'E', fecha_hora_evaluacion: '2026-10-05T10:00:00-04:00', zona_horaria: 'America/Caracas', tipo_ruta: 'INTRABANCO', settlement: 'T0', ...extra });
const assignment = (amount = 25, extra = {}) => ({ banco: 'A', cuenta: 'A1', moneda: 'VES', monto_asignado: amount, ...extra });
const evaluate = (state, amount = 25, ctx = {}, asg = {}) => evaluateAssignmentRoute(state, assignment(amount, asg), context(ctx), monetary);
const configure = (state, reglas, selectors = {}) => setBankRestriction(state, { banco: 'A', ...selectors, reglas, ...trace() }, `config-${state.events.length}`);
const configured = reglas => configure(initial(), reglas);
const used = (state, amount, ops, extra = {}) => setBankUsage(state, { banco: 'A', empresa: 'E', cuenta: 'A1', moneda: 'VES', fecha: '2026-10-05', monto_usado_dia: amount, operaciones_usadas_dia: ops, ...trace(), ...extra }, `used-${state.events.length}`);
const reservation = extra => ({ reservation_id: 'CAP-1', banco: 'A', empresa: 'E', cuenta: 'A1', moneda: 'VES', fecha: '2026-10-05', monto: 80, operaciones: 2, ...trace(), ...extra });
function localized(amount = 15) {
  let state = initial();
  for (const cuenta of ['A1', 'A2']) state = registerBalance(state, { empresa: 'E', banco: 'A', cuenta, amount_original: 10, currency_original: 'VES', fecha_hora_saldo: '2026-10-05T09:00:00-04:00', ...trace() }, cuenta);
  state = registerAffectation(state, { affectation_id: 'OB', empresa: 'E', tipo_partida: 'PAGO', naturaleza_afectacion: 'COMPROMISO', amount_original: amount, currency_original: 'VES', operacion: 'ALTA', ...trace() }, 'ob');
  state = setPostureConfig(state, { empresa: 'E', orden_bancos: ['A'], orden_cuentas_por_banco: { A: ['A1', 'A2'] }, ...trace() }, 'posture');
  return { state, posture: buildPosture(state, 'E', monetary) };
}
const has = (result, id) => result.explicaciones.find(r => r.rule_id === id);
function immutableError(state, fn, code) {
  const before = structuredClone(state); assert.throws(fn, { code }); assert.deepEqual(state, before);
}

test('QA-R01 — Sin restricciones: VIABLE, sin alertas decorativas', () => {
  const result = evaluate(initial()); assert.equal(result.resultado, 'VIABLE'); assert.deepEqual(result.alertas, []);
  assert.equal(result.operaciones_requeridas, 1);
});
test('QA-R02 — 25 / máximo 10: restricción y tres operaciones válidas', () => {
  const result = evaluate(configured({ max_por_operacion: 10 }));
  assert.equal(result.resultado, 'VIABLE_CON_RESTRICCION'); assert.equal(result.operaciones_requeridas, 3);
  assert.ok(result.tramos.every(t => t.monto <= 10)); assert.equal(result.tramos.reduce((sum, t) => sum + t.monto * t.operaciones, 0), 25);
  assert.equal(result.tramos.reduce((sum, t) => sum + t.operaciones, 0), 3);
});
test('QA-R03 — Usado 80 + propuesto 30 > máximo diario 100: BLOQUEADA', () => {
  const result = evaluate(used(configured({ max_diario: 100 }), 80, 1), 30);
  assert.equal(result.resultado, 'BLOQUEADA'); assert.equal(has(result, 'DAILY_AMOUNT_LIMIT').valor_observado.total, 110);
});
test('QA-R04 — Dos usadas + dos requeridas > máximo tres: BLOQUEADA', () => {
  const result = evaluate(used(configured({ max_por_operacion: 10, max_operaciones_dia: 3 }), 5, 2), 20);
  assert.equal(result.resultado, 'BLOQUEADA'); assert.equal(result.operaciones_requeridas, 2);
});
test('QA-R05 — 08:00 antes de apertura 09:00: VIABLE_CON_RESTRICCION', () => {
  const result = evaluate(configured({ hora_inicio: '09:00' }), 25, { fecha_hora_evaluacion: '2026-10-05T08:00:00-04:00' });
  assert.equal(result.resultado, 'VIABLE_CON_RESTRICCION'); assert.ok(result.acciones_requeridas.includes('ESPERAR_APERTURA'));
  const delayed = evaluate(configured({ hora_inicio: '09:00', minutos_acreditacion: 30 }), 25, {
    fecha_hora_evaluacion: '2026-10-05T08:00:00-04:00', fecha_hora_objetivo: '2026-10-05T09:15:00-04:00'
  });
  assert.equal(delayed.eta, '2026-10-05T13:30:00.000Z'); assert.equal(delayed.resultado, 'BLOQUEADA');
});
test('QA-R06 — 17:01 después de cutoff 17:00 en T0: BLOQUEADA', () => {
  const state = configured({ cutoff: '17:00' });
  assert.equal(evaluate(state, 25, { fecha_hora_evaluacion: '2026-10-05T17:01:00-04:00' }).resultado, 'BLOQUEADA');
  assert.equal(evaluate(state, 25, { fecha_hora_evaluacion: '2026-10-05T17:00:00-04:00' }).resultado, 'VIABLE');
  assert.equal(evaluate(state, 25, { fecha_hora_evaluacion: '2026-10-05T17:00:00.001-04:00' }).resultado, 'BLOQUEADA');
});
test('QA-R07 — ETA 10:30 cumple objetivo 11:00', () => {
  const result = evaluate(configured({ minutos_acreditacion: 30 }), 25, { fecha_hora_objetivo: '2026-10-05T11:00:00-04:00' });
  assert.equal(result.resultado, 'VIABLE'); assert.equal(result.eta, '2026-10-05T14:30:00.000Z');
});
test('QA-R08 — ETA 11:30 incumple objetivo 11:00: BLOQUEADA', () => {
  const result = evaluate(configured({ minutos_acreditacion: 90 }), 25, { fecha_hora_objetivo: '2026-10-05T11:00:00-04:00' });
  assert.equal(result.resultado, 'BLOQUEADA'); assert.equal(has(result, 'ACCREDITATION_DEADLINE').impacto, 'BLOQUEO');
  const unknown = evaluate(initial(), 25, { fecha_hora_objetivo: '2026-10-05T11:00:00-04:00' });
  assert.equal(unknown.resultado, 'BLOQUEADA'); assert.ok(has(unknown, 'ACCREDITATION_TIME_REQUIRED'));
});
test('QA-R09 — Intrabanco permitido: VIABLE', () => {
  assert.equal(evaluate(configured({ permite_intrabanco: true })).resultado, 'VIABLE');
});
test('QA-R10 — Intrabanco no permitido: BLOQUEADA', () => {
  assert.equal(evaluate(configured({ permite_intrabanco: false })).resultado, 'BLOQUEADA');
});
test('QA-R11 — Interbanco no permitido: BLOQUEADA', () => {
  assert.equal(evaluate(configured({ permite_interbanco: false }), 25, { tipo_ruta: 'INTERBANCO' }).resultado, 'BLOQUEADA');
});
test('QA-R12 — T0 permitido: VIABLE', () => {
  assert.equal(evaluate(configured({ settlement: 'T0' })).resultado, 'VIABLE');
});
test('QA-R13 — Solo T1 ante necesidad T0 bloquea; T1 explícito calcula siguiente hábil', () => {
  const state = configured({ settlement: 'T1', minutos_acreditacion: 30, dias_habiles_semana: [1, 2, 3, 4, 5], feriados: ['2026-10-12'] });
  assert.equal(evaluate(state).resultado, 'BLOQUEADA');
  const result = evaluate(state, 25, { settlement: 'T1', fecha_hora_evaluacion: '2026-10-09T10:00:00-04:00', fecha_hora_objetivo: '2026-10-13T11:00:00-04:00' });
  assert.equal(result.resultado, 'VIABLE_CON_RESTRICCION'); assert.equal(result.eta, '2026-10-13T14:30:00.000Z');
  assert.equal(evaluate(state, 25, { settlement: 'T1', fecha_hora_evaluacion: '2026-10-09T10:00:00-04:00', fecha_hora_objetivo: '2026-10-12T11:00:00-04:00' }).resultado, 'BLOQUEADA');
  const ambiguous = evaluate(configured({ minutos_acreditacion: 0 }), 25, {
    settlement: 'T1', zona_horaria: 'America/New_York', fecha_hora_evaluacion: '2026-10-31T01:30:00-04:00'
  });
  assert.equal(ambiguous.resultado, 'BLOQUEADA'); assert.ok(has(ambiguous, 'BLOCKED_BY_FUNCTIONAL_RULE'));
});
test('QA-R14 — Moneda no permitida: BLOQUEADA', () => {
  assert.equal(evaluate(configured({ monedas_permitidas: ['USD'] })).resultado, 'BLOQUEADA');
});
test('QA-R15 — Empresa no permitida: BLOQUEADA', () => {
  assert.equal(evaluate(configured({ empresas_permitidas: ['F'] })).resultado, 'BLOQUEADA');
});
test('QA-R16 — Cuenta no permitida: BLOQUEADA', () => {
  assert.equal(evaluate(configured({ cuentas_permitidas: ['A2'] })).resultado, 'BLOQUEADA');
});
test('QA-R17 — Aprobación adicional restringe, no bloquea', () => {
  const result = evaluate(configured({ requiere_aprobacion_adicional: true }));
  assert.equal(result.resultado, 'VIABLE_CON_RESTRICCION'); assert.ok(result.acciones_requeridas.includes('APROBACION_ADICIONAL'));
});
test('QA-R18 — Día inhábil bloquea T0; T1 respeta siguiente hábil', () => {
  const state = configured({ dias_habiles_semana: [1, 2, 3, 4, 5], settlement: 'BOTH', minutos_acreditacion: 0 });
  const saturday = { fecha_hora_evaluacion: '2026-10-10T10:00:00-04:00' };
  assert.equal(evaluate(state, 25, saturday).resultado, 'BLOQUEADA');
  const t1 = evaluate(state, 25, { ...saturday, settlement: 'T1', fecha_hora_objetivo: '2026-10-12T11:00:00-04:00' });
  assert.equal(t1.resultado, 'VIABLE_CON_RESTRICCION'); assert.equal(t1.eta, '2026-10-12T14:00:00.000Z');
});
test('QA-R19 — Feriado bloquea T0 según fecha de zona explícita', () => {
  const state = configured({ feriados: ['2026-10-05'] });
  assert.equal(evaluate(state).resultado, 'BLOQUEADA');
  assert.equal(evaluate(state, 25, { fecha_hora_evaluacion: '2026-10-06T02:00:00Z' }).resultado, 'BLOQUEADA');
});
test('QA-R20 — Reserva técnica consume límite diario sin mezclarse con usado', () => {
  const state = reserveBankCapacity(configured({ max_diario: 100 }), reservation(), 'reserve');
  const result = evaluate(state, 30); assert.equal(result.resultado, 'BLOQUEADA');
  assert.equal(has(result, 'DAILY_AMOUNT_LIMIT').valor_observado.reservado, 80);
  assert.deepEqual(getBankUsage(state, { banco: 'A', moneda: 'VES', fecha: '2026-10-05' }), { monto_usado_dia: 0, operaciones_usadas_dia: 0, monto_reservado_por_aprobadas: 80, operaciones_reservadas: 2 });
});
test('QA-R21 — Reserva técnica consume número de operaciones', () => {
  const state = reserveBankCapacity(configured({ max_por_operacion: 10, max_operaciones_dia: 3 }), reservation(), 'reserve');
  assert.equal(evaluate(state, 20).resultado, 'BLOQUEADA');
});
test('QA-R22 — Liberación explícita restaura capacidad', () => {
  const state = reserveBankCapacity(configured({ max_diario: 100 }), reservation(), 'reserve');
  assert.equal(evaluate(state, 30).resultado, 'BLOQUEADA');
  const row = { reservation_id: 'CAP-1', ...trace() }; const released = releaseBankCapacity(state, row, 'release');
  assert.equal(evaluate(released, 30).resultado, 'VIABLE'); assert.equal(released.events.at(-1).operacion, 'RELEASE_BANK_CAPACITY');
  assert.strictEqual(releaseBankCapacity(released, row, 'release'), released);
  immutableError(released, () => releaseBankCapacity(released, row, 'again'), 'CAPACITY_ALREADY_RELEASED');
});
test('QA-R23 — Reserva/configuración idempotentes, incluso tras recarga', () => {
  const state = reserveBankCapacity(configured({ max_diario: 100 }), reservation(), 'reserve');
  assert.strictEqual(reserveBankCapacity(state, reservation(), 'reserve'), state);
  immutableError(state, () => reserveBankCapacity(state, reservation(), 'different-request'), 'DUPLICATE_CAPACITY_RESERVATION');
  const data = new Map(); const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  saveNeedState(storage, state); const restored = loadNeedState(storage); assert.deepEqual(restored, state);
  assert.strictEqual(reserveBankCapacity(restored, reservation(), 'reserve'), restored);
});
test('QA-R24 — Mismo request_id distinto payload: IDEMPOTENCY_CONFLICT', () => {
  const state = reserveBankCapacity(initial(), reservation(), 'reserve');
  immutableError(state, () => reserveBankCapacity(state, reservation({ monto: 81 }), 'reserve'), 'IDEMPOTENCY_CONFLICT');
  const row = { banco: 'A', reglas: { max_diario: 100 }, ...trace() };
  const configured = setBankRestriction(state, row, 'rule'); assert.strictEqual(setBankRestriction(configured, row, 'rule'), configured);
  immutableError(configured, () => clearBankRestriction(configured, { banco: 'A', ...trace() }, 'rule'), 'IDEMPOTENCY_CONFLICT');
});
test('QA-R25 — Cuenta prevalece por campo; moneda específica gana en mismo nivel', () => {
  let state = configured({ max_por_operacion: 10, requiere_aprobacion_adicional: true });
  state = configure(state, { max_por_operacion: 30 }, { cuenta: 'A1' });
  let result = evaluate(state); assert.equal(result.operaciones_requeridas, 1); assert.ok(result.acciones_requeridas.includes('APROBACION_ADICIONAL'));
  state = configure(state, { max_por_operacion: 5 }, { cuenta: 'A1', moneda: 'VES' });
  assert.equal(evaluate(state).operaciones_requeridas, 5);
});
test('QA-R26 — Empresa+banco prevalece; uso respeta alcance de la regla', () => {
  let state = used(configured({ max_por_operacion: 10, max_diario: 100 }), 90, 1, { empresa: 'F', cuenta: 'F1' });
  assert.equal(evaluate(state).resultado, 'BLOQUEADA');
  state = configure(state, { max_por_operacion: 30, max_diario: 100 }, { empresa: 'E' });
  assert.equal(evaluate(state).resultado, 'VIABLE'); assert.equal(evaluate(state).operaciones_requeridas, 1);
});
test('QA-R27 — Postura parcial: BLOQUEADA_POR_LOCALIZACION_INCOMPLETA', () => {
  const { state, posture } = localized(25);
  const result = evaluateAffectationRoute(state, posture.afectaciones[0], context(), monetary);
  assert.equal(result.resultado, 'BLOQUEADA'); assert.ok(has(result, 'BLOQUEADA_POR_LOCALIZACION_INCOMPLETA'));
});
test('QA-R28 — Dos asignaciones, una bloqueada: global BLOQUEADA; acumulación temporal', () => {
  const { state, posture } = localized();
  const restricted = configure(state, { permite_intrabanco: false }, { cuenta: 'A2' });
  assert.equal(evaluateAffectationRoute(restricted, posture.afectaciones[0], context(), monetary).resultado, 'BLOQUEADA');
  const limited = configure(state, { max_diario: 12 });
  const result = evaluateAffectationRoute(limited, posture.afectaciones[0], context(), monetary);
  assert.equal(result.asignaciones[0].resultado, 'VIABLE'); assert.equal(result.asignaciones[1].resultado, 'BLOQUEADA');
  assert.equal(has(result.asignaciones[1], 'DAILY_AMOUNT_LIMIT').valor_observado.propuesto_previo, 10);
});
test('QA-R29 — Dos asignaciones, una restringida: global VIABLE_CON_RESTRICCION', () => {
  const { state, posture } = localized();
  assert.equal(evaluateAffectationRoute(configure(state, { requiere_aprobacion_adicional: true }, { cuenta: 'A2' }), posture.afectaciones[0], context(), monetary).resultado, 'VIABLE_CON_RESTRICCION');
});
test('QA-R30 — Todas las asignaciones viables: global VIABLE', () => {
  const { state, posture } = localized();
  assert.equal(evaluateAffectationRoute(state, posture.afectaciones[0], context(), monetary).resultado, 'VIABLE');
  assert.equal(buildBankRestrictionReport(state, posture, context(), monetary).resultado, 'VIABLE');
});
test('QA-R31 — Regla satisfecha genera INFO no bloqueante', () => {
  const result = evaluate(configured({ max_diario: 100 }));
  assert.equal(result.resultado, 'VIABLE'); assert.equal(result.alertas[0].severidad, 'INFO');
  assert.equal(result.alertas[0].rule_id, 'DAILY_AMOUNT_LIMIT');
});
test('QA-R32 — Regla restrictiva genera RESTRICCION', () => {
  assert.equal(evaluate(configured({ max_por_operacion: 10 })).alertas[0].severidad, 'RESTRICCION');
});
test('QA-R33 — Regla bloqueante genera BLOQUEO', () => {
  assert.equal(evaluate(configured({ max_diario: 10 })).alertas[0].severidad, 'BLOQUEO');
});
test('QA-R34 — Cada explicación expone regla, dimensión, configurado y observado', () => {
  const result = evaluate(configured({ max_por_operacion: 10, max_diario: 100, permite_intrabanco: true, requiere_aprobacion_adicional: true }));
  for (const explanation of result.explicaciones) {
    for (const key of ['rule_id', 'dimension', 'valor_configurado', 'valor_observado', 'resultado', 'impacto']) assert.ok(Object.hasOwn(explanation, key));
  }
});
test('QA-R35 — Evaluar/reporte no mutan postura ni posición', () => {
  const { state, posture } = localized(); const next = configure(state, { max_diario: 12 });
  const before = structuredClone(next); const previousPosture = structuredClone(posture);
  const pos = calculateCompanyPosition(next, 'E', monetary);
  buildBankRestrictionReport(next, posture, context(), monetary);
  assert.deepEqual(next, before); assert.deepEqual(posture, previousPosture); assert.deepEqual(calculateCompanyPosition(next, 'E', monetary), pos);
});
test('QA-R36 — Originales intactos y conversión central para moneda de operación', () => {
  const { state, posture } = localized(); const before = structuredClone(state);
  const result = evaluateAssignmentRoute(state, assignment(36.5), context({ moneda_operacion: 'USD' }), monetary);
  assert.equal(result.monto_propuesto, 1); assert.equal(result.moneda, 'USD');
  buildBankRestrictionReport(state, posture, context(), monetary); assert.deepEqual(state, before);
});
test('QA-R37 — Timestamp explícito obligatorio, sin reloj del sistema', () => {
  assert.throws(() => evaluateAssignmentRoute(initial(), assignment(), context({ fecha_hora_evaluacion: undefined })), { code: 'INVALID_TIMESTAMP' });
  assert.throws(() => evaluate(initial(), 25, { zona_horaria: undefined }), { code: 'TIME_ZONE_REQUIRED' });
});
test('QA-R38 — Cutoff inválido rechazado', () => {
  const state = initial();
  for (const cutoff of ['25:00', '17:60', '17', null]) immutableError(state, () => configure(state, { cutoff }), 'INVALID_BANK_TIME');
  immutableError(state, () => configure(state, { hora_inicio: '23:00', cutoff: '06:00' }), 'BLOCKED_BY_FUNCTIONAL_RULE');
});
test('QA-R39 — Feriados inválidos rechazados', () => {
  const state = initial();
  for (const holiday of ['2026-02-30', '2026-13-01', 'ayer']) immutableError(state, () => configure(state, { feriados: [holiday] }), 'INVALID_HOLIDAY');
});
test('QA-R40 — Sin fuentes alternativas/intercompany; clear e inactivas sin restricciones', () => {
  const { state, posture } = localized(); const report = buildBankRestrictionReport(state, posture, context(), monetary);
  function inspect(value) {
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!/fuente_alternativa|intercompany|cobertura|mandato/i.test(key));
      if (child && typeof child === 'object') inspect(child);
    }
  }
  inspect(report);
  const restricted = configured({ max_diario: 0 });
  const cleared = clearBankRestriction(restricted, { banco: 'A', ...trace() }, 'clear'); assert.equal(evaluate(cleared).resultado, 'VIABLE');
  assert.equal(evaluate(configured({ max_diario: 0, estado_activo: false })).resultado, 'VIABLE');
});
