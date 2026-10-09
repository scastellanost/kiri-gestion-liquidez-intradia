import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/state.js';
import { convertMoney, createMoney, consolidateMoney } from '../src/money.js';
import { createPositionState,registerBalance,registerAffectation,calculateCompanyPosition,calculateBankPosition } from '../src/position.js';
import { buildNeedQueue,saveNeedState,loadNeedState } from '../src/needs.js';
const time='2026-10-09T10:00:00Z';
const m=rate=>createState({managedDate:'2026-10-09',rates:{VES_USD_BCV:{value:rate,source:'QA',timestamp:time},EUR_VES:{value:41.12345,source:'QA',timestamp:time},CAD_VES:{value:26.54321,source:'QA',timestamp:time}}});
function fixture(balances,amounts) {
 let s=createPositionState({empresas:['E'],bancos:['B'],cuentas:balances.map(([a,c],i)=>({cuenta:String(i),empresa:'E',banco:'B',monedas:[c]}))});
 for(const [i,[a,c]] of balances.entries()) s=registerBalance(s,{empresa:'E',banco:'B',cuenta:String(i),amount_original:a,currency_original:c,fecha_hora_saldo:time,fecha_hora_evento:time,origen:'SELF_TEST'},'b'+i);
 for(const [i,[a,c,n='COMPROMISO']] of amounts.entries()) s=registerAffectation(s,{operacion:'ALTA',affectation_id:String(i),empresa:'E',banco_asignado:'B',tipo_partida:'OPERACION',naturaleza_afectacion:n,amount_original:a,currency_original:c,fecha_hora_evento:time,origen:'SELF_TEST'},'a'+i);
 return s;
}
for(const currency of ['USD','EUR','CAD']) test('EXC06 '+currency+' 1000 balanced native positions and converted exact deficit/surplus',()=>{
 const rates=[36.5,36.4721,37.123456,40.1234,191.6489];
 for(let i=1;i<=1000;i++) {
  const a=i/100,b=(1001-i)/100,mon=m(rates[i%5]);
  for(const [balance,nativeAvailable] of [[10.01,0],[10,-0.01],[10.02,0.01]]) {
   const s=fixture([[balance,currency]],[[a,currency],[b,currency,'RESERVA']]),before=JSON.stringify(s);
   const p=calculateCompanyPosition(s,'E',mon),bank=calculateBankPosition(s,'E','B',mon),q=buildNeedQueue(s,'E',mon);
   const expected=convertMoney(createMoney(nativeAvailable,currency),'VES',mon).amount;
   assert.equal(p.publicable,true);assert.equal(q.publicable,true);assert.equal(p.saldo_disponible_gestion,expected);
   assert.equal(bank.disponibilidad_localizada_preliminar,expected);assert.equal(p.deficit,nativeAvailable<0?convertMoney(createMoney(0.01,currency),'VES',mon).amount:0);
   assert.equal(q.brecha_consolidada,p.deficit);assert.equal(JSON.stringify(s),before);
  }
 }
});
test('EXC06 heterogeneous zero USD and compensated FX retain previous bits; risk recorded',t=>{
 let zeroResidues=0,productResidues=0;
 for(let i=1;i<=1000;i++) {
  const rate=36.4721+(i%100)/10000,mon=m(rate),a=i/100,b=(1001-i)/100;
  const usd=i/100,comp=Number((BigInt(i)*BigInt(364721+i%100)).toString())/1000000;
  for(const [kind,balances,rows] of [['zero',[[a,'VES'],[b,'VES'],[0,'USD']],[[10.01,'VES']]],['product',[[usd,'USD']],[[comp,'VES']]]]) {
   const s=fixture(balances,rows),before=JSON.stringify(s);
   const sum=rs=>consolidateMoney(rs.map(([a,c])=>createMoney(a,c)),'VES',mon).amount;
   const expected=sum(balances)-sum(rows),p=calculateCompanyPosition(s,'E',mon),q=buildNeedQueue(s,'E',mon);
   assert.equal(p.publicable,true);assert.equal(q.publicable,true);assert.equal(p.saldo_disponible_gestion,expected);assert.equal(p.deficit,Math.max(0,-expected));assert.equal(q.brecha_consolidada,p.deficit);assert.equal(JSON.stringify(s),before);
   if(p.deficit>0) {if(kind==='zero')zeroResidues++;else productResidues++;}
  }
 }
 t.diagnostic(JSON.stringify({cases_per_route:1000,zero_USD_phantom_deficits:zeroResidues,compensated_FX_phantom_deficits:productResidues,status:'PENDING_FUNCTIONAL_PRECISION_DECISION_NOT_ACCEPTED'}));
});
test('EXC06 native precision rejection and persistence preserve controlled state',()=>{
 const mon=m(36.4721);
 const unsafe=fixture([[1e20,'USD']],[[1,'USD']]);const q=buildNeedQueue(unsafe,'E',mon);
 assert.equal(q.publicable,false);assert.equal(q.errors[0].code,'MONETARY_PRECISION_UNSUPPORTED');
 for(const currency of ['USD','EUR','CAD']) {
  const s=fixture([[100.1,currency]],[[33.37,currency],[66.73,currency]]);let payload;
  const storage={getItem:()=>payload,setItem:(k,v)=>payload=v};saveNeedState(storage,s);const restored=loadNeedState(storage);
  assert.deepEqual(restored,s);assert.equal(buildNeedQueue(restored,'E',mon).brecha_consolidada,0);
 }
});
