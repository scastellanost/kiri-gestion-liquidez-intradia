import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/state.js';
import { createPositionState, registerBalance, registerAffectation, calculateCompanyPosition } from '../src/position.js';
import { createNeed, saveNeedState, loadNeedState } from '../src/needs.js';
import { setPostureConfig, clearPostureConfig, buildPosture } from '../src/posture.js';

const time = hour => `2026-10-02T${String(hour).padStart(2, '0')}:00:00Z`;
const trace = (hour = 12) => ({ origen: 'QA-004', usuario: 'tesoreria', fecha_hora_evento: time(hour) });
const monetary = createState({ managedDate: '2026-10-02', rates: { VES_USD_BCV: { value: 36.5, source: 'BCV', timestamp: time(8) } } });
function initial(flags = {}) {
  return createPositionState({ empresas: ['E', 'F'], bancos: ['A', 'B'], cuentas: [
    { cuenta: 'A1', empresa: 'E', banco: 'A', monedas: ['VES', 'USD', 'EUR'], ...(flags.A1 ?? {}) },
    { cuenta: 'A2', empresa: 'E', banco: 'A', monedas: ['VES', 'USD', 'EUR'], ...(flags.A2 ?? {}) },
    { cuenta: 'B1', empresa: 'E', banco: 'B', monedas: ['VES', 'USD', 'EUR'] },
    { cuenta: 'F1', empresa: 'F', banco: 'A', monedas: ['VES'] }
  ] });
}
function balance(state, account, value, currency = 'VES', hour = 9) {
  const catalogue = state.catalogue.cuentas.find(c => c.cuenta === account);
  return registerBalance(state, { cuenta: account, empresa: catalogue.empresa, banco: catalogue.banco,
    amount_original: value, currency_original: currency, fecha_hora_saldo: time(hour), ...trace(hour) }, `stock-${account}-${currency}-${hour}`);
}
function balances(values, flags) {
  let state = initial(flags);
  for (const [id, amount] of Object.entries(values)) state = balance(state, id, amount);
  return state;
}
const config = (extra = {}) => ({ empresa: 'E', orden_bancos: ['A', 'B'], orden_cuentas_por_banco: { A: ['A1', 'A2'], B: ['B1'] }, ...trace(), ...extra });
const configure = (state, extra = {}) => setPostureConfig(state, config(extra), 'config');
function add(state, amount, id = 'OB1', extra = {}) {
  return registerAffectation(state, { affectation_id: id, empresa: 'E', tipo_partida: 'PAGO', naturaleza_afectacion: 'COMPROMISO',
    amount_original: amount, currency_original: 'VES', operacion: 'ALTA', ...trace(10), ...extra }, `aff-${id}`);
}
function classify(state, id = 'OB1', priority = 'P3_NORMAL', extra = {}) {
  return createNeed(state, { need_id: `N-${id}`, affectation_id: id, prioridad_economica: priority,
    rigidez_temporal: 'R4_FLEXIBLE', ...trace(11), ...extra }, `need-${id}`);
}
const build = state => buildPosture(state, 'E', monetary);
const tuples = result => result.asignaciones.map(a => [a.cuenta, a.monto_asignado]);
const company = state => calculateCompanyPosition(state, 'E', monetary);
function rejects(state, row, code) {
  const before = structuredClone(state);
  assert.throws(() => setPostureConfig(state, row, 'invalid'), { code }); assert.deepEqual(state, before);
}

test('QA-B01 — Configuración válida conserva y persiste orden exacto', () => {
  const row = config({ orden_bancos: ['B', 'A'], orden_cuentas_por_banco: { B: ['B1'], A: ['A2', 'A1'] } });
  const state = setPostureConfig(initial(), row, 'ordered');
  assert.deepEqual(state.postureConfigs[0].orden_bancos, ['B', 'A']);
  assert.deepEqual(state.postureConfigs[0].orden_cuentas_por_banco.A, ['A2', 'A1']);
  assert.equal(state.events.at(-1).operacion, 'SET_POSTURE_CONFIG'); assert.equal(state.events.at(-1).antes, null);
  const data = new Map(); const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  saveNeedState(storage, state); const restored = loadNeedState(storage);
  assert.deepEqual(restored, state); assert.strictEqual(setPostureConfig(restored, row, 'ordered'), restored);
});
test('QA-B02 — Cuenta inexistente en configuración: ERROR', () => {
  rejects(initial(), config({ orden_cuentas_por_banco: { A: ['missing'] } }), 'INVALID_ACCOUNT');
  rejects(initial(), config({ orden_bancos: ['missing'] }), 'INVALID_BANK');
});
test('QA-B03 — Cuenta de otra empresa o banco: ERROR', () => {
  rejects(initial(), config({ orden_cuentas_por_banco: { A: ['F1'] } }), 'ACCOUNT_OWNER_MISMATCH');
  rejects(initial(), config({ orden_cuentas_por_banco: { B: ['A1'] } }), 'ACCOUNT_OWNER_MISMATCH');
  const state = configure(add(balances({ A1: 10, F1: 100 }), 20));
  assert.equal(build(state).afectaciones[0].monto_localizado, 10);
  assert.ok(build(state).cuentas.every(a => a.empresa === 'E'));
});
test('QA-B04 — Banco duplicado: ERROR', () => {
  rejects(initial(), config({ orden_bancos: ['A', 'A'] }), 'DUPLICATE_POSTURE_BANK');
});
test('QA-B05 — Cuenta duplicada: ERROR', () => {
  rejects(initial(), config({ orden_cuentas_por_banco: { A: ['A1', 'A1'] } }), 'DUPLICATE_POSTURE_ACCOUNT');
});
test('QA-B06 — Banco A explícito: 16 se localiza 10+6', () => {
  const result = build(configure(add(balances({ A1: 10, A2: 8 }), 16, 'OB1', { banco_asignado: 'A' }))).afectaciones[0];
  assert.deepEqual(tuples(result), [['A1', 10], ['A2', 6]]);
  assert.equal(result.monto_no_localizado, 0); assert.equal(result.estado_localizacion, 'LOCALIZADA_TOTAL');
});
test('QA-B07 — Banco A explícito no usa B: localizado 15, residual 5', () => {
  const result = build(configure(add(balances({ A1: 10, A2: 5, B1: 100 }), 20, 'OB1', { banco_asignado: 'A' })));
  assert.deepEqual(tuples(result.afectaciones[0]), [['A1', 10], ['A2', 5]]);
  assert.equal(result.afectaciones[0].monto_no_localizado, 5);
  assert.equal(result.cuentas.find(a => a.cuenta === 'B1').monto_asignado_postura, 0);
});
test('QA-B08 — Sin banco usa A→B: localizado 15+5', () => {
  const result = build(configure(add(balances({ A1: 15, B1: 10 }), 20))).afectaciones[0];
  assert.deepEqual(tuples(result), [['A1', 15], ['B1', 5]]); assert.equal(result.monto_no_localizado, 0);
});
test('QA-B09 — Agota cuentas intrabanco antes del siguiente banco', () => {
  const result = build(configure(add(balances({ A1: 10, A2: 8, B1: 100 }), 16)));
  assert.deepEqual(tuples(result.afectaciones[0]), [['A1', 10], ['A2', 6]]);
  assert.equal(result.cuentas.find(a => a.cuenta === 'B1').monto_asignado_postura, 0);
  assert.deepEqual(result.afectaciones[0].recorrido.map(step => step.cuenta), ['A1', 'A2']);
});
test('QA-B10 — Dos afectaciones 12/8 comparten 15 sin doble uso', () => {
  let state = add(add(balances({ A1: 15 }), 12), 8, 'OB2');
  state = configure(classify(classify(state), 'OB2'));
  const result = build(state);
  assert.deepEqual(result.afectaciones.map(a => a.monto_localizado), [12, 3]);
  assert.equal(result.afectaciones[1].monto_no_localizado, 5);
  assert.equal(result.cuentas.find(a => a.cuenta === 'A1').monto_asignado_postura, 15);
});
test('QA-B11 — Orden de CODEX-003: P1 antes que P3', () => {
  let state = add(add(balances({ A1: 15 }), 12), 8, 'OB2');
  state = configure(classify(classify(state, 'OB1', 'P3_NORMAL'), 'OB2', 'P1_CRITICA'));
  const result = build(state);
  assert.deepEqual(result.afectaciones.map(a => a.affectation_id), ['OB2', 'OB1']);
  assert.deepEqual(result.afectaciones.map(a => a.monto_localizado), [8, 7]);
});
test('QA-B12 — UNCLASSIFIED se procesa después de clasificadas', () => {
  const state = configure(classify(add(add(balances({ A1: 15 }), 12), 8, 'OB2'), 'OB2'));
  const result = build(state);
  assert.deepEqual(result.afectaciones.map(a => a.affectation_id), ['OB2', 'OB1']);
  assert.deepEqual(result.afectaciones.map(a => a.monto_localizado), [8, 7]);
  assert.equal(result.afectaciones[1].clasificacion, 'UNCLASSIFIED_NEED');
});
test('QA-B13 — Reserva activa se localiza sin cambiar economía', () => {
  const state = configure(add(balances({ A1: 20 }), 15, 'OB1', { naturaleza_afectacion: 'RESERVA' }));
  const before = company(state); const result = build(state);
  assert.equal(result.afectaciones[0].naturaleza, 'RESERVA'); assert.equal(result.afectaciones[0].monto_localizado, 15);
  assert.deepEqual(company(state), before);
});
test('QA-B14 — Postura deja intacta disponibilidad y estado de empresa', () => {
  const state = configure(add(balances({ A1: 100 }), 20)); const before = structuredClone(state);
  const result = build(state);
  assert.equal(result.saldo_disponible_gestion, 80); assert.equal(company(state).saldo_disponible_gestion, 80);
  assert.deepEqual(state, before); assert.equal(state.affectations[0].banco_asignado, null);
});
test('QA-B15 — Localizado + residual = pendiente económico', () => {
  const state = configure(add(add(balances({ A1: 15 }), 20, 'OB1', { monto_reflejado_confirmado: 10 }), 20, 'OB2', { naturaleza_afectacion: 'RESERVA' }));
  for (const result of build(state).afectaciones) {
    assert.equal(result.monto_localizado + result.monto_no_localizado, result.monto_pendiente);
    assert.equal(result.asignaciones.reduce((total, a) => total + a.monto_asignado, 0), result.monto_localizado);
  }
  assert.equal(build(state).afectaciones[0].monto_pendiente, 10);
});
test('QA-B16 — Capacidad nunca negativa; no usa cuentas no elegibles', () => {
  const state = configure(add(balances({ A1: -5, A2: 10, B1: 0 }), 100));
  const result = build(state);
  assert.ok(result.cuentas.every(a => a.capacidad_restante_postura >= 0));
  assert.deepEqual(tuples(result.afectaciones[0]), [['A2', 10]]);
  const flagged = configure(add(balances({ A1: 100, A2: 100, B1: 5 }, { A1: { moneda_ambigua: true }, A2: { no_utilizable: true } }), 20));
  assert.deepEqual(tuples(build(flagged).afectaciones[0]), [['B1', 5]]);
});
test('QA-B17 — Anulada no consume postura; reconstrucción libera capacidad', () => {
  const state = configure(add(balances({ A1: 20 }), 10)); assert.equal(build(state).afectaciones[0].monto_localizado, 10);
  const cancelled = registerAffectation(state, { affectation_id: 'OB1', operacion: 'ANULACION', monto_anulado: 10, ...trace(13) }, 'cancel');
  assert.equal(build(cancelled).afectaciones.length, 0);
  assert.equal(build(cancelled).cuentas.find(a => a.cuenta === 'A1').capacidad_restante_postura, 20);
});
test('QA-B18 — Pendiente cero no consume postura', () => {
  const result = build(configure(add(balances({ A1: 20 }), 10, 'OB1', { monto_reflejado_confirmado: 10 })));
  assert.equal(result.afectaciones.length, 0);
  assert.equal(result.cuentas.find(a => a.cuenta === 'A1').monto_asignado_postura, 0);
});
test('QA-B19 — Reconstrucción determinística, independiente del orden de saldos', () => {
  const state = configure(add(balances({ B1: 100, A2: 8, A1: 10 }), 16));
  const first = build(state); assert.deepEqual(build(state), first);
  assert.deepEqual(build({ ...state, balances: [...state.balances].reverse() }), first);
  assert.deepEqual(tuples(first.afectaciones[0]), [['A1', 10], ['A2', 6]]);
});
test('QA-B20 — Nuevo saldo 10→20 reconstruye sin acumular asignaciones', () => {
  const state = configure(add(balances({ A1: 10 }), 15)); assert.equal(build(state).afectaciones[0].monto_localizado, 10);
  const next = balance(state, 'A1', 20, 'VES', 14); const result = build(next);
  assert.equal(result.afectaciones[0].monto_localizado, 15);
  assert.equal(result.cuentas.find(a => a.cuenta === 'A1').capacidad_restante_postura, 5);
  assert.deepEqual(build(next), result);
});
test('QA-B21 — Sin configuración o configuración vacía: NO_LOCALIZADA', () => {
  const state = add(balances({ A1: 100 }), 20);
  assert.equal(build(state).afectaciones[0].estado_localizacion, 'NO_LOCALIZADA');
  assert.equal(build(state).afectaciones[0].monto_no_localizado, 20);
  const empty = configure(state, { orden_bancos: [], orden_cuentas_por_banco: {} });
  assert.equal(build(empty).afectaciones[0].estado_localizacion, 'NO_LOCALIZADA');
  const cleared = clearPostureConfig(configure(state), { empresa: 'E', ...trace(13) }, 'clear');
  assert.equal(build(cleared).afectaciones[0].estado_localizacion, 'NO_LOCALIZADA');
  assert.equal(cleared.events.at(-1).operacion, 'CLEAR_POSTURE_CONFIG'); assert.equal(cleared.events.at(-1).despues, null);
});
test('QA-B22 — Banco explícito requiere orden de cuentas; no requiere orden de bancos', () => {
  const state = add(balances({ A1: 10, A2: 100 }), 20, 'OB1', { banco_asignado: 'A' });
  assert.equal(build(state).afectaciones[0].estado_localizacion, 'NO_LOCALIZADA');
  const configured = configure(state, { orden_bancos: [], orden_cuentas_por_banco: { A: ['A1'] } });
  assert.deepEqual(tuples(build(configured).afectaciones[0]), [['A1', 10]]);
  assert.equal(build(configured).afectaciones[0].monto_no_localizado, 10);
});
test('QA-B23 — Cuenta USD participa por equivalente VES con BCV', () => {
  const state = configure(add(balance(initial(), 'A1', 1, 'USD'), 30));
  const result = build(state);
  assert.equal(result.cuentas.find(a => a.cuenta === 'A1').saldo_vigente, 36.5);
  assert.equal(result.afectaciones[0].monto_localizado, 30);
  assert.equal(result.cuentas.find(a => a.cuenta === 'A1').capacidad_restante_postura, 6.5);
});
test('QA-B24 — Sin tasa: ruta no publicable, sin asignación parcial silenciosa', () => {
  let state = balance(balances({ A1: 100 }), 'B1', 10, 'EUR');
  state = configure(add(state, 20)); const result = build(state);
  assert.equal(result.publicable, false); assert.equal(result.afectaciones[0].publicable, false);
  assert.equal(result.afectaciones[0].errors[0].code, 'MISSING_EXCHANGE_RATE');
  assert.equal(result.afectaciones[0].asignaciones.length, 0);
  assert.equal(result.cuentas.find(a => a.cuenta === 'A1').monto_asignado_postura, 0);
  const isolated = add(state, 10, 'OB2', { banco_asignado: 'A' });
  const independent = build(isolated).afectaciones.find(a => a.affectation_id === 'OB2');
  assert.equal(independent.publicable, true); assert.equal(independent.monto_localizado, 10);
  const noBCV = createState({ managedDate: '2026-10-02' });
  const usd = configure(add(balance(initial(), 'A1', 1, 'USD'), 10));
  assert.equal(buildPosture(usd, 'E', noBCV).afectaciones[0].publicable, false);
});
test('QA-B25 — Postura conserva originales y entradas', () => {
  const state = configure(add(balance(initial(), 'A1', 2, 'USD'), 1, 'OB1', { currency_original: 'USD' }));
  const before = structuredClone(state); const result = build(state);
  assert.equal(result.afectaciones[0].monto_pendiente, 36.5);
  assert.equal(result.afectaciones[0].monto_localizado, 36.5);
  assert.deepEqual(state, before); assert.equal(state.balances[0].amount_original, 2);
  assert.equal(state.balances[0].currency_original, 'USD'); assert.equal(state.affectations[0].amount_original, 1);
});
test('QA-B26 — Vista cuenta: saldo 10, asignado 6, restante 4', () => {
  const result = build(configure(add(balances({ A1: 10 }), 6))).cuentas.find(a => a.cuenta === 'A1');
  assert.equal(result.saldo_vigente, 10); assert.equal(result.monto_asignado_postura, 6); assert.equal(result.capacidad_restante_postura, 4);
});
test('QA-B27 — Vista banco: saldo 18, asignado 16, restante 2', () => {
  const result = build(configure(add(balances({ A1: 10, A2: 8 }), 16))).bancos.find(b => b.banco === 'A');
  assert.equal(result.saldo_bancario, 18); assert.equal(result.monto_asignado_postura, 16); assert.equal(result.capacidad_restante_postura, 2);
  assert.deepEqual(result.afectaciones_localizadas, ['OB1']);
});
test('QA-B28 — Residual explícito se expone únicamente en su banco', () => {
  const result = build(configure(add(balances({ A1: 15, B1: 100 }), 20, 'OB1', { banco_asignado: 'A' })));
  assert.equal(result.bancos.find(b => b.banco === 'A').residual_no_localizado_en_banco, 5);
  assert.equal(result.bancos.find(b => b.banco === 'B').residual_no_localizado_en_banco, 0);
});
test('QA-B29 — Idempotencia SET y CLEAR sin duplicar eventos', () => {
  const row = config(); const state = setPostureConfig(initial(), row, 'same');
  assert.strictEqual(setPostureConfig(state, row, 'same'), state);
  const clear = { empresa: 'E', ...trace(13) }; const cleared = clearPostureConfig(state, clear, 'clear');
  assert.strictEqual(clearPostureConfig(cleared, clear, 'clear'), cleared);
  assert.equal(cleared.events.length, 2); assert.equal(cleared.events[1].request_id, 'clear');
  assert.deepEqual(cleared.events[1].antes, state.postureConfigs[0]);
});
test('QA-B30 — Mismo request_id y otro payload: IDEMPOTENCY_CONFLICT', () => {
  const state = setPostureConfig(initial(), config(), 'same'); const before = structuredClone(state);
  assert.throws(() => setPostureConfig(state, config({ orden_bancos: ['B', 'A'] }), 'same'), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.throws(() => clearPostureConfig(state, { empresa: 'E', ...trace() }, 'same'), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.throws(() => setPostureConfig(initial(), config(), ''), { code: 'INVALID_IDEMPOTENCY_KEY' });
  assert.deepEqual(state, before);
});
