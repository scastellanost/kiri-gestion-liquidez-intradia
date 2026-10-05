import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/state.js';
import { createPositionState, registerBalance, registerAffectation, calculateCompanyPosition } from '../src/position.js';
import { setPostureConfig, buildPosture } from '../src/posture.js';
import { setBankRestriction } from '../src/bank-restrictions.js';
import { setCoveragePolicy, buildCoveragePlan, buildCoverageReport } from '../src/coverage.js';

const trace = { origen: 'QA-006A', usuario: 'tesoreria', fecha_hora_evento: '2026-10-05T10:00:00-04:00' };
const monetary = createState({ managedDate: '2026-10-05' });
const context = { fecha_hora_evaluacion: trace.fecha_hora_evento, zona_horaria: 'America/Caracas', settlement: 'T0' };
const ids = ['EA0', 'EA1', 'EA2', 'EB1', 'EB2', 'FA1', 'FB1'];
function fixture(balances, needs = [20]) {
  let state = createPositionState({ empresas: ['E', 'F'], bancos: ['A', 'B'], cuentas: ids.map(cuenta => ({
    cuenta, empresa: cuenta[0], banco: cuenta[1], monedas: ['VES']
  })) });
  for (const [cuenta, amount_original] of Object.entries(balances)) state = registerBalance(state, {
    empresa: cuenta[0], banco: cuenta[1], cuenta, amount_original, currency_original: 'VES',
    fecha_hora_saldo: trace.fecha_hora_evento, ...trace
  }, `saldo-${cuenta}`);
  for (const empresa of ['E', 'F']) state = setPostureConfig(state, { empresa, orden_bancos: ['A', 'B'],
    orden_cuentas_por_banco: { A: ids.filter(id => id[0] === empresa && id[1] === 'A'), B: ids.filter(id => id[0] === empresa && id[1] === 'B') }, ...trace
  }, `postura-${empresa}`);
  for (const [i, amount_original] of needs.entries()) state = registerAffectation(state, { affectation_id: `OB${i + 1}`,
    empresa: 'E', banco_asignado: 'A', tipo_partida: 'PAGO', naturaleza_afectacion: 'COMPROMISO', operacion: 'ALTA',
    amount_original, currency_original: 'VES', ...trace
  }, `need-${i}`);
  return state;
}
const limit = (state, reglas, cuenta = 'EA0') => setBankRestriction(state, { banco: cuenta[1], cuenta, reglas, ...trace }, `limit-${state.events.length}`);
const protect = (state, empresa, buffer_operativo_ves) => setCoveragePolicy(state, { empresa, buffer_operativo_ves, ...trace }, `buffer-${empresa}`);
const plan = state => buildCoveragePlan(state, 'OB1', context, monetary);
const report = state => buildCoverageReport(state, 'E', context, monetary);
const position = (state, empresa = 'E') => calculateCompanyPosition(state, empresa, monetary).saldo_disponible_gestion;
function unchangedCompany(tramos, saldo) {
  assert.ok(tramos.length > 0);
  for (const t of tramos) {
    assert.ok(t.nivel_cobertura <= 2);
    assert.equal(t.saldo_fuente_antes, saldo); assert.equal(t.saldo_fuente_despues, saldo);
    assert.equal(t.capacidad_fisica_antes - t.monto_propuesto_ves, t.capacidad_fisica_despues);
  }
}

test('QA-6A01 - Nivel 1 cubre 30 y conserva disponibilidad 40', () => {
  const state = limit(fixture({ EA0: 30, EA1: 30, EB1: 10 }, [30]), { max_diario: 0 });
  assert.equal(position(state), 40);
  const result = plan(state); assert.equal(result.monto_cubierto, 30);
  assert.equal(result.tramos[0].nivel_cobertura, 1); unchangedCompany(result.tramos, 40);
});
test('QA-6A02 - Nivel 2 cubre 20 sin descontar saldo consolidado cero', () => {
  const state = fixture({ EB1: 20 }); assert.equal(position(state), 0);
  const result = plan(state); assert.equal(result.estado, 'COBERTURA_TOTAL'); assert.equal(result.monto_cubierto, 20);
  assert.equal(result.tramos[0].nivel_cobertura, 2); unchangedCompany(result.tramos, 0);
});
test('QA-6A03 - Buffer 20 no bloquea nivel 1 con disponibilidad 20', () => {
  const state = protect(limit(fixture({ EA0: 15, EA1: 15, EB1: 5 }, [15]), { max_diario: 0 }), 'E', 20);
  assert.equal(position(state), 20);
  const result = plan(state); assert.equal(result.monto_cubierto, 15); assert.equal(result.tramos[0].buffer_fuente, 20);
  unchangedCompany(result.tramos, 20);
});
test('QA-6A04 - Buffer mayor que disponibilidad no bloquea nivel 2', () => {
  const state = protect(fixture({ EB1: 15 }, [15]), 'E', 100);
  const result = plan(state); assert.equal(result.monto_cubierto, 15); assert.equal(result.tramos[0].nivel_cobertura, 2);
  unchangedCompany(result.tramos, 0);
});
test('QA-6A05 - Nivel 3 reduce fuente 50 a 20 al ceder 30', () => {
  const result = plan(protect(fixture({ FA1: 50 }, [30]), 'F', 10));
  const t = result.tramos[0]; assert.equal(t.nivel_cobertura, 3); assert.equal(t.monto_propuesto_ves, 30);
  assert.equal(t.saldo_fuente_antes, 50); assert.equal(t.saldo_fuente_despues, 20); assert.equal(t.buffer_fuente, 10);
});
test('QA-6A06 - Nivel 4 reduce fuente 50 a 20 al ceder 30', () => {
  const result = plan(protect(fixture({ FB1: 50 }, [30]), 'F', 10));
  const t = result.tramos[0]; assert.equal(t.nivel_cobertura, 4); assert.equal(t.monto_propuesto_ves, 30);
  assert.equal(t.saldo_fuente_antes, 50); assert.equal(t.saldo_fuente_despues, 20); assert.equal(t.buffer_fuente, 10);
});
test('QA-6A07 - Dos necesidades 20+20 comparten solo 30 fisicos', () => {
  const state = fixture({ EB1: 30 }, [20, 20]); const result = report(state);
  assert.equal(position(state), -10); assert.equal(result.monto_cubierto, 30); assert.equal(result.residual_no_cubierto, 10);
  assert.deepEqual(result.planes.map(p => p.monto_cubierto), [20, 10]);
  const tramos = result.planes.flatMap(p => p.tramos); unchangedCompany(tramos, -10);
  assert.deepEqual(tramos.map(t => [t.capacidad_fisica_antes, t.capacidad_fisica_despues]), [[30, 10], [10, 0]]);
});
test('QA-6A08 - Disponibilidad 10 no impone limite ficticio sobre 30 relocalizables', () => {
  const state = limit(fixture({ EA0: 20, EB1: 30 }, [20, 20]), { max_diario: 0 });
  assert.equal(position(state), 10); assert.equal(buildPosture(state, 'E', monetary).cuentas.find(a => a.cuenta === 'EB1').capacidad_restante_postura, 30);
  const result = report(state); assert.equal(result.monto_cubierto, 30); assert.equal(result.residual_no_cubierto, 10);
  unchangedCompany(result.planes.flatMap(p => p.tramos), 10);
});
test('QA-6A09 - Cutoff, importe diario y numero de operaciones gobiernan niveles 1 y 2', () => {
  for (const level of [1, 2]) {
    const source = level === 1 ? 'EA1' : 'EB1';
    const base = protect(level === 1 ? limit(fixture({ EA0: 20, EA1: 30 }), { max_diario: 0 }) : fixture({ EB1: 30 }), 'E', 100);
    assert.equal(plan(limit(base, { cutoff: '09:00' }, source)).monto_cubierto, 0);
    assert.equal(plan(limit(base, { max_diario: 12 }, source)).monto_cubierto, 12);
    const split = plan(limit(base, { max_por_operacion: 5, max_operaciones_dia: 2 }, source));
    assert.equal(split.monto_cubierto, 10); assert.equal(split.tramos[0].operaciones_requeridas, 2);
    assert.ok(split.tramos[0].acciones_requeridas.includes('DIVIDIR_OPERACION'));
  }
});
test('QA-6A10 - Informe comparte limites bancarios entre necesidades y cuentas', () => {
  let state = protect(fixture({ EB1: 15, EB2: 15 }, [20, 20]), 'E', 100);
  state = setBankRestriction(state, { banco: 'B', reglas: { max_diario: 25 }, ...trace }, 'bank');
  const result = report(state); assert.equal(result.monto_cubierto, 25); assert.equal(result.residual_no_cubierto, 15);
  assert.deepEqual(result.planes.map(p => p.monto_cubierto), [20, 5]);
  unchangedCompany(result.planes.flatMap(p => p.tramos), -10);
  const byOps = setBankRestriction(state, { banco: 'B', reglas: { max_operaciones_dia: 2 }, ...trace }, 'ops');
  assert.equal(report(byOps).monto_cubierto, 20);
});
test('QA-6A11 - Tramos mixtos explican saldo constante propio y cesion externa', () => {
  const state = protect(protect(limit(fixture({ EA0: 20, EA1: 10, EB1: 5, FA1: 50 }), { max_diario: 0 }), 'E', 100), 'F', 10);
  const result = plan(state); assert.deepEqual(result.tramos.map(t => t.nivel_cobertura), [1, 2, 3]);
  unchangedCompany(result.tramos.slice(0, 2), 15);
  assert.equal(result.tramos[2].saldo_fuente_antes, 50); assert.equal(result.tramos[2].saldo_fuente_despues, 45);
  assert.equal(result.estado, 'COBERTURA_TOTAL');
});
test('QA-6A12 - Intercompany conserva buffer en ambos niveles y entre necesidades', () => {
  for (const cuenta of ['FA1', 'FB1']) {
    for (const [saldo, buffer, need, covered] of [[100, 30, 80, 70], [50, 10, 41, 40], [30, 20, 15, 10]]) {
      const result = plan(protect(fixture({ [cuenta]: saldo }, [need]), 'F', buffer));
      assert.equal(result.monto_cubierto, covered);
      assert.ok(result.tramos.every(t => t.saldo_fuente_despues >= t.buffer_fuente));
    }
  }
  const result = report(protect(fixture({ FA1: 30, FB1: 20 }, [30, 30]), 'F', 10));
  assert.equal(result.monto_cubierto, 40);
  assert.deepEqual(result.planes.flatMap(p => p.tramos).map(t => t.saldo_fuente_despues), [20, 10]);
});
test('QA-6A13 - Posicion oficial, originales y reservas bancarias intactos', () => {
  const state = protect(fixture({ EB1: 30, FA1: 50 }, [20, 20]), 'E', 100); const before = structuredClone(state);
  const positions = ['E', 'F'].map(e => calculateCompanyPosition(state, e, monetary));
  plan(state); report(state);
  assert.deepEqual(state, before); assert.deepEqual(['E', 'F'].map(e => calculateCompanyPosition(state, e, monetary)), positions);
});
test('QA-6A14 - Postura intacta y capacidad ya asignada no reutilizada', () => {
  const state = limit(fixture({ EA0: 20, EA1: 10, EB1: 5 }), { max_diario: 0 });
  const before = buildPosture(state, 'E', monetary); const result = plan(state);
  assert.equal(result.monto_cubierto, 15); assert.equal(result.residual_no_cubierto, 5);
  assert.ok(result.tramos.every(t => t.cuenta_fuente !== 'EA0'));
  assert.deepEqual(buildPosture(state, 'E', monetary), before);
});
test('QA-6A15 - Plan e informe deterministas con coberturas intraempresa e intercompany', () => {
  const state = protect(fixture({ EB1: 30, FA1: 50 }, [20, 20]), 'E', 100);
  assert.deepEqual(plan(state), plan(state)); assert.deepEqual(report(state), report(state));
});
