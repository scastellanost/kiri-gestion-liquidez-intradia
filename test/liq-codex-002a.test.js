import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/state.js';
import { createPositionState, registerBalance, registerAffectation, applyBalanceBatch,
  applyAffectationBatch, previewBalances, previewAffectations, calculateCompanyPosition } from '../src/position.js';

const time = hour => `2026-10-02T${hour}:00:00Z`;
const trace = hour => ({ origen: 'QA-002A', usuario: 'tesoreria', fecha_hora_evento: time(hour) });
const monetary = createState({ managedDate: '2026-10-02' });
const initial = () => createPositionState({ empresas: ['E'], bancos: ['B'], cuentas: [
  { cuenta: 'C', empresa: 'E', banco: 'B', monedas: ['VES'] }
] });
const stock = (value, hour) => ({ empresa: 'E', banco: 'B', cuenta: 'C',
  amount_original: value, currency_original: 'VES', fecha_hora_saldo: time(hour), ...trace('13') });
function affected(nature = 'COMPROMISO', confirmed = 0) {
  return registerAffectation(initial(), { affectation_id: 'OB', empresa: 'E', tipo_partida: 'PAGO',
    naturaleza_afectacion: nature, amount_original: nature === 'RESERVA' ? 15 : 20,
    currency_original: 'VES', monto_reflejado_confirmado: confirmed, operacion: 'ALTA', ...trace('12') }, 'alta');
}
const event = (operacion, extra = {}) => ({ affectation_id: 'OB', operacion, ...trace('13'), ...extra });
const position = state => calculateCompanyPosition(state, 'E', monetary);
function cancelAndCheck(state, cancelled, current, confirmed, status, pending) {
  const before = structuredClone(state);
  const row = event('ANULACION', { monto_anulado: cancelled });
  assert.equal(previewAffectations(state, [row], { request_id: 'cancel' }).status, 'VALID');
  assert.deepEqual(state, before);
  const next = registerAffectation(state, row, 'cancel');
  assert.equal(next.affectations.length, 1);
  const record = next.affectations[0];
  assert.equal(record.monto_vigente, current);
  assert.equal(record.monto_reflejado_confirmado, confirmed);
  assert.equal(record.estado, status);
  assert.equal(record.amount_original, before.affectations[0].amount_original);
  assert.equal(record.currency_original, before.affectations[0].currency_original);
  const result = position(next);
  assert.equal(record.naturaleza_afectacion === 'COMPROMISO' ? result.compromisos_por_ejecutar : result.reservas_bloqueadas, pending);
  assert.equal(next.events.at(-1).request_id, 'cancel');
  assert.deepEqual(next.events.at(-1).input, row);
  assert.strictEqual(registerAffectation(next, row, 'cancel'), next);
  assert.deepEqual(state, before);
}
function rejected(state, row, errorCode) {
  const before = structuredClone(state);
  const preview = previewAffectations(state, [row], { request_id: 'rejected' });
  assert.equal(preview.status, 'ERROR'); assert.equal(preview.errors[0].code, errorCode);
  assert.throws(() => registerAffectation(state, row, 'rejected'), { code: errorCode });
  assert.deepEqual(state, before);
}

test('QA-2A01 — Compromiso 20, reflejado 0, anula 5: vigente/pendiente 15, ACTIVA', () => {
  cancelAndCheck(affected(), 5, 15, 0, 'ACTIVA', 15);
});
test('QA-2A02 — Compromiso 20, reflejado 10, anula 5: vigente 15, pendiente 5, ACTIVA', () => {
  cancelAndCheck(affected('COMPROMISO', 10), 5, 15, 10, 'ACTIVA', 5);
});
test('QA-2A03 — Compromiso 20, reflejado 10, anula 10: vigente 10, pendiente 0, ANULADA', () => {
  cancelAndCheck(affected('COMPROMISO', 10), 10, 10, 10, 'ANULADA', 0);
});
test('QA-2A04 — Reserva 15, anula 5: vigente 10, ACTIVA', () => {
  cancelAndCheck(affected('RESERVA'), 5, 10, 0, 'ACTIVA', 10);
});
test('QA-2A05 — Reserva 15, anula 15: vigente 0, ANULADA', () => {
  cancelAndCheck(affected('RESERVA'), 15, 0, 0, 'ANULADA', 0);
});
test('QA-2A06 — Anulación excesiva: ERROR sin mutación', () => {
  rejected(affected('COMPROMISO', 10), event('ANULACION', { monto_anulado: 11 }), 'EXCESSIVE_OR_INVALID_CANCELLATION');
  rejected(affected('RESERVA'), event('ANULACION', { monto_anulado: 16 }), 'EXCESSIVE_OR_INVALID_CANCELLATION');
});
test('QA-2A07 — Saldo retroactivo 90 histórico; stock y posición conservan 100', () => {
  const state = registerBalance(initial(), stock(100, '12'), 'current');
  const before = structuredClone(state); const row = stock(90, '10');
  assert.equal(previewBalances(state, [row], { batch_id: 'history' }).status, 'VALID');
  assert.deepEqual(state, before);
  const next = applyBalanceBatch(state, [row], 'history');
  assert.deepEqual(next.balances, state.balances); assert.deepEqual(position(next), position(state));
  assert.equal(position(next).saldo_bancario, 100);
  const historical = next.events.at(-1);
  assert.equal(historical.amount_original, 90); assert.equal(historical.fecha_hora_saldo, time('10'));
  assert.equal(historical.treatment, 'HISTORICAL_ONLY'); assert.equal(historical.batch_id, 'history');
  assert.equal(historical.origen, 'QA-002A'); assert.equal(historical.usuario, 'tesoreria');
  assert.strictEqual(applyBalanceBatch(next, [row], 'history'), next);
  const manual = registerBalance(state, row, 'history-manual');
  assert.equal(manual.events.at(-1).treatment, 'HISTORICAL_ONLY');
  assert.strictEqual(registerBalance(manual, row, 'history-manual'), manual);
  assert.deepEqual(state, before);
});
test('QA-2A08 — Mismo timestamp con monto distinto: ERROR', () => {
  const state = registerBalance(initial(), stock(100, '12'), 'current'); const before = structuredClone(state);
  const row = stock(90, '12');
  assert.equal(previewBalances(state, [row], { request_id: 'conflict' }).errors[0].code, 'CONFLICTING_STOCK_TIMESTAMP');
  assert.throws(() => registerBalance(state, row, 'conflict'), { code: 'CONFLICTING_STOCK_TIMESTAMP' });
  assert.deepEqual(state, before);
});
test('QA-2A09 — AJUSTE retroactivo: RETROACTIVE_AFFECTATION_EVENT sin mutación', () => {
  const state = affected();
  rejected(state, event('AJUSTE', { monto_vigente: 25, fecha_hora_evento: time('11') }), 'RETROACTIVE_AFFECTATION_EVENT');
  const before = structuredClone(state);
  assert.throws(() => applyAffectationBatch(state, [event('AJUSTE', { monto_vigente: 25, fecha_hora_evento: time('11') })], 'retro-batch'), { code: 'RETROACTIVE_AFFECTATION_EVENT' });
  assert.deepEqual(state, before);
  const allowed = registerAffectation(state, event('AJUSTE', { monto_vigente: 25 }), 'current-adjust');
  assert.equal(allowed.affectations[0].monto_vigente, 25);
});
test('QA-2A10 — ANULACION retroactiva: RETROACTIVE_AFFECTATION_EVENT sin mutación', () => {
  const state = registerAffectation(affected(), event('AJUSTE', { monto_vigente: 25 }), 'latest');
  rejected(state, event('ANULACION', { monto_anulado: 5, fecha_hora_evento: time('12') }), 'RETROACTIVE_AFFECTATION_EVENT');
});
test('QA-2A11 — Disminuir reflejado: CONFIRMED_AMOUNT_REVERSAL_NOT_ALLOWED sin mutación', () => {
  rejected(affected('COMPROMISO', 10), event('AJUSTE', { monto_reflejado_confirmado: 5 }), 'CONFIRMED_AMOUNT_REVERSAL_NOT_ALLOWED');
});
test('QA-2A12 — Aumentar reflejado sigue permitido y conserva originales', () => {
  const state = affected('COMPROMISO', 10); const before = structuredClone(state);
  const row = event('AJUSTE', { monto_reflejado_confirmado: 15 });
  assert.equal(previewAffectations(state, [row], { batch_id: 'increase' }).status, 'VALID');
  const next = applyAffectationBatch(state, [row], 'increase');
  assert.equal(next.affectations[0].monto_reflejado_confirmado, 15);
  assert.equal(next.affectations[0].amount_original, 20); assert.equal(next.affectations[0].currency_original, 'VES');
  assert.equal(position(next).compromisos_por_ejecutar, 5);
  assert.strictEqual(applyAffectationBatch(next, [row], 'increase'), next);
  assert.deepEqual(state, before);
});
