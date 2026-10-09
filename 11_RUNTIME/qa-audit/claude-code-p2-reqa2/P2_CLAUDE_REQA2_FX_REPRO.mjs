// EXC-P2-05 — reproducción mínima independiente. Uso: node P2_CLAUDE_REQA2_FX_REPRO.mjs <checkout>
import { pathToFileURL } from 'node:url';
const R=process.argv[2]; const L=f=>import(pathToFileURL(R+'/src/'+f).href);
const P=await L('position.js'); const N=await L('needs.js'); const {createState}=await L('state.js');
const DAY='2026-10-09'; const at=h=>`${DAY}T${String(h).padStart(2,'0')}:00:00Z`; const tr=h=>({origen:'AUD',fecha_hora_evento:at(h)});
const cat=()=>P.createPositionState({empresas:['E'],bancos:['B'],cuentas:[{cuenta:'C',empresa:'E',banco:'B',monedas:['VES','USD']}]});
const cases=[
 {rate:36.4721, usd:5624.34, ves:82075.82, c:5792.17, r:18.25},
 {rate:36.4721, usd:5624.34, ves:0, c:5792.17, r:0},
 {rate:191.6489, usd:4087.82, ves:54425.29, cUSD:9024.27, r:449.19}];
for (const k of cases){
  const m=createState({managedDate:DAY,rates:{VES_USD_BCV:{value:k.rate,source:'S',timestamp:at(7)}}});
  const bals=[{empresa:'E',banco:'B',cuenta:'C',amount_original:k.usd,currency_original:'USD',fecha_hora_saldo:at(7),...tr(7)}];
  if(k.ves) bals.push({empresa:'E',banco:'B',cuenta:'C',amount_original:k.ves,currency_original:'VES',fecha_hora_saldo:at(7),...tr(7)});
  let s=P.applyBalanceBatch(cat(),bals,'b');
  const affs=[{affectation_id:'A',empresa:'E',tipo_partida:'P',naturaleza_afectacion:'COMPROMISO',amount_original:k.cUSD??k.c,currency_original:k.cUSD?'USD':'VES',operacion:'ALTA',...tr(8)}];
  if(k.r) affs.push({affectation_id:'R',empresa:'E',tipo_partida:'P',naturaleza_afectacion:'RESERVA',amount_original:k.r,currency_original:'VES',operacion:'ALTA',...tr(8)});
  s=P.applyAffectationBatch(s,affs,'a');
  const p=P.calculateCompanyPosition(s,'E',m); let q; try{const x=N.buildNeedQueue(s,'E',m); q={publicable:x.publicable,deficit:x.deficit,total:x.total_necesidad_vigente}}catch(e){q='THROW '+e.name+' '+e.code}
  console.log(JSON.stringify({entrada:k,publicable:p.publicable,saldo:p.saldo_bancario,comp:p.compromisos_por_ejecutar,res:p.reservas_bloqueadas,disponible:p.saldo_disponible_gestion,deficit:p.deficit,err:p.errors.map(e=>e.code),queue:q}));
}
