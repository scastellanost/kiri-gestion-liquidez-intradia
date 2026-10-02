import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/state.js';
import { createPositionState, registerBalance, registerAffectation, calculateCompanyPosition } from '../src/position.js';
import { createNeed, linkNeedToAffectation, reprioritizeNeed, reclassifyAffectation,
  buildNeedQueue, closeNeedIfResolved, saveNeedState, loadNeedState } from '../src/needs.js';

const time = hour => `2026-10-02T${String(hour).padStart(2, '0')}:00:00Z`;
const trace = (hour = 10) => ({ origen: 'QA-003', usuario: 'tesoreria', fecha_hora_evento: time(hour) });
const monetary = createState({ managedDate: '2026-10-02', rates: { VES_USD_BCV: { value: 36.5, source: 'BCV', timestamp: time(8) } } });
function initial() {
  return registerBalance(createPositionState({ empresas: ['E', 'F'], bancos: ['B'], cuentas: [
    { cuenta: 'C', empresa: 'E', banco: 'B', monedas: ['VES'] }
  ] }), { empresa: 'E', banco: 'B', cuenta: 'C', amount_original: 100, currency_original: 'VES',
    fecha_hora_saldo: time(8), ...trace(8) }, 'stock');
}
function add(state, id = 'A', extra = {}) {
  return registerAffectation(state, { affectation_id: id, empresa: 'E', tipo_partida: 'PAGO', naturaleza_afectacion: 'COMPROMISO',
    amount_original: 20, currency_original: 'VES', operacion: 'ALTA', ...trace(9), ...extra }, `alta-${id}`);
}
const row = (id = 'N', affectation_id = 'A', extra = {}) => ({ need_id: id, affectation_id,
  prioridad_economica: 'P3_NORMAL', rigidez_temporal: 'R4_FLEXIBLE', ...trace(), ...extra });
const linked = (extra = {}, aff = {}) => createNeed(add(initial(), 'A', aff), row('N', 'A', extra), 'need');
const queue = state => buildNeedQueue(state, 'E', monetary);
const position = state => calculateCompanyPosition(state, 'E', monetary);
const priority = (extra = {}) => ({ need_id: 'N', prioridad_economica: 'P1_CRITICA', motivo_prioridad: 'Urgencia confirmada', ...trace(12), ...extra });
const reclass = (nature, extra = {}) => ({ affectation_id: 'A', naturaleza_destino: nature,
  motivo_reclasificacion: 'Cambio operativo aprobado', ...trace(12), ...extra });
function rejectsUnchanged(state, operation, expected) {
  const before = structuredClone(state); assert.throws(operation, { code: expected }); assert.deepEqual(state, before);
}

test('QA-N01 — Prioridad y rigidez independientes: P1/R4 y P2/R1', () => {
  let state = add(add(initial()), 'B');
  state = createNeed(state, row('N1', 'A', { prioridad_economica: 'P1_CRITICA' }), 'n1');
  state = createNeed(state, row('N2', 'B', { prioridad_economica: 'P2_ALTA', rigidez_temporal: 'R1_HORA_RIGIDA', fecha_hora_objetivo: time(11) }), 'n2');
  const result = queue(state);
  assert.deepEqual(result.necesidades_activas.map(n => [n.need_id, n.prioridad_economica, n.rigidez_temporal]), [
    ['N2', 'P2_ALTA', 'R1_HORA_RIGIDA'], ['N1', 'P1_CRITICA', 'R4_FLEXIBLE']
  ]);
});
test('QA-N02 — R1 sin hora objetivo: ERROR', () => {
  const state = add(initial());
  rejectsUnchanged(state, () => createNeed(state, row('N', 'A', { rigidez_temporal: 'R1_HORA_RIGIDA' }), 'bad'), 'TARGET_DATETIME_REQUIRED');
});
test('QA-N03 — R3 sin fecha objetivo: ERROR; timestamp requiere zona válida', () => {
  const state = add(initial());
  rejectsUnchanged(state, () => createNeed(state, row('N', 'A', { rigidez_temporal: 'R3_FECHA_RIGIDA' }), 'bad'), 'TARGET_DATETIME_REQUIRED');
  for (const invalid of ['2026-10-02T10:00:00', '2026-02-30T10:00:00Z']) {
    rejectsUnchanged(state, () => createNeed(state, row('N', 'A', { rigidez_temporal: 'R3_FECHA_RIGIDA', fecha_hora_objetivo: invalid }), 'bad'), 'INVALID_TIMESTAMP');
  }
});
test('QA-N04 — R1 10:00 antes de R1 12:00', () => {
  let state = add(add(initial()), 'B');
  state = createNeed(state, row('late', 'A', { rigidez_temporal: 'R1_HORA_RIGIDA', fecha_hora_objetivo: time(12) }), 'late');
  state = createNeed(state, row('early', 'B', { rigidez_temporal: 'R1_HORA_RIGIDA', fecha_hora_objetivo: time(10) }), 'early');
  assert.deepEqual(queue(state).necesidades_activas.map(n => n.need_id), ['early', 'late']);
});
test('QA-N05 — Misma rigidez/hora: P1 antes de P2; desempates estables', () => {
  let state = add(add(add(add(initial()), 'B'), 'C'), 'D');
  for (const [id, ref, p, hour] of [['Z', 'A', 'P2_ALTA', 10], ['B', 'B', 'P1_CRITICA', 11], ['A', 'C', 'P1_CRITICA', 11], ['old', 'D', 'P1_CRITICA', 10]]) {
    state = createNeed(state, row(id, ref, { prioridad_economica: p, rigidez_temporal: 'R1_HORA_RIGIDA', fecha_hora_objetivo: time(12), ...trace(hour) }), id);
  }
  assert.deepEqual(queue(state).necesidades_activas.map(n => n.need_id), ['old', 'A', 'B', 'Z']);
});
test('QA-N06 — Déficit 30 es derivado y no crea necesidad adicional', () => {
  const state = linked({}, { amount_original: 130 }); const before = structuredClone(state);
  const result = queue(state);
  assert.equal(result.saldo_disponible_gestion, -30); assert.equal(result.deficit, 30); assert.equal(result.brecha_consolidada, 30);
  assert.equal(result.necesidades_activas.length, 1); assert.equal(state.needs.length, 1);
  assert.equal(result.total_necesidad_vigente, 130); assert.deepEqual(state, before);
});
test('QA-N07 — Una afectación, máximo una necesidad activa; vínculo explícito sin duplicación', () => {
  const state = linked();
  rejectsUnchanged(state, () => createNeed(state, row('other'), 'other'), 'DUPLICATE_ACTIVE_NEED');
  const base = add(initial());
  const draft = { ...row('draft', null), empresa: 'E', tipo_partida: 'PAGO', naturaleza: 'COMPROMISO', amount_original: 20, currency_original: 'VES' };
  const unlinked = createNeed(base, draft, 'draft');
  assert.equal(queue(unlinked).necesidades_sin_vinculo.length, 1);
  assert.equal(queue(unlinked).necesidades_sin_clasificar.length, 1);
  assert.equal(queue(unlinked).total_necesidad_vigente, 20);
  assert.equal(position(unlinked).saldo_disponible_gestion, 80);
  const attached = linkNeedToAffectation(unlinked, { need_id: 'draft', affectation_id: 'A', ...trace(11) }, 'link');
  assert.equal(queue(attached).necesidades_activas.length, 1);
  assert.equal(queue(attached).necesidades_sin_clasificar.length, 0);
  assert.equal(attached.affectations.length, 1); assert.equal(queue(attached).total_necesidad_vigente, 20);
  const alone = createNeed(initial(), draft, 'standalone');
  assert.equal(queue(alone).total_necesidad_vigente, 0); assert.equal(position(alone).saldo_disponible_gestion, 100);
});
test('QA-N08 — Compromiso→Reserva conserva disponible 80 y originales', () => {
  const state = linked(); const next = reclassifyAffectation(state, reclass('RESERVA'), 'reclass');
  assert.equal(next.affectations[0].naturaleza_afectacion, 'RESERVA'); assert.equal(next.needs[0].naturaleza, 'RESERVA');
  assert.equal(position(next).saldo_disponible_gestion, 80); assert.equal(next.affectations[0].amount_original, 20);
  assert.equal(next.affectations[0].currency_original, 'VES'); assert.equal(next.affectations.length, 1);
  const event = next.events.at(-1); assert.equal(event.operacion, 'RECLASIFICACION');
  assert.equal(event.anteriores.affectation.naturaleza_afectacion, 'COMPROMISO');
  assert.equal(event.posteriores.affectation.naturaleza_afectacion, 'RESERVA'); assert.equal(event.need_id, 'N');
});
test('QA-N09 — Compromiso con reflejado no se reclasifica a Reserva', () => {
  const state = linked({}, { monto_reflejado_confirmado: 10 });
  rejectsUnchanged(state, () => reclassifyAffectation(state, reclass('RESERVA'), 'bad'), 'RECLASSIFICATION_AFTER_CONFIRMED_EXECUTION_NOT_ALLOWED');
});
test('QA-N10 — Reserva→Compromiso sin duplicación y mismo disponible', () => {
  const state = linked({}, { naturaleza_afectacion: 'RESERVA' });
  const next = reclassifyAffectation(state, reclass('COMPROMISO'), 'reclass');
  assert.equal(position(next).saldo_disponible_gestion, position(state).saldo_disponible_gestion);
  assert.equal(next.affectations.length, 1); assert.equal(next.affectations[0].monto_reflejado_confirmado, 0);
  assert.equal(next.needs[0].naturaleza, 'COMPROMISO');
});
test('QA-N11 — Repriorizar P3→P1 conserva naturaleza, monto, moneda y posición', () => {
  const state = linked(); const next = reprioritizeNeed(state, priority(), 'priority');
  assert.equal(next.needs[0].prioridad_economica, 'P1_CRITICA'); assert.deepEqual(next.affectations, state.affectations);
  assert.deepEqual(position(next), position(state));
  const event = next.events.at(-1); assert.equal(event.anteriores.prioridad_economica, 'P3_NORMAL');
  assert.equal(event.posteriores.prioridad_economica, 'P1_CRITICA'); assert.equal(event.request_id, 'priority');
});
test('QA-N12 — Repriorización requiere motivo y valores válidos', () => {
  const state = linked();
  rejectsUnchanged(state, () => reprioritizeNeed(state, priority({ motivo_prioridad: '' }), 'bad'), 'PRIORITY_REASON_REQUIRED');
  rejectsUnchanged(state, () => reprioritizeNeed(state, priority({ prioridad_economica: 'P0' }), 'bad'), 'INVALID_ECONOMIC_PRIORITY');
  rejectsUnchanged(state, () => reprioritizeNeed(state, priority({ rigidez_temporal: 'R1_HORA_RIGIDA' }), 'bad'), 'TARGET_DATETIME_REQUIRED');
});
test('QA-N13 — Reclasificación requiere motivo', () => {
  const state = linked();
  rejectsUnchanged(state, () => reclassifyAffectation(state, reclass('RESERVA', { motivo_reclasificacion: ' ' }), 'bad'), 'RECLASSIFICATION_REASON_REQUIRED');
});
test('QA-N14 — Retroactividad contra última necesidad o afectación rechazada', () => {
  const state = reprioritizeNeed(linked(), priority(), 'priority');
  rejectsUnchanged(state, () => reprioritizeNeed(state, priority({ ...trace(11) }), 'bad'), 'RETROACTIVE_NEED_EVENT');
  rejectsUnchanged(state, () => reclassifyAffectation(state, reclass('RESERVA', trace(11)), 'bad'), 'RETROACTIVE_NEED_EVENT');
  const adjusted = registerAffectation(state, { affectation_id: 'A', operacion: 'AJUSTE', monto_vigente: 25, ...trace(14) }, 'adjust');
  rejectsUnchanged(adjusted, () => reprioritizeNeed(adjusted, priority({ ...trace(13) }), 'bad2'), 'RETROACTIVE_NEED_EVENT');
  rejectsUnchanged(adjusted, () => reclassifyAffectation(adjusted, reclass('RESERVA', trace(13)), 'bad2'), 'RETROACTIVE_NEED_EVENT');
});
test('QA-N15 — Idempotencia de operaciones y persistencia de trazabilidad', () => {
  const created = linked(); assert.strictEqual(createNeed(created, row(), 'need'), created);
  const prioritized = reprioritizeNeed(created, priority(), 'priority');
  assert.strictEqual(reprioritizeNeed(prioritized, priority(), 'priority'), prioritized);
  const reclassified = reclassifyAffectation(prioritized, reclass('RESERVA', trace(13)), 'reclass');
  assert.strictEqual(reclassifyAffectation(reclassified, reclass('RESERVA', trace(13)), 'reclass'), reclassified);
  const data = new Map(); const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  assert.equal(loadNeedState(storage), null); saveNeedState(storage, reclassified);
  const restored = loadNeedState(storage); assert.deepEqual(restored, reclassified);
  assert.deepEqual(queue(restored), queue(reclassified));
  assert.strictEqual(reclassifyAffectation(restored, reclass('RESERVA', trace(13)), 'reclass'), restored);
  assert.ok(Object.isFrozen(restored.events));
});
test('QA-N16 — Mismo request_id con otro payload: IDEMPOTENCY_CONFLICT', () => {
  const state = linked();
  rejectsUnchanged(state, () => createNeed(state, row('N', 'A', { prioridad_economica: 'P1_CRITICA' }), 'need'), 'IDEMPOTENCY_CONFLICT');
  rejectsUnchanged(state, () => reprioritizeNeed(state, priority(), 'stock'), 'IDEMPOTENCY_CONFLICT');
  const next = reclassifyAffectation(state, reclass('RESERVA'), 'reclass');
  rejectsUnchanged(next, () => reclassifyAffectation(next, reclass('COMPROMISO'), 'reclass'), 'IDEMPOTENCY_CONFLICT');
});
test('QA-N17 — UNCLASSIFIED_NEED conserva efecto sin prioridad silenciosa', () => {
  const state = add(initial()); const result = queue(state);
  assert.equal(result.necesidades_activas.length, 0); assert.equal(result.necesidades_sin_clasificar.length, 1);
  assert.equal(result.necesidades_sin_clasificar[0].tipo, 'UNCLASSIFIED_NEED');
  assert.equal(result.necesidades_sin_clasificar[0].prioridad_economica, null);
  assert.equal(result.saldo_disponible_gestion, 80); assert.equal(result.total_necesidad_vigente, 20);
});
test('QA-N18 — Cola sin campos de cobertura, fuente o movilización', () => {
  const result = queue(linked());
  function inspect(value) {
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!/cobertura|fuente|moviliza|coverage|source/i.test(key));
      if (child && typeof child === 'object') inspect(child);
    }
  }
  inspect(result);
});
test('QA-N19 — Orden explicable y estable, fechas normalizadas a instantes', () => {
  const state = linked({ rigidez_temporal: 'R1_HORA_RIGIDA', fecha_hora_objetivo: '2026-10-02T06:00:00-04:00' });
  const result = queue(state); const need = result.necesidades_activas[0];
  assert.deepEqual(result.criterios_orden, ['rigidez_temporal', 'fecha_hora_objetivo', 'prioridad_economica', 'fecha_hora_evento', 'need_id']);
  assert.deepEqual(need.criterio_orden, { rigidez_temporal: 0, fecha_hora_objetivo: Date.parse(time(10)), prioridad_economica: 2, fecha_hora_evento: Date.parse(time(10)), need_id: 'N' });
  assert.equal(need.necesidad_temporal_rigida, true); assert.deepEqual(queue(state), result);
});
test('QA-N20 — Afectación anulada cierra necesidad y sale de cola activa', () => {
  const state = registerAffectation(linked(), { affectation_id: 'A', operacion: 'ANULACION', monto_anulado: 20, ...trace(12) }, 'cancel');
  assert.equal(queue(state).necesidades_activas.length, 0);
  assert.equal(queue(state).necesidades_cerradas[0].estado, 'CERRADA');
  const close = { need_id: 'N', ...trace(13) };
  const closed = closeNeedIfResolved(state, close, 'close');
  assert.equal(closed.needs[0].estado, 'CERRADA'); assert.strictEqual(closeNeedIfResolved(closed, close, 'close'), closed);
});
test('QA-N21 — Pendiente cero no cuenta; seguimiento explícito separado', () => {
  const state = registerAffectation(linked(), { affectation_id: 'A', operacion: 'AJUSTE', monto_reflejado_confirmado: 20, ...trace(12) }, 'confirm');
  assert.equal(queue(state).necesidades_activas.length, 0); assert.equal(queue(state).total_necesidad_vigente, 0);
  assert.equal(queue(state).necesidades_cerradas.length, 1);
  assert.equal(closeNeedIfResolved(state, { need_id: 'N', ...trace(13) }, 'close').needs[0].estado, 'CERRADA');
  const follow = closeNeedIfResolved(state, { need_id: 'N', requiere_seguimiento_adicional: true, ...trace(13) }, 'follow');
  assert.equal(follow.needs[0].estado, 'ACTIVA'); assert.equal(queue(follow).necesidades_seguimiento.length, 1);
  assert.equal(queue(follow).necesidades_activas.length, 0); assert.equal(queue(follow).total_necesidad_vigente, 0);
});
test('QA-N22 — Reserva vigente aparece como necesidad económica activa', () => {
  const state = linked({}, { naturaleza_afectacion: 'RESERVA' });
  assert.equal(queue(state).necesidades_activas[0].naturaleza, 'RESERVA');
  assert.equal(queue(state).total_necesidad_vigente, 20);
});
test('QA-N23 — P4→P1 no cambia disponible ni moneda; total usa Posición', () => {
  const state = linked({ prioridad_economica: 'P4_DISCRECIONAL' }, { currency_original: 'USD', amount_original: 1 });
  const next = reprioritizeNeed(state, priority(), 'priority');
  assert.equal(queue(state).saldo_disponible_gestion, 63.5); assert.deepEqual(position(next), position(state));
  assert.equal(queue(next).total_necesidad_vigente, 36.5);
  const noRate = createState({ managedDate: '2026-10-02' }); const incomplete = buildNeedQueue(next, 'E', noRate);
  assert.equal(incomplete.publicable, false); assert.equal(incomplete.total_necesidad_vigente, null);
  assert.equal(incomplete.errors[0].code, 'MISSING_EXCHANGE_RATE');
});
test('QA-N24 — COMPROMISO 20 ↔ RESERVA 20 mantiene disponible 80', () => {
  let state = linked();
  for (const [nature, hour] of [['RESERVA', 12], ['COMPROMISO', 13]]) {
    state = reclassifyAffectation(state, reclass(nature, trace(hour)), `r-${hour}`);
    assert.equal(queue(state).saldo_disponible_gestion, 80); assert.equal(state.affectations.length, 1);
    assert.equal(queue(state).necesidades_activas.length, 1); assert.equal(queue(state).total_necesidad_vigente, 20);
  }
});
test('QA-N25 — Todas las operaciones conservan amount_original/currency_original', () => {
  const state = linked(); const before = structuredClone(state);
  const prioritized = reprioritizeNeed(state, priority(), 'priority');
  const reclassified = reclassifyAffectation(prioritized, reclass('RESERVA', trace(13)), 'reclass');
  for (const snapshot of [state, prioritized, reclassified]) {
    assert.equal(snapshot.affectations[0].amount_original, 20); assert.equal(snapshot.affectations[0].currency_original, 'VES');
    assert.equal(snapshot.needs[0].amount_original, 20); assert.equal(snapshot.needs[0].currency_original, 'VES');
  }
  rejectsUnchanged(state, () => reprioritizeNeed(state, priority({ amount_original: 99 }), 'bad'), 'IMMUTABLE_NEED_FIELD');
  rejectsUnchanged(state, () => reclassifyAffectation(state, reclass('RESERVA', { monto_vigente: 99 }), 'bad'), 'IMMUTABLE_RECLASSIFICATION_AMOUNT');
  assert.deepEqual(state, before); assert.throws(() => { reclassified.needs[0].amount_original = 99; }, TypeError);
});
