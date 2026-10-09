import test from 'node:test';
import assert from 'node:assert/strict';
import { createPositionState, registerBalance, registerAffectation, calculateCompanyPosition, calculateBankPosition } from '../src/position.js';
import { createState } from '../src/state.js';
import { sumOriginals, consolidateMoney } from '../src/money.js';
import { buildNeedQueue } from '../src/needs.js';

const time = '2026-10-09T10:00:00Z';
const monetaryState = createState({ managedDate: '2026-10-09' });
function fixture(balance = 0.30, commitments = [0.10, 0.20], reserves = []) {
  let state = createPositionState({ empresas:['KIRI'], bancos:['BANK'], cuentas:[
    {cuenta:'ACCOUNT', empresa:'KIRI', banco:'BANK', monedas:['VES']}
  ] });
  state = registerBalance(state, { empresa:'KIRI', banco:'BANK', cuenta:'ACCOUNT', amount_original:balance,
    currency_original:'VES', fecha_hora_saldo:time, origen:'QA', fecha_hora_evento:time }, 'balance');
  for (const [nature, amounts] of [['COMPROMISO', commitments], ['RESERVA', reserves]]) {
    for (const amount of amounts) {
      const id = 'A' + state.affectations.length;
      state = registerAffectation(state, { operacion:'ALTA', affectation_id:id, empresa:'KIRI',
        tipo_partida:'OPERACION', naturaleza_afectacion:nature, amount_original:amount, currency_original:'VES',
        banco_asignado:'BANK', origen:'QA', fecha_hora_evento:time }, 'req-' + id);
    }
  }
  return state;
}
test('S09 balanced VES position has precisely zero available, deficit and queue gap', () => {
  const s = fixture();
  const p = calculateCompanyPosition(s,'KIRI', monetaryState);
  const b = calculateBankPosition(s,'KIRI','BANK',monetaryState);
  const q = buildNeedQueue(s,'KIRI',monetaryState);
  assert.equal(p.publicable,true);
  assert.equal(p.compromisos_por_ejecutar,0.30);
  assert.equal(p.saldo_disponible_gestion,0);
  assert.equal(p.deficit,0);
  assert.equal(b.disponibilidad_localizada_preliminar,0);
  assert.equal(q.total_necesidad_vigente,0.30);
  assert.equal(q.brecha_consolidada,0);
});
test('S09 real deficit is exactly 0.01 without residue', () => {
  const s=fixture(0.29);
  const p=calculateCompanyPosition(s,'KIRI',monetaryState);
  assert.equal(p.saldo_disponible_gestion,-0.01);
  assert.equal(p.deficit,0.01);
});
test('S09 reserves do not create a phantom deficit', () => {
  const s=fixture(0.30,[0.10],[0.20]);
  const p=calculateCompanyPosition(s,'KIRI',monetaryState);
  assert.equal(p.reservas_bloqueadas,0.20);
  assert.equal(p.saldo_disponible_gestion,0);
  assert.equal(p.deficit,0);
});
test('same-currency collection sums exactly, originals preserved', () => {
  const values=[0.10,0.20].map(amount_original=>({amount_original,currency_original:'VES'}));
  assert.equal(sumOriginals(values).amount_original,0.30);
  assert.equal(consolidateMoney(values,'VES',monetaryState).amount,0.30);
  assert.deepEqual(values.map(x=>x.amount_original),[0.10,0.20]);
});
