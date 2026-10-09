import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/state.js';
import { createMoney, sumOriginals, consolidateMoney, convertMoney } from '../src/money.js';
import { createPositionState, registerBalance, registerAffectation, calculateCompanyPosition, calculateBankPosition } from '../src/position.js';
import { buildNeedQueue, saveNeedState, loadNeedState } from '../src/needs.js';
const time='2026-10-09T10:00:00Z';
const money=createState({managedDate:'2026-10-09',rates:{VES_USD_BCV:{value:37.123456,source:'BCV',timestamp:time},EUR_VES:{value:41.12345,source:'QA',timestamp:time}}});
function position(balance, commitments, reserves=[], currency='VES') {
  let s=createPositionState({empresas:['E'],bancos:['B'],cuentas:[{cuenta:'C',empresa:'E',banco:'B',monedas:['VES','USD','EUR']}]});
  s=registerBalance(s,{empresa:'E',banco:'B',cuenta:'C',amount_original:balance,currency_original:currency,fecha_hora_saldo:time,fecha_hora_evento:time,origen:'SELF_TEST'},'saldo');
  for(const [nature,rows] of [['COMPROMISO',commitments],['RESERVA',reserves]]) for(const amount of rows) {
    const id=String(s.affectations.length);
    s=registerAffectation(s,{operacion:'ALTA',affectation_id:id,empresa:'E',banco_asignado:'B',tipo_partida:'OPERACION',naturaleza_afectacion:nature,amount_original:amount,currency_original:currency,fecha_hora_evento:time,origen:'SELF_TEST'},id);
  }
  return s;
}
test('S09 sweep: 1500 balanced same-currency positions have zero deficit/gap',()=>{
  for(let i=1;i<=1500;i++) {
    const a=i/100, b=(1501-i)/100, balance=15.01;
    const s=position(balance,[a],i%2?[b]:[]);
    const state=i%2?s:position(balance,[a,b]);const before=JSON.stringify(state);
    const p=calculateCompanyPosition(state,'E',money), bank=calculateBankPosition(state,'E','B',money), q=buildNeedQueue(state,'E',money);
    assert.equal(p.publicable,true);assert.equal(p.saldo_disponible_gestion,0);assert.equal(p.deficit,0);
    assert.equal(bank.disponibilidad_localizada_preliminar,0);assert.equal(q.brecha_consolidada,0);assert.equal(q.total_necesidad_vigente,balance);
    assert.equal(state.needs?.length??0,0);assert.equal(JSON.stringify(state),before);
  }
});
test('S09 exact real deficits and surplus at small/large scale',()=>{
  for(const [balance,commitments,reserves,expected] of [[0.29,[0.1],[0.2],-0.01],[0.31,[0.1,0.2],[],0.01],[0.00029,[0.0001],[0.0002],-0.00001],[1250.3,[250.1],[1000.2],0]]) {
    const s=position(balance,commitments,reserves),p=calculateCompanyPosition(s,'E',money);
    assert.equal(p.saldo_disponible_gestion,expected);assert.equal(p.deficit,expected<0?-expected:0);
  }
});
test('S09/S12 native-currency sums retain scales and explicit precision failures',()=>{
  for(const currency of ['VES','USD','EUR']) {
    const records=[createMoney(0.0001,currency),createMoney(0.0002,currency)];
    assert.equal(sumOriginals(records).amount_original,0.0003);
    assert.equal(consolidateMoney(records,currency,money).amount,0.0003);
    assert.deepEqual(records,[createMoney(0.0001,currency),createMoney(0.0002,currency)]);
  }
  const records=[createMoney(1e20,'VES'),createMoney(1,'VES')];
  assert.throws(()=>sumOriginals(records),{code:'MONETARY_PRECISION_UNSUPPORTED'});
  assert.throws(()=>consolidateMoney(records,'VES',money),{code:'MONETARY_PRECISION_UNSUPPORTED'});
  const p=calculateCompanyPosition(position(1e20,[1]),'E',money);
  assert.equal(p.publicable,false);assert.equal(p.errors[0].code,'MONETARY_PRECISION_UNSUPPORTED');assert.equal(p.deficit,null);
});
test('S12 heterogeneous FX keeps previous conversion and binary aggregation',()=>{
  const records=[createMoney(0.1,'VES'),createMoney(0.2,'USD'),createMoney(0.3,'EUR')];const before=JSON.stringify(records);
  const expected=0.1+0.2*37.123456+0.3*41.12345;
  assert.equal(convertMoney(records[1],'VES',money).amount,0.2*37.123456);
  assert.equal(convertMoney(records[2],'VES',money).amount,0.3*41.12345);
  assert.equal(consolidateMoney(records,'VES',money).amount,expected);assert.equal(JSON.stringify(records),before);
  assert.throws(()=>consolidateMoney([createMoney(1,'USD')],'VES',createState({managedDate:'2026-10-09'})),{code:'MISSING_EXCHANGE_RATE'});
});
test('S08 balanced position persists unchanged and derives zero gap after reload',()=>{
  const s=position(0.3,[0.1],[0.2]);let payload=null;
  const storage={getItem:()=>payload,setItem:(k,v)=>payload=v};saveNeedState(storage,s);
  const restored=loadNeedState(storage);assert.deepEqual(restored,s);
  assert.equal(buildNeedQueue(restored,'E',money).brecha_consolidada,0);
});
