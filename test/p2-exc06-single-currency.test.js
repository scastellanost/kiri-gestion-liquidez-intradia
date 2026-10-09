import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/state.js';
import {createPositionState,registerBalance,registerAffectation,calculateCompanyPosition,calculateBankPosition} from '../src/position.js';
import {buildNeedQueue} from '../src/needs.js';

const time='2026-10-09T10:00:00Z';
const rates=createState({managedDate:'2026-10-09',rates:{
  VES_USD_BCV:{value:36.4721,source:'QA',timestamp:time},
  EUR_VES:{value:40.1234,source:'QA',timestamp:time}
}});
function fixture(currency,balance,commitments) {
  let state=createPositionState({empresas:['E'],bancos:['B'],cuentas:[{empresa:'E',banco:'B',cuenta:'A',monedas:[currency]}]});
  state=registerBalance(state,{empresa:'E',banco:'B',cuenta:'A',amount_original:balance,currency_original:currency,fecha_hora_saldo:time,fecha_hora_evento:time,origen:'QA'},'b');
  for(let i=0;i<commitments.length;i++) state=registerAffectation(state,{operacion:'ALTA',affectation_id:'n'+i,empresa:'E',banco_asignado:'B',tipo_partida:'OPERACION',naturaleza_afectacion:'COMPROMISO',amount_original:commitments[i],currency_original:currency,origen:'QA',fecha_hora_evento:time},'r'+i);
  return state;
}
for(const currency of ['VES','USD','EUR']){
  test('EXC-P2-06 '+currency+' native balance 100.10 minus 33.37 minus 66.73 has no phantom deficit',()=>{
    const s=fixture(currency,100.10,[33.37,66.73]);
    const p=calculateCompanyPosition(s,'E',rates);
    const b=calculateBankPosition(s,'E','B',rates);
    const q=buildNeedQueue(s,'E',rates);
    assert.equal(p.publicable,true);
    assert.equal(p.saldo_disponible_gestion,0);
    assert.equal(p.deficit,0);
    assert.equal(b.disponibilidad_localizada_preliminar,0);
    assert.equal(q.publicable,true);
    assert.equal(q.brecha_consolidada,0);
  });
  test('EXC-P2-06 '+currency+' native deficit and surplus signs are retained',()=>{
    const low=calculateCompanyPosition(fixture(currency,100.09,[33.37,66.73]),'E',rates);
    const high=calculateCompanyPosition(fixture(currency,100.11,[33.37,66.73]),'E',rates);
    assert.equal(low.publicable,true); assert.ok(low.deficit>0);
    assert.equal(high.publicable,true); assert.equal(high.deficit,0); assert.ok(high.saldo_disponible_gestion>0);
  });
}
