import test from 'node:test';
import assert from 'node:assert/strict';
import { addDecimal, subtractDecimal, compareDecimal } from '../src/money.js';
import { createPositionState, registerAffectation, registerBalance, getAffectationPending } from '../src/position.js';
import { createNeed, buildNeedQueue, saveNeedState, loadNeedState } from '../src/needs.js';
import { createState } from '../src/state.js';
const time = '2026-10-09T10:00:00Z';
const trace = { origen: 'SELF_TEST', fecha_hora_evento: time };
const base = () => createPositionState({ empresas:['E'], bancos:['B'], cuentas:[{cuenta:'C',empresa:'E',banco:'B',monedas:['VES','USD','EUR']}] });
const add = (s, amount, nature='COMPROMISO', currency='VES') => registerAffectation(s, { ...trace,operacion:'ALTA',affectation_id:'A',empresa:'E',tipo_partida:'OPERACION',naturaleza_afectacion:nature,amount_original:amount,currency_original:currency }, 'alta');
const cancel = (s, amount, id) => registerAffectation(s,{...trace,operacion:'ANULACION',affectation_id:'A',monto_anulado:amount},id);
const linked = s => createNeed(s,{...trace,need_id:'N',affectation_id:'A',prioridad_economica:'P1_CRITICA',rigidez_temporal:'R4_FLEXIBLE'},'need');
function storage() { const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}; }
test('S02 decimal sweep: 5008 partial-final cancellations, no ghost or original mutation',()=>{
  for(let i=1;i<=5008;i++) {
    const total=Number((i/100+1).toFixed(2)), partial=Number((i/100).toFixed(2));
    let s=add(base(),total,i%2?'COMPROMISO':'RESERVA',['VES','USD','EUR'][i%3]);
    s=cancel(s,partial,'partial');assert.equal(getAffectationPending(s.affectations[0]),1);
    s=cancel(s,1,'final');assert.equal(s.affectations[0].estado,'ANULADA');
    assert.equal(s.affectations[0].amount_original,total);
    assert.equal(buildNeedQueue(s,'E',createState({managedDate:'2026-10-09'})).necesidades_sin_clasificar.length,0);
    assert.strictEqual(cancel(s,1,'final'),s);
  }
});
test('S02 variable scales, exponents and explicit precision rejection',()=>{
  assert.equal(subtractDecimal(0.0011,0.001),0.0001);
  assert.equal(addDecimal(1e-7,2e-7),3e-7);
  assert.equal(subtractDecimal(1e21,1e20),9e20);
  assert.equal(compareDecimal(Number.MIN_VALUE,0),1);
  assert.throws(()=>addDecimal(1e20,1),{code:'MONETARY_PRECISION_UNSUPPORTED'});
  const s=add(base(),1e20);assert.throws(()=>cancel(s,1,'unsafe'),{code:'MONETARY_PRECISION_UNSUPPORTED'});
  assert.equal(s.affectations[0].monto_vigente,1e20);
});
test('S02/S08 terminal linked commitments/reserves persist with closure and trace',()=>{
  for(const nature of ['COMPROMISO','RESERVA']) {
    let s=linked(add(base(),1.1,nature));s=cancel(s,1,'partial');s=cancel(s,0.1,'final');
    assert.equal(s.needs[0].estado,'CERRADA');assert.equal(s.events.at(-1).operacion,'CLOSE_NEED_IF_RESOLVED');
    const store=storage();saveNeedState(store,s);assert.deepEqual(loadNeedState(store),s);
    assert.strictEqual(cancel(s,0.1,'final'),s);
  }
});
test('S08 corrupt catalogues, stocks, links and identities reject atomically',()=>{
  let s=linked(add(base(),10));s=registerBalance(s,{...trace,empresa:'E',banco:'B',cuenta:'C',amount_original:100,currency_original:'VES',fecha_hora_saldo:time},'balance');
  const mutations=[s=>s.catalogue.empresas.push('E'),s=>s.catalogue.cuentas[0].empresa='X',s=>s.balances.push({...s.balances[0]}),s=>s.balances[0].cuenta='X',s=>s.balances[0].amount_original=null,s=>s.affectations[0].banco_asignado='X',s=>delete s.affectations[0].fecha_hora_evento,s=>s.needs[0].affectation_id='X',s=>s.needs[0].currency_original='USD',s=>s.needs[0].amount_original=11,s=>s.needs[0].naturaleza='RESERVA',s=>s.needs.push({...s.needs[0]})];
  for(const mutate of mutations) {
    const bad=structuredClone(s);mutate(bad);const payload=JSON.stringify({version:1,state:bad});let writes=0;
    const store={getItem:()=>payload,setItem:()=>writes++};
    assert.throws(()=>loadNeedState(store),{code:'INVALID_STORED_NEED_STATE'});
    assert.throws(()=>saveNeedState(store,bad),{code:'INVALID_STORED_NEED_STATE'});
    assert.equal(writes,0);assert.equal(JSON.stringify({version:1,state:bad}),payload);
  }
});
test('S10 all tie breakers and absent targets yield deterministic order',()=>{
  let s=base();const rows=[['Z','P2_ALTA','2026-10-10T10:00:00Z',time],['B','P1_CRITICA','2026-10-10T10:00:00Z',time],['A','P1_CRITICA','2026-10-10T10:00:00Z',time],['EARLY','P4_DISCRECIONAL','2026-10-09T10:00:00Z',time],['EVENT','P1_CRITICA','2026-10-10T10:00:00Z','2026-10-09T09:00:00Z'],['NONE','P1_CRITICA',null,time]];
  for(const [id,p,target,event] of rows) s=createNeed(s,{...trace,fecha_hora_evento:event,need_id:id,empresa:'E',tipo_partida:'OPERACION',naturaleza:'COMPROMISO',amount_original:1,currency_original:'VES',prioridad_economica:p,rigidez_temporal:'R2_VENTANA_DIA',fecha_hora_objetivo:target},id);
  assert.deepEqual(buildNeedQueue(s,'E',createState({managedDate:'2026-10-09'})).necesidades_sin_vinculo.map(n=>n.need_id),['EARLY','EVENT','A','B','Z','NONE']);
});
test('S08 zero pending adjustment persists; explicit follow-up remains active',()=>{
  for(const followUp of [false,true]) {
    let s=add(base(),1.1);
    s=createNeed(s,{...trace,need_id:'N',affectation_id:'A',prioridad_economica:'P1_CRITICA',rigidez_temporal:'R4_FLEXIBLE',requiere_seguimiento_adicional:followUp},'need');
    s=registerAffectation(s,{...trace,affectation_id:'A',operacion:'AJUSTE',monto_reflejado_confirmado:1.1},'confirm');
    assert.equal(s.needs[0].estado,followUp?'ACTIVA':'CERRADA');
    const store=storage();saveNeedState(store,s);assert.deepEqual(loadNeedState(store),s);
  }
});
