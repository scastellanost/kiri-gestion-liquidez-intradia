import test from 'node:test';
import assert from 'node:assert/strict';
import { addDecimal, subtractDecimal, compareDecimal } from '../src/money.js';
import { createPositionState, registerAffectation, getAffectationPending } from '../src/position.js';
import { loadNeedState, createNeed, buildNeedQueue } from '../src/needs.js';
import { createState } from '../src/state.js';

const time = '2026-10-09T10:00:00Z';
const base = () => createPositionState({ empresas: ['KIRI'], bancos: ['B1'], cuentas: [] });
const register = (state, id, amount, nature = 'COMPROMISO') => registerAffectation(state, {
  operacion: 'ALTA', affectation_id: id, empresa: 'KIRI', tipo_partida: 'OPERACION',
  naturaleza_afectacion: nature, amount_original: amount, currency_original: 'VES',
  origen: 'QA', fecha_hora_evento: time
}, 'create-' + id);
const cancel = (state, id, amount, request) => registerAffectation(state, {
  operacion: 'ANULACION', affectation_id: id, monto_anulado: amount,
  origen: 'QA', fecha_hora_evento: time
}, request);

test('decimal additions/subtractions have no phantom residue', () => {
  assert.equal(subtractDecimal(1250.30, 250.10), 1000.20);
  assert.equal(subtractDecimal(1.10, 1.00), 0.10);
  assert.equal(subtractDecimal(0.10, 0.10), 0);
  assert.equal(addDecimal(0.10, 0.20), 0.30);
  assert.equal(compareDecimal(0.10, 0.10000000000000002), -1);
});
test('partial then final cancellation closes commitment exactly', () => {
  let s = register(base(), 'A', 1250.30);
  s = cancel(s, 'A', 250.10, 'a1');
  assert.equal(getAffectationPending(s.affectations[0]), 1000.20);
  s = cancel(s, 'A', 1000.20, 'a2');
  assert.equal(s.affectations[0].estado, 'ANULADA');
  assert.equal(getAffectationPending(s.affectations[0]), 0);
});
test('multiple small cancellations leave no residue for reserves', () => {
  let s = register(base(), 'B', 1.10, 'RESERVA');
  s = cancel(s, 'B', 1.00, 'b1');
  s = cancel(s, 'B', 0.10, 'b2');
  assert.equal(s.affectations[0].monto_vigente, 0);
  assert.equal(s.affectations[0].estado, 'ANULADA');
});
test('over-cancellation rejects without mutating state', () => {
  let s = register(base(), 'C', 1.10);
  s = cancel(s, 'C', 1.00, 'c1');
  assert.throws(() => cancel(s, 'C', 0.11, 'c2'), {code:'EXCESSIVE_OR_INVALID_CANCELLATION'});
  assert.equal(getAffectationPending(s.affectations[0]), 0.10);
});
test('persisted state with duplicate active needs is rejected', () => {
  const s = register(base(), 'D', 10);
  const clone = structuredClone(s);
  const need = { need_id:'N1', affectation_id:'D', empresa:'KIRI', tipo_partida:'OPERACION',
    naturaleza:'COMPROMISO', amount_original:10, currency_original:'VES', monto_vigente:10,
    prioridad_economica:'P1_CRITICA', rigidez_temporal:'R4_FLEXIBLE',
    fecha_hora_objetivo:null, estado:'ACTIVA', requiere_seguimiento_adicional:false,
    origen:'QA', fecha_hora_evento:time };
  clone.needs = [need,{...need,need_id:'N2'}];
  const storage = {getItem:()=>JSON.stringify({version:1,state:clone})};
  assert.throws(()=>loadNeedState(storage), {code:'INVALID_STORED_NEED_STATE'});
});

test('S10 precedence R1 R2 R3 R4 dominates economic priority and target date', () => {
  let s = base();
  const rows = [
    ['R4', 'R4_FLEXIBLE', 'P1_CRITICA', null],
    ['R3', 'R3_FECHA_RIGIDA', 'P1_CRITICA', '2026-10-09T10:01:00Z'],
    ['R2', 'R2_VENTANA_DIA', 'P4_DISCRECIONAL', null],
    ['R1', 'R1_HORA_RIGIDA', 'P4_DISCRECIONAL', '2026-10-10T10:00:00Z']
  ];
  for (const [need_id, rigidez_temporal, prioridad_economica, fecha_hora_objetivo] of rows) {
    s = createNeed(s, {need_id, empresa:'KIRI', tipo_partida:'OPERACION',
      naturaleza:'COMPROMISO', amount_original:1, currency_original:'VES',
      rigidez_temporal, prioridad_economica, fecha_hora_objetivo,
      origen:'QA', fecha_hora_evento:time}, 'create-' + need_id);
  }
  const q = buildNeedQueue(s,'KIRI', createState({managedDate:'2026-10-09'}));
  assert.deepEqual(q.necesidades_sin_vinculo.map(n=>n.need_id), ['R1','R2','R3','R4']);
});
test('S08 rejects negative balances and invalid reflected amount', () => {
  const original = register(base(), 'E', 20);
  for (const field of [{monto_vigente:-1},{monto_reflejado_confirmado:21}]) {
    const cloned = structuredClone(original);
    Object.assign(cloned.affectations[0], field);
    const storage = {getItem:()=>JSON.stringify({version:1,state:cloned})};
    assert.throws(()=>loadNeedState(storage),{code:'INVALID_STORED_NEED_STATE'});
  }
});
test('S08 rejects unparseable payload with stable error', () => {
  assert.throws(()=>loadNeedState({getItem:()=>'{broken'}),{code:'INVALID_STORED_NEED_STATE'});
});
