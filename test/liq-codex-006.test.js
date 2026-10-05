import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPositionState, registerBalance, registerAffectation, calculateCompanyPosition } from '../src/position.js';
import { createState } from '../src/state.js';
import { createNeed, saveNeedState, loadNeedState } from '../src/needs.js';
import { setCoveragePolicy, clearCoveragePolicy, buildCoveragePlan, buildCoverageReport } from '../src/coverage.js';
import { setPostureConfig, buildPosture } from '../src/posture.js';
import { setBankRestriction, reserveBankCapacity, setBankUsage } from '../src/bank-restrictions.js';

const trace = { origen: 'QA-006', usuario: 'tesoreria', fecha_hora_evento: '2026-10-05T10:00:00-04:00' };
const monetary = createState({ managedDate: '2026-10-05' });
function initial() {
  let state = createPositionState({ empresas: ['E'], bancos: ['A'], cuentas: [
    { cuenta: 'EA', empresa: 'E', banco: 'A', monedas: ['VES'] }
  ] });
  return registerBalance(state, { empresa: 'E', banco: 'A', cuenta: 'EA', amount_original: 100,
    currency_original: 'VES', fecha_hora_saldo: trace.fecha_hora_evento, ...trace }, 'balance');
}
const policy = { empresa: 'E', buffer_operativo_ves: 30, ...trace };

const ctx = extra => ({ fecha_hora_evaluacion: trace.fecha_hora_evento, zona_horaria: 'America/Caracas', settlement: 'T0', ...extra });
const accounts = ['EA0', 'EA1', 'EA2', 'EB1', 'FA1', 'FA2', 'FB1', 'GA1', 'GB1'];
function fixture(values = {}, amount = 15, currencies = {}, flags = {}) {
  let state = createPositionState({ empresas: ['E', 'F', 'G'], bancos: ['A', 'B'], cuentas: accounts.map(cuenta => ({
    cuenta, empresa: cuenta[0], banco: cuenta[1], monedas: [currencies[cuenta] ?? 'VES'], ...(flags[cuenta] ?? {})
  })) });
  for (const [cuenta, value] of Object.entries(values)) state = registerBalance(state, { cuenta, empresa: cuenta[0], banco: cuenta[1],
    amount_original: value, currency_original: currencies[cuenta] ?? 'VES', fecha_hora_saldo: trace.fecha_hora_evento, ...trace }, `balance-${cuenta}`);
  for (const empresa of ['E', 'F', 'G']) state = setPostureConfig(state, { empresa, orden_bancos: ['A', 'B'],
    orden_cuentas_por_banco: { A: accounts.filter(a => a[0] === empresa && a[1] === 'A'), B: accounts.filter(a => a[0] === empresa && a[1] === 'B') }, ...trace }, `posture-${empresa}`);
  return amount ? obligation(state, 'OB', amount) : state;
}
function obligation(state, id, amount, extra = {}) {
  return registerAffectation(state, { affectation_id: id, empresa: 'E', banco_asignado: 'A', tipo_partida: 'PAGO',
    naturaleza_afectacion: 'COMPROMISO', amount_original: amount, currency_original: 'VES', operacion: 'ALTA', ...trace, ...extra }, `aff-${id}`);
}
const restriction = (state, reglas, cuenta = 'FA1', selectors = {}) => setBankRestriction(state, { banco: cuenta[1], cuenta, reglas, ...trace, ...selectors }, `restriction-${state.events.length}`);
const buffer = (state, empresa, amount) => setCoveragePolicy(state, { empresa, buffer_operativo_ves: amount, ...trace }, `buffer-${empresa}`);
const run = (state, extra = {}, money = monetary) => buildCoveragePlan(state, 'OB', ctx(extra), money);
const contributions = result => result.tramos.map(t => [t.nivel_cobertura, t.cuenta_fuente, t.monto_propuesto_ves]);
const blockedOwn = values => restriction(fixture({ EA0: 15, ...values }), { max_diario: 0 }, 'EA0');

test('QA-C01 - Totalmente localizada y ejecutable no necesita cobertura', () => {
  const result = run(fixture({ EA0: 15, FA1: 100 }));
  assert.equal(result.estado, 'SIN_NECESIDAD_DE_COBERTURA'); assert.deepEqual(result.tramos, []);
  assert.equal(result.monto_necesario, 0);
});
test('QA-C02 - Nivel 1 cubre todo sin acudir a otra empresa', () => {
  const result = run(blockedOwn({ EA1: 20, FA1: 100 }));
  assert.deepEqual(contributions(result), [[1, 'EA1', 15]]); assert.equal(result.estado, 'COBERTURA_TOTAL');
});
test('QA-C03 - Nivel 1 parcial y nivel 2 completa', () => {
  assert.deepEqual(contributions(run(blockedOwn({ EA1: 10, EB1: 5, FA1: 100 }))), [[1, 'EA1', 10], [2, 'EB1', 5]]);
});
test('QA-C04 - No saltar capacidad viable previa, incluso limitada por banco', () => {
  assert.deepEqual(contributions(run(fixture({ EB1: 30, FA1: 100 }))), [[2, 'EB1', 15]]);
  const state = restriction(fixture({ EB1: 150, FA1: 100 }, 50), { max_diario: 30 }, 'EB1');
  const result = run(state);
  assert.deepEqual(contributions(result), [[2, 'EB1', 30], [3, 'FA1', 20]]);
  assert.equal(result.estado, 'COBERTURA_TOTAL');
});
test('QA-C05 - Otra empresa mismo banco despues de recursos propios', () => {
  assert.deepEqual(contributions(run(fixture({ FA1: 25 }))), [[3, 'FA1', 15]]);
});
test('QA-C06 - Otra empresa otro banco solo en nivel 4', () => {
  assert.deepEqual(contributions(run(fixture({ FB1: 25 }))), [[4, 'FB1', 15]]);
});
test('QA-C07 - Empresa negativa no es fuente', () => {
  const state = obligation(fixture({ FA1: 10 }), 'F-OWN', 20, { empresa: 'F' });
  const result = run(state); assert.equal(result.estado, 'SIN_COBERTURA');
  assert.ok(result.fuentes_descartadas.some(s => s.empresa_fuente === 'F' && s.motivo === 'NO_CEDIBLE_CAPACITY'));
});
test('QA-C08 - Buffer 30 sobre 100 permite solo 70', () => {
  const result = run(buffer(fixture({ FA1: 100 }, 80), 'F', 30));
  assert.equal(result.monto_cubierto, 70); assert.equal(result.residual_no_cubierto, 10);
  assert.equal(result.tramos[0].saldo_fuente_despues, 30);
});
test('QA-C09 - Fuente 50 buffer 10 no cede mas de 40', () => {
  for (const need of [40, 41]) {
    const result = run(buffer(fixture({ FA1: 50 }, need), 'F', 10));
    assert.equal(result.monto_cubierto, 40); assert.equal(result.residual_no_cubierto, need - 40);
  }
});
test('QA-C10 - Capacidad fisica de 25 limita capacidad economica de 100', () => {
  const state = fixture({ FA1: 25, FA2: 75 }, 80, {}, { FA2: { no_utilizable: true } });
  assert.equal(calculateCompanyPosition(state, 'F', monetary).saldo_disponible_gestion, 100);
  const result = run(state); assert.equal(result.monto_cubierto, 25); assert.equal(result.residual_no_cubierto, 55);
});
test('QA-C11 - Saldo asignado a necesidades propias no se vuelve a usar', () => {
  const state = obligation(fixture({ FA1: 40 }, 30), 'F-OWN', 25, { empresa: 'F', naturaleza_afectacion: 'RESERVA' });
  const result = run(state); assert.equal(result.monto_cubierto, 15);
  assert.equal(result.tramos[0].capacidad_fisica_antes, 15); assert.equal(result.tramos[0].saldo_fuente_antes, 15);
});
test('QA-C12 - Orden de cuentas respeta postura y agota una antes de siguiente', () => {
  let state = fixture({ FA1: 10, FA2: 10 });
  state = setPostureConfig(state, { empresa: 'F', orden_bancos: ['A', 'B'], orden_cuentas_por_banco: { A: ['FA2', 'FA1'], B: ['FB1'] }, ...trace }, 'reverse');
  assert.deepEqual(contributions(run(state)), [[3, 'FA2', 10], [3, 'FA1', 5]]);
});
test('QA-C13 - Ruta bancaria bloqueada se descarta', () => {
  const result = run(restriction(fixture({ FA1: 100 }), { permite_intrabanco: false }));
  assert.equal(result.estado, 'SIN_COBERTURA');
  assert.ok(result.fuentes_descartadas.some(s => s.motivo === 'BANK_ROUTE_BLOCKED' && s.evaluacion.resultado === 'BLOQUEADA'));
});
test('QA-C14 - Ruta condicionada conserva aprobacion y espera', () => {
  const result = run(restriction(fixture({ FA1: 100 }), { requiere_aprobacion_adicional: true, hora_inicio: '11:00', minutos_acreditacion: 30 }));
  const route = result.tramos[0]; assert.equal(route.viabilidad_bancaria, 'VIABLE_CON_RESTRICCION');
  assert.ok(route.acciones_requeridas.includes('APROBACION_ADICIONAL')); assert.ok(route.acciones_requeridas.includes('ESPERAR_APERTURA'));
  assert.equal(route.eta, '2026-10-05T15:30:00.000Z');
});
test('QA-C15 - Division bancaria mantiene tres operaciones y limita numero diario', () => {
  const state = restriction(fixture({ FA1: 100 }, 25), { max_por_operacion: 10 });
  const route = run(state).tramos[0]; assert.equal(route.operaciones_requeridas, 3);
  assert.equal(route.operaciones_bancarias.reduce((sum, t) => sum + t.operaciones, 0), 3);
  assert.ok(route.acciones_requeridas.includes('DIVIDIR_OPERACION'));
  const limited = restriction(state, { max_por_operacion: 10, max_operaciones_dia: 2 });
  assert.equal(run(limited).monto_cubierto, 20);
});
test('QA-C16 - Necesidad 100 fuentes 60 conserva residual 40', () => {
  const result = run(fixture({ FA1: 60 }, 100));
  assert.equal(result.estado, 'COBERTURA_PARCIAL'); assert.equal(result.monto_cubierto, 60); assert.equal(result.residual_no_cubierto, 40);
});
test('QA-C17 - Sin fuentes no inventa cobertura', () => {
  const result = run(fixture()); assert.equal(result.estado, 'SIN_COBERTURA'); assert.equal(result.residual_no_cubierto, 15);
  assert.deepEqual(result.tramos, []);
});
test('QA-C18 - Multiples fuentes y necesidades comparten capacidad sin doble uso', () => {
  assert.deepEqual(contributions(run(fixture({ FA1: 10, FB1: 5 }))), [[3, 'FA1', 10], [4, 'FB1', 5]]);
  let state = obligation(fixture({ FA1: 20 }), 'SECOND', 15);
  state = createNeed(state, { need_id: 'N-SECOND', affectation_id: 'SECOND', prioridad_economica: 'P1_CRITICA', rigidez_temporal: 'R4_FLEXIBLE', ...trace }, 'need');
  const report = buildCoverageReport(state, 'E', ctx(), monetary);
  assert.deepEqual(report.planes.map(p => [p.affectation_id, p.monto_cubierto]), [['SECOND', 15], ['OB', 5]]);
  assert.equal(report.monto_cubierto, 20); assert.equal(report.residual_no_cubierto, 10);
  const limited = restriction(state, { max_diario: 17 });
  const limitedReport = buildCoverageReport(limited, 'E', ctx(), monetary);
  assert.equal(limitedReport.monto_cubierto, 17); assert.equal(limitedReport.planes[1].monto_cubierto, 2);
  let localized = obligation(fixture({ EA0: 15, FA1: 50 }), 'SECOND', 15);
  localized = createNeed(localized, { need_id: 'N-SECOND', affectation_id: 'SECOND', prioridad_economica: 'P1_CRITICA', rigidez_temporal: 'R4_FLEXIBLE', ...trace }, 'need');
  localized = setBankRestriction(localized, { banco: 'A', reglas: { max_diario: 20 }, ...trace }, 'bank-cap');
  const joint = buildCoverageReport(localized, 'E', ctx(), monetary);
  assert.equal(joint.planes[0].estado, 'SIN_NECESIDAD_DE_COBERTURA');
  assert.equal(joint.planes[1].monto_cubierto, 5);
});
test('QA-C19 - Mayor capacidad cedible primero dentro del nivel', () => {
  const result = run(fixture({ FA1: 20, GA1: 30 })); assert.equal(result.tramos[0].empresa_fuente, 'G');
  const adjusted = run(buffer(fixture({ FA1: 20, GA1: 30 }), 'G', 20)); assert.equal(adjusted.tramos[0].empresa_fuente, 'F');
});
test('QA-C20 - Desempate estable por ID', () => {
  assert.equal(run(fixture({ GA1: 30, FA1: 30 })).tramos[0].empresa_fuente, 'F');
});
test('QA-C21 - Misma cuenta destino no genera autotransferencia', () => {
  assert.deepEqual(run(fixture({ EA0: 30 }), { cuenta_destino: 'EA0' }).tramos, []);
  const result = run(restriction(fixture({ EA0: 30 }), { permite_intrabanco: false }, 'EA0'), { cuenta_destino: 'EA0' });
  assert.deepEqual(result.tramos, []); assert.ok(result.fuentes_descartadas.some(s => s.motivo === 'SAME_ACCOUNT_REQUIRES_LOCALIZATION'));
  assert.throws(() => run(fixture(), { cuenta_destino: 'FA1' }), { code: 'INVALID_DESTINATION_ACCOUNT' });
});
test('QA-C22 - Cuenta USD participa en VES y valida limites en USD', () => {
  const money = createState({ managedDate: '2026-10-05', rates: { VES_USD_BCV: { value: 36.5, source: 'BCV', timestamp: trace.fecha_hora_evento } } });
  const state = restriction(fixture({ FA1: 2 }, 50, { FA1: 'USD' }), { max_diario: 1 });
  const result = run(state, {}, money);
  assert.equal(result.monto_cubierto, 36.5); assert.equal(result.tramos[0].moneda_operacion, 'USD');
  assert.equal(result.tramos[0].monto_operacion, 1); assert.equal(result.residual_no_cubierto, 13.5);
});
test('QA-C23 - Sin tasa no usa fuente ni suma parcialmente moneda desconocida', () => {
  const result = run(fixture({ FA1: 100, FA2: 100 }, 15, { FA2: 'EUR' }));
  assert.equal(result.estado, 'SIN_COBERTURA');
  assert.ok(result.fuentes_descartadas.some(s => s.empresa_fuente === 'F' && s.motivo === 'MISSING_EXCHANGE_RATE'));
});
test('QA-C24 - Originales intactos en saldos y afectaciones', () => {
  const state = fixture({ FA1: 100 }); const before = structuredClone(state);
  run(state); assert.deepEqual(state.balances, before.balances); assert.deepEqual(state.affectations, before.affectations);
});
test('QA-C25 - Posicion de todas las empresas inalterada', () => {
  const state = fixture({ FA1: 100 });
  const before = state.catalogue.empresas.map(e => calculateCompanyPosition(state, e, monetary));
  run(state); assert.deepEqual(state.catalogue.empresas.map(e => calculateCompanyPosition(state, e, monetary)), before);
});
test('QA-C26 - Postura y asignaciones inalteradas', () => {
  const state = fixture({ FA1: 100 }); const before = buildPosture(state, 'E', monetary);
  run(state); assert.deepEqual(buildPosture(state, 'E', monetary), before);
});
test('QA-C27 - Uso y reservas oficiales no se alteran y limitan la propuesta', () => {
  let state = restriction(fixture({ FA1: 100 }, 80), { max_diario: 100, max_operaciones_dia: 5 });
  const record = { banco: 'A', empresa: 'F', cuenta: 'FA1', moneda: 'VES', fecha: '2026-10-05', ...trace };
  state = setBankUsage(state, { ...record, monto_usado_dia: 30, operaciones_usadas_dia: 1 }, 'usage');
  state = reserveBankCapacity(state, { ...record, reservation_id: 'CAP', monto: 20, operaciones: 1 }, 'reserve');
  const before = structuredClone(state); assert.equal(run(state).monto_cubierto, 50); assert.deepEqual(state, before);
});

test('QA-C28 - Buffer no crea afectacion ni altera posicion', () => {
  const state = initial(); const before = structuredClone(state);
  const updated = setCoveragePolicy(state, policy, 'policy');
  assert.deepEqual(calculateCompanyPosition(updated, 'E', monetary), calculateCompanyPosition(state, 'E', monetary));
  assert.deepEqual(updated.affectations, state.affectations); assert.deepEqual(state, before);
  assert.deepEqual(updated.coveragePolicies, [{ empresa: 'E', buffer_operativo_ves: 30 }]);
  assert.deepEqual(updated.events.at(-1), { kind: 'COVERAGE_POLICY', operacion: 'SET_COVERAGE_POLICY', empresa: 'E',
    antes: null, despues: { empresa: 'E', buffer_operativo_ves: 30 }, ...trace, request_id: 'policy' });
  for (const buffer_operativo_ves of [-1, Infinity, NaN, '30', null]) {
    assert.throws(() => setCoveragePolicy(state, { ...policy, buffer_operativo_ves }, 'bad'), { code: 'INVALID_COVERAGE_BUFFER' });
  }
});
test('QA-C29 - Politica idempotente incluso despues de guardar y cargar', () => {
  const state = setCoveragePolicy(initial(), policy, 'policy');
  assert.strictEqual(setCoveragePolicy(state, policy, 'policy'), state);
  const data = new Map(); const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  saveNeedState(storage, state); const restored = loadNeedState(storage);
  assert.deepEqual(restored, state); assert.strictEqual(setCoveragePolicy(restored, policy, 'policy'), restored);
});
test('QA-C30 - Mismo request_id con contenido distinto produce conflicto', () => {
  const state = setCoveragePolicy(initial(), policy, 'policy'); const before = structuredClone(state);
  assert.throws(() => setCoveragePolicy(state, { ...policy, buffer_operativo_ves: 31 }, 'policy'), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.throws(() => clearCoveragePolicy(state, { empresa: 'E', ...trace }, 'policy'), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.throws(() => setCoveragePolicy(state, policy, ''), { code: 'INVALID_IDEMPOTENCY_KEY' });
  assert.deepEqual(state, before);
});
test('QA-C31 - Clear elimina buffer y conserva posicion e historial', () => {
  const state = setCoveragePolicy(initial(), policy, 'policy');
  const row = { empresa: 'E', ...trace }; const cleared = clearCoveragePolicy(state, row, 'clear');
  assert.deepEqual(cleared.coveragePolicies, []);
  assert.deepEqual(calculateCompanyPosition(cleared, 'E', monetary), calculateCompanyPosition(state, 'E', monetary));
  assert.deepEqual(cleared.events.at(-1).antes, { empresa: 'E', buffer_operativo_ves: 30 });
  assert.equal(cleared.events.at(-1).despues, null);
  assert.equal(cleared.events.at(-1).operacion, 'CLEAR_COVERAGE_POLICY');
  assert.strictEqual(clearCoveragePolicy(cleared, row, 'clear'), cleared);
});

test('QA-C32 - Empresa fuente con 30 y buffer 20 cede solo 10', () => {
  assert.equal(run(buffer(fixture({ FA1: 30 }), 'F', 20)).monto_cubierto, 10);
});
test('QA-C33 - Todas las fuentes conservan buffer y capacidad no negativa', () => {
  const state = buffer(buffer(fixture({ FA1: 50, FB1: 30, GA1: 20 }, 100), 'F', 30), 'G', 5);
  for (const route of run(state).tramos) {
    assert.ok(route.saldo_fuente_despues >= route.buffer_fuente); assert.ok(route.capacidad_fisica_despues >= 0);
    assert.equal(route.saldo_fuente_antes - route.monto_propuesto_ves, route.saldo_fuente_despues);
  }
});
test('QA-C34 - Parte indispensable bloqueada conserva cobertura parcial', () => {
  const state = restriction(fixture({ FA1: 10, FB1: 20 }), { permite_interbanco: false }, 'FB1');
  const result = run(state); assert.equal(result.estado, 'COBERTURA_PARCIAL'); assert.equal(result.residual_no_cubierto, 5);
  const late = run(restriction(fixture({ FA1: 100 }), { minutos_acreditacion: 60 }), { fecha_hora_objetivo: '2026-10-05T10:30:00-04:00' });
  assert.equal(late.estado, 'SIN_COBERTURA');
});
test('QA-C35 - Mismos datos producen mismo plan y reporte', () => {
  const state = fixture({ FA1: 10, FB1: 20, GA1: 10 });
  assert.deepEqual(run(state), run(state));
  assert.deepEqual(buildCoverageReport(state, 'E', ctx(), monetary), buildCoverageReport(state, 'E', ctx(), monetary));
});
test('QA-C36 - Fecha y zona explicitas obligatorias; destino sin banco no se inventa', () => {
  const state = fixture({ FA1: 100 });
  assert.throws(() => run(state, { fecha_hora_evaluacion: undefined }), { code: 'INVALID_TIMESTAMP' });
  assert.throws(() => run(state, { zona_horaria: undefined }), { code: 'TIME_ZONE_REQUIRED' });
  const noBank = obligation(fixture({ FA1: 100 }, 0), 'OB', 15, { banco_asignado: null });
  assert.throws(() => run(noBank), { code: 'DESTINATION_BANK_REQUIRED' });
  assert.equal(run(noBank, { banco_destino: 'A' }).monto_cubierto, 15);
});
test('QA-C37 - Cada tramo explica nivel y motivo, sin saltar jerarquia', () => {
  const result = run(blockedOwn({ EA1: 5, EB1: 5, FA1: 3, FB1: 2 }));
  assert.deepEqual(result.tramos.map(t => t.nivel_cobertura), [1, 2, 3, 4]);
  for (const route of result.tramos) assert.equal(route.motivo_seleccion, result.explicacion_jerarquia[route.nivel_cobertura - 1].motivo);
});
test('QA-C38 - Descartes tienen empresa y motivo estable', () => {
  const result = run(restriction(fixture({ FA1: 100 }), { cutoff: '09:00' }));
  assert.ok(result.fuentes_descartadas.length > 0);
  for (const source of result.fuentes_descartadas) { assert.ok(source.empresa_fuente); assert.ok(source.motivo); }
  assert.ok(result.fuentes_descartadas.some(s => s.evaluacion?.explicaciones.some(e => e.rule_id === 'AFTER_CUTOFF')));
});
test('QA-C39 - No inventa modulo ni reservas de FX especifico', () => {
  const state = fixture({ FA1: 100 }); const result = run(state);
  assert.doesNotMatch(JSON.stringify(result), /FX_T1|FX_T_PLUS_1|reserva_fx/i);
  assert.equal(state.events.some(e => /FX/.test(e.operacion ?? '')), false);
});
test('QA-C40 - No crea mandatos ni ejecuta movimientos', () => {
  const state = fixture({ FA1: 100 }); const before = structuredClone(state); const result = run(state);
  assert.doesNotMatch(JSON.stringify(result), /mandato|mandate/i); assert.deepEqual(state, before);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.tramos[0]));
});
