import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createState, setDisplayCurrency } from '../src/state.js';
import {
  createPositionState, previewBalances, previewAffectations, applyBalanceBatch,
  registerBalance, applyAffectationBatch, registerAffectation,
  calculateCompanyPosition, calculateBankPosition, displayPosition
} from '../src/position.js';

const t = n => `2026-10-02T${String(n).padStart(2, '0')}:00:00Z`;
const metadata = n => ({ origen: 'QA', usuario: 'tesoreria', fecha_hora_evento: t(n) });
const monetary = (bcv = 36.5) => createState({ managedDate: '2026-10-02', rates: { VES_USD_BCV: { value: bcv, source: 'BCV', timestamp: t(8) } } });
function initial() {
  return createPositionState({ empresas: ['E', 'F'], bancos: ['A', 'B'], cuentas: [
    { cuenta: 'A1', empresa: 'E', banco: 'A', monedas: ['VES', 'USD', 'EUR'] },
    { cuenta: 'A2', empresa: 'E', banco: 'A', monedas: ['VES'] },
    { cuenta: 'B1', empresa: 'E', banco: 'B', monedas: ['VES'] },
    { cuenta: 'F1', empresa: 'F', banco: 'A', monedas: ['VES'] }
  ] });
}
const stock = (value, n = 9, extra = {}) => ({ empresa: 'E', banco: 'A', cuenta: 'A1', amount_original: value,
  currency_original: 'VES', fecha_hora_saldo: t(n), ...metadata(n), ...extra });
const affectation = (value, extra = {}) => ({ affectation_id: 'C1', empresa: 'E', tipo_partida: 'PAGO',
  naturaleza_afectacion: 'COMPROMISO', amount_original: value, currency_original: 'VES',
  operacion: 'ALTA', ...metadata(10), ...extra });
const change = (operacion, extra = {}) => ({ affectation_id: 'C1', operacion, ...metadata(12), ...extra });
const funded = () => registerBalance(initial(), stock(100), 'stock-100');
const committed = () => registerAffectation(funded(), affectation(20), 'commit-20');
const position = s => calculateCompanyPosition(s, 'E', monetary());
const code = (fn, value) => assert.throws(fn, { code: value });

test('QA-P01 — Stock reemplazable: 100 → 90, no 190', () => {
  const before = funded(); const next = registerBalance(before, stock(90, 11), 'stock-90');
  assert.equal(next.balances.length, 1); assert.equal(position(next).saldo_bancario, 90);
  assert.equal(position(before).saldo_bancario, 100);
  assert.equal(next.events.length, 2);
  const preview = previewBalances(before, [stock(80), stock(70)], { batch_id: 'conflict' });
  assert.equal(preview.status, 'ERROR'); assert.equal(preview.errors[0].code, 'CONFLICTING_STOCK_TIMESTAMP');
  assert.equal(previewBalances(initial(), [stock(80), stock(70)], { batch_id: 'conflict' }).errors[0].code, 'CONFLICTING_BATCH_DUPLICATE');
  code(() => registerBalance(next, stock(80, 8), 'retroactive'), 'BLOCKED_BY_FUNCTIONAL_RULE');
});
test('QA-P02 — Compromiso 20 reduce saldo 100 a disponible 80', () => {
  const result = position(committed());
  assert.equal(result.publicable, true); assert.equal(result.compromisos_por_ejecutar, 20);
  assert.equal(result.saldo_disponible_gestion, 80);
});
test('QA-P03 — Reserva 15 y compromiso 20 dejan disponible 65', () => {
  const state = registerAffectation(committed(), affectation(15, { affectation_id: 'R1', naturaleza_afectacion: 'RESERVA', banco_asignado: 'A' }), 'reserve');
  assert.equal(position(state).reservas_bloqueadas, 15); assert.equal(position(state).saldo_disponible_gestion, 65);
  assert.equal(calculateBankPosition(state, 'E', 'A', monetary()).reservas_bloqueadas, 15);
});
test('QA-P04 — Sin banco: reduce empresa a 70 y queda NO LOCALIZADO', () => {
  const state = registerAffectation(funded(), affectation(30), 'unassigned');
  assert.equal(position(state).saldo_disponible_gestion, 70);
  assert.deepEqual(position(state).localizaciones, [{ affectation_id: 'C1', banco_asignado: null, localizacion: 'NO LOCALIZADO' }]);
  assert.equal(calculateBankPosition(state, 'E', 'A', monetary()).disponibilidad_localizada_preliminar, 100);
});
test('QA-P05 — No doble descuento: saldo 90, reflejado 10, pendiente 10, disponible 80', () => {
  const before = committed(); assert.equal(position(before).saldo_disponible_gestion, 80);
  const stockUpdated = registerBalance(before, stock(90, 11), 'bank-confirmed');
  const next = registerAffectation(stockUpdated, change('AJUSTE', { monto_reflejado_confirmado: 10 }), 'confirm-10');
  assert.equal(position(next).compromisos_por_ejecutar, 10); assert.equal(position(next).saldo_disponible_gestion, 80);
  assert.equal(next.affectations[0].amount_original, 20);
});
test('QA-P06 — Caída bancaria sola no infiere ejecución: disponible 60', () => {
  const next = registerBalance(committed(), stock(80, 11), 'bank-drop');
  assert.equal(next.affectations[0].monto_reflejado_confirmado, 0);
  assert.equal(position(next).compromisos_por_ejecutar, 20); assert.equal(position(next).saldo_disponible_gestion, 60);
});
test('QA-P07 — Anular 20 devuelve disponible 100 y conserva trazabilidad', () => {
  const state = registerAffectation(committed(), change('ANULACION', { monto_anulado: 20, observacion: 'Cancelado' }), 'cancel-20');
  assert.equal(position(state).saldo_disponible_gestion, 100); assert.equal(state.affectations[0].estado, 'ANULADA');
  assert.equal(state.affectations[0].amount_original, 20);
  assert.equal(state.events.length, 3);
  assert.deepEqual(state.events[2].input, change('ANULACION', { monto_anulado: 20, observacion: 'Cancelado' }));
  assert.equal(state.events[2].request_id, 'cancel-20'); assert.equal(state.events[2].usuario, 'tesoreria');
  assert.equal(state.events[1].result.operacion, 'ALTA');
});
test('QA-P08 — Ajuste a 25 modifica vigente sin crear segundo compromiso', () => {
  const next = registerAffectation(committed(), change('AJUSTE', { monto_vigente: 25 }), 'adjust');
  assert.equal(position(next).compromisos_por_ejecutar, 25); assert.equal(next.affectations.length, 1);
  assert.equal(next.affectations[0].amount_original, 20);
  code(() => registerAffectation(next, change('AJUSTE', { affectation_id: 'unknown', monto_vigente: 30 }), 'unknown'), 'UNKNOWN_AFFECTATION_REFERENCE');
  code(() => registerAffectation(next, change('AJUSTE', { amount_original: 25, monto_vigente: 30 }), 'alter-original'), 'IMMUTABLE_AFFECTATION_FIELD');
});
test('QA-P09 — Lote idéntico es idempotente; contenido distinto con mismo ID se rechaza', () => {
  const rows = [stock(40), stock(60, 9, { cuenta: 'A2' })];
  const first = applyBalanceBatch(initial(), rows, 'X');
  assert.strictEqual(applyBalanceBatch(first, rows, 'X'), first);
  assert.equal(position(first).saldo_bancario, 100); assert.equal(first.events.length, 2);
  code(() => applyBalanceBatch(first, [stock(99)], 'X'), 'IDEMPOTENCY_CONFLICT');
  const affected = applyAffectationBatch(first, [affectation(20), affectation(15, { affectation_id: 'R', naturaleza_afectacion: 'RESERVA' })], 'aff-batch');
  assert.strictEqual(applyAffectationBatch(affected, [affectation(20), affectation(15, { affectation_id: 'R', naturaleza_afectacion: 'RESERVA' })], 'aff-batch'), affected);
  assert.equal(position(affected).saldo_disponible_gestion, 65);
});
test('QA-P10 — request_id repetido no duplica afectación', () => {
  const first = registerAffectation(funded(), affectation(20), 'Y');
  assert.strictEqual(registerAffectation(first, affectation(20), 'Y'), first);
  assert.equal(first.affectations.length, 1); assert.equal(position(first).saldo_disponible_gestion, 80);
  code(() => registerAffectation(first, affectation(30), 'Y'), 'IDEMPOTENCY_CONFLICT');
});
test('QA-P11 — Monedas explícitas y agregación incompleta sin tasa', () => {
  const state = applyBalanceBatch(initial(), [stock(36.5), stock(1, 9, { currency_original: 'USD' })], 'mixed');
  const canonical = position(state); assert.equal(canonical.saldo_bancario, 73); assert.equal(canonical.currency, 'VES');
  const usd = displayPosition(canonical, setDisplayCurrency(monetary(), 'USD'));
  assert.equal(usd.saldo_bancario, 2); assert.equal(usd.currency, 'USD');
  for (const bcv of [null, 0]) {
    const failed = calculateCompanyPosition(state, 'E', monetary(bcv));
    assert.equal(failed.publicable, false); assert.equal(failed.saldo_bancario, null);
    assert.equal(failed.errors[0].code, 'MISSING_EXCHANGE_RATE');
    assert.equal(calculateCompanyPosition(funded(), 'E', monetary(bcv)).saldo_bancario, 100);
  }
  const eur = registerBalance(funded(), stock(10, 11, { currency_original: 'EUR' }), 'eur');
  assert.equal(position(eur).errors[0].code, 'MISSING_EXCHANGE_RATE');
  assert.equal(calculateCompanyPosition(eur, 'F', monetary()).publicable, true);
  assert.equal(calculateBankPosition(eur, 'E', 'B', monetary()).publicable, true);
});
test('QA-P12 — Cuenta inexistente: preview ERROR y aplicación atómica', () => {
  const state = initial(); const before = structuredClone(state);
  const rows = [stock(100), stock(90, 9, { cuenta: 'missing' })];
  const preview = previewBalances(state, rows, { batch_id: 'invalid-account' });
  assert.equal(preview.status, 'ERROR'); assert.equal(preview.errors[0].code, 'INVALID_ACCOUNT');
  code(() => applyBalanceBatch(state, rows, 'invalid-account'), 'INVALID_ACCOUNT');
  assert.deepEqual(state, before);
  for (const extra of [{ empresa: 'unknown' }, { banco: 'unknown' }, { amount_original: NaN }, { currency_original: 'bad' }, { fecha_hora_saldo: '2026-02-30T12:00:00Z' }]) {
    assert.equal(previewBalances(state, [stock(100, 9, extra)], { batch_id: 'bad' }).status, 'ERROR');
  }
});
test('QA-P13 — Cuenta de otra empresa: ERROR sin mutación', () => {
  const state = funded(); const before = structuredClone(state);
  const preview = previewBalances(state, [stock(20, 11, { empresa: 'F' })], { request_id: 'wrong-owner' });
  assert.equal(preview.status, 'ERROR'); assert.equal(preview.errors[0].code, 'ACCOUNT_OWNER_MISMATCH');
  assert.deepEqual(state, before);
  assert.equal(previewBalances(state, [stock(20, 11, { banco: 'B' })], { request_id: 'wrong-bank' }).errors[0].code, 'ACCOUNT_OWNER_MISMATCH');
});
test('QA-P14 — Banco opcional inválido ERROR; ausente válido y NO LOCALIZADO', () => {
  const state = funded(); const before = structuredClone(state);
  const invalid = previewAffectations(state, [affectation(20, { banco_asignado: 'missing' })], { request_id: 'bad-bank' });
  assert.equal(invalid.status, 'ERROR'); assert.equal(invalid.errors[0].code, 'INVALID_BANK');
  assert.equal(previewAffectations(state, [affectation(20)], { request_id: 'good' }).status, 'VALID');
  assert.deepEqual(state, before);
  assert.equal(position(registerAffectation(state, affectation(20), 'good')).localizaciones[0].localizacion, 'NO LOCALIZADO');
  code(() => applyAffectationBatch(state, [affectation(20), affectation(-1, { affectation_id: 'bad' })], 'bad-batch'), 'INVALID_INITIAL_AMOUNT');
  assert.deepEqual(state, before);
});
test('QA-P15 — No anular más del pendiente o del vigente de reserva', () => {
  const confirmed = registerAffectation(committed(), change('AJUSTE', { monto_reflejado_confirmado: 10 }), 'confirmed');
  code(() => registerAffectation(confirmed, change('AJUSTE', { monto_reflejado_confirmado: 5 }), 'reverse-confirmation'), 'BLOCKED_BY_FUNCTIONAL_RULE');
  code(() => registerAffectation(confirmed, change('ANULACION', { monto_anulado: 5 }), 'partial-cancellation'), 'BLOCKED_BY_FUNCTIONAL_RULE');
  const preview = previewAffectations(confirmed, [change('ANULACION', { monto_anulado: 11 })], { request_id: 'too-much' });
  assert.equal(preview.status, 'ERROR'); assert.equal(preview.errors[0].code, 'EXCESSIVE_OR_INVALID_CANCELLATION');
  code(() => registerAffectation(confirmed, change('ANULACION', { monto_anulado: 11 }), 'too-much'), 'EXCESSIVE_OR_INVALID_CANCELLATION');
  const cancelled = registerAffectation(confirmed, change('ANULACION', { monto_anulado: 10 }), 'cancel-pending');
  assert.equal(cancelled.affectations[0].monto_reflejado_confirmado, 10);
  assert.equal(cancelled.affectations[0].amount_original, 20);
  assert.equal(position(cancelled).compromisos_por_ejecutar, 0);
  const reserve = registerAffectation(funded(), affectation(15, { naturaleza_afectacion: 'RESERVA' }), 'reserve');
  code(() => registerAffectation(reserve, change('ANULACION', { monto_anulado: 16 }), 'excess'), 'EXCESSIVE_OR_INVALID_CANCELLATION');
});
test('QA-P16 — Posición negativa: disponible -30, déficit 30', () => {
  const state = registerAffectation(funded(), affectation(130), 'deficit');
  assert.equal(position(state).saldo_disponible_gestion, -30); assert.equal(position(state).deficit, 30);
});
test('QA-P17 — Empresa negativa no genera remanente ni financia otra empresa', () => {
  let state = registerAffectation(funded(), affectation(130), 'deficit');
  state = registerBalance(state, stock(500, 9, { empresa: 'F', cuenta: 'F1' }), 'other-company');
  assert.equal(position(state).saldo_disponible_gestion, -30);
  assert.equal(calculateCompanyPosition(state, 'F', monetary()).saldo_disponible_gestion, 500);
  for (const result of [position(state), calculateBankPosition(state, 'E', 'A', monetary())]) {
    assert.ok(Object.keys(result).every(key => !key.includes('remanente')));
  }
});
test('QA-P18 — Múltiples cuentas 40 + 60 = 100', () => {
  const state = applyBalanceBatch(initial(), [stock(40), stock(60, 9, { cuenta: 'A2' })], 'two-accounts');
  assert.equal(state.balances.length, 2); assert.equal(position(state).saldo_bancario, 100);
});
test('QA-P19 — Múltiples bancos: empresa 100, bancos 70/30', () => {
  let state = applyBalanceBatch(initial(), [stock(70), stock(30, 9, { banco: 'B', cuenta: 'B1' })], 'two-banks');
  assert.equal(position(state).saldo_bancario, 100);
  assert.equal(calculateBankPosition(state, 'E', 'A', monetary()).saldo_bancario, 70);
  assert.equal(calculateBankPosition(state, 'E', 'B', monetary()).saldo_bancario, 30);
  state = registerAffectation(state, affectation(20, { banco_asignado: 'A' }), 'assigned');
  assert.equal(calculateBankPosition(state, 'E', 'A', monetary()).disponibilidad_localizada_preliminar, 50);
  assert.equal(calculateBankPosition(state, 'E', 'B', monetary()).disponibilidad_localizada_preliminar, 30);
});
test('QA-P20 — Conversión/agregación conserva todos los originales', () => {
  const input = stock(2, 9, { currency_original: 'USD' });
  let state = registerBalance(initial(), input, 'usd-stock');
  state = registerAffectation(state, affectation(1, { currency_original: 'USD' }), 'usd-affectation');
  const before = structuredClone(state); const inputBefore = structuredClone(input);
  const result = position(state); assert.equal(result.saldo_disponible_gestion, 36.5);
  displayPosition(result, setDisplayCurrency(monetary(), 'USD'));
  calculateBankPosition(state, 'E', 'A', monetary());
  assert.deepEqual(state, before); assert.deepEqual(input, inputBefore);
  assert.throws(() => { state.affectations[0].amount_original = 8; }, TypeError);
  const source = readFileSync(new URL('../src/position.js', import.meta.url), 'utf8');
  assert.ok(source.includes("from './money.js'"));
  assert.equal(source.includes('VES_USD_BCV'), false);
  assert.equal(source.includes('Intl.NumberFormat'), false);
});
