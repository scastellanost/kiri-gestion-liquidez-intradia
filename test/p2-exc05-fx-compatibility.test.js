import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/state.js';
import { consolidateMoney, createMoney } from '../src/money.js';
import { createPositionState, registerBalance, registerAffectation, calculateCompanyPosition, calculateBankPosition } from '../src/position.js';
import { buildNeedQueue } from '../src/needs.js';
const time='2026-10-09T10:00:00Z';
function fixture(balances,commitments,reserves) {
  let s=createPositionState({empresas:['E'],bancos:['B','N'],cuentas:balances.map((r,i)=>({cuenta:String(i),empresa:'E',banco:'B',monedas:[r[1]]}))});
  for(const [i,[amount,currency]] of balances.entries()) s=registerBalance(s,{empresa:'E',banco:'B',cuenta:String(i),amount_original:amount,currency_original:currency,fecha_hora_saldo:time,fecha_hora_evento:time,origen:'SELF_TEST'},'b'+i);
  for(const [nature,rows] of [['COMPROMISO',commitments],['RESERVA',reserves]]) for(const [amount,currency] of rows) {
    const id=String(s.affectations.length);
    s=registerAffectation(s,{operacion:'ALTA',affectation_id:id,empresa:'E',banco_asignado:'B',tipo_partida:'OPERACION',naturaleza_afectacion:nature,amount_original:amount,currency_original:currency,fecha_hora_evento:time,origen:'SELF_TEST'},'a'+id);
  }
  return s;
}
const monetary=rate=>createState({managedDate:'2026-10-09',rates:{VES_USD_BCV:{value:rate,source:'QA',timestamp:time},EUR_VES:{value:rate*1.123456,source:'QA',timestamp:time}}});
function check(balances,commitments,reserves,rate) {
  const s=fixture(balances,commitments,reserves),m=monetary(rate),before=JSON.stringify(s);
  const sum=rows=>consolidateMoney(rows.map(([a,c])=>createMoney(a,c)),'VES',m).amount;
  const expected=sum(balances)-sum(commitments)-sum(reserves);
  const p=calculateCompanyPosition(s,'E',m),b=calculateBankPosition(s,'E','B',m),q=buildNeedQueue(s,'E',m);
  assert.equal(p.publicable,true);assert.equal(q.publicable,true);assert.deepEqual(p.errors,[]);assert.deepEqual(q.errors,[]);
  assert.equal(p.saldo_disponible_gestion,expected);assert.equal(p.deficit,Math.max(0,-expected));
  assert.equal(b.disponibilidad_localizada_preliminar,expected);assert.equal(q.brecha_consolidada,p.deficit);
  assert.equal(q.total_necesidad_vigente,sum(commitments)+sum(reserves));assert.equal(JSON.stringify(s),before);
}
test('S12 EXC05 minimal non-publicable and queue-throw reproductions',()=>{
  check([[5624.34,'USD'],[82075.82,'VES']],[[5792.17,'VES']],[[18.25,'VES']],36.4721);
  check([[4087.82,'USD'],[54425.29,'VES']],[[9024.27,'USD']],[],191.6489);
});
test('S12 2000 deterministic multimoneda positions retain existing FX numeric path',()=>{
  let seed=20261009;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const amount=()=>((random()%10000000)+1)/100;
  const rates=[36.5,36.4721,37.123456,40.1234,191.6489];
  for(let i=0;i<2000;i++) check([[amount(),'VES'],[amount(),'USD'],[amount(),'EUR']],[[amount(),i%2?'USD':'VES'],[amount(),'EUR']],[[amount(),i%3?'VES':'USD']],rates[i%rates.length]);
});
test('S09/S12 unrelated FX bank does not disable native precision in selected bank',()=>{
  let s=fixture([[1,'USD']],[[0.1,'VES']],[[0.2,'VES']]);
  s=structuredClone(s);s.catalogue.cuentas.push({cuenta:'native',empresa:'E',banco:'N',monedas:['VES']});
  for(const a of s.affectations)a.banco_asignado='N';
  s=registerBalance(s,{empresa:'E',banco:'N',cuenta:'native',amount_original:0.3,currency_original:'VES',fecha_hora_saldo:time,fecha_hora_evento:time,origen:'SELF_TEST'},'native');
  assert.equal(calculateBankPosition(s,'E','N',monetary(36.4721)).disponibilidad_localizada_preliminar,0);
});
test('S08/S12 missing rate and native precision failures return controlled queue errors',()=>{
  const missing=buildNeedQueue(fixture([[1,'USD']],[],[]),'E',createState({managedDate:'2026-10-09'}));
  assert.equal(missing.publicable,false);assert.equal(missing.errors[0].code,'MISSING_EXCHANGE_RATE');assert.equal(missing.total_necesidad_vigente,null);
  // Individually representable components cancel to a representable position,
  // but the queue total 1e20 + 1 cannot be represented exactly.
  const native=buildNeedQueue(fixture([[1e20,'VES'],[1,'VES']],[[1e20,'VES']],[[1,'VES']]),'E',monetary(36.5));
  assert.equal(native.publicable,false);assert.equal(native.errors[0].code,'MONETARY_PRECISION_UNSUPPORTED');
  const s=fixture([[1,'VES']],[],[]);const corrupt=structuredClone(s);
  corrupt.needs=[{empresa:'E',estado:'ACTIVA',affectation_id:'missing'}];
  const q=buildNeedQueue(corrupt,'E',monetary(36.5));assert.equal(q.publicable,false);assert.equal(q.errors[0].code,'UNKNOWN_AFFECTATION_REFERENCE');
});
test('S09 queue total overflow is controlled after representable native position',()=>{
  const q=buildNeedQueue(fixture([[1e20,'VES']],[[1e20,'VES']],[[1,'VES']]),'E',monetary(36.5));
  assert.equal(q.publicable,false);assert.equal(q.errors[0].code,'MONETARY_PRECISION_UNSUPPORTED');
  assert.equal(q.total_necesidad_vigente,null);assert.equal(q.brecha_consolidada,null);assert.ok(Object.isFrozen(q));
});
