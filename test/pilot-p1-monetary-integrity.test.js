import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoney, convertMoney, consolidateMoney, sumOriginals, displayMoney, validateState } from '../src/money.js';
import { createState, setDisplayCurrency, setBCV, saveState, loadState } from '../src/state.js';

const date = '2026-10-08';
const rate = { value: 36.50, source: 'BCV_TEST_FIXTURE_NOT_REAL_RATE', timestamp: '2026-10-08T12:00:00Z' };
const base = () => setBCV(createState({ managedDate: date }), date, rate);
const money = (value, currency) => createMoney(value,currency);

test('P1-01 VES/USD explícito', () => assert.equal(convertMoney(money(36500000,'VES'),'USD',base()).amount,1000000));
test('P1-02 USD/VES explícito', () => assert.equal(convertMoney(money(1000000,'USD'),'VES',base()).amount,36500000));
test('P1-03 conversión VES no muta original', () => {
  const original=money(36500000,'VES'); convertMoney(original,'USD',base());
  assert.deepEqual(original,{amount_original:36500000,currency_original:'VES'});
});
test('P1-04 ida/vuelta aproximada', () => {
  const a=money(375.12,'VES');
  const back=convertMoney(money(convertMoney(a,'USD',base()).amount,'USD'),'VES',base());
  assert.ok(Math.abs(back.amount-a.amount_original)<0.000001);
});
test('P1-05 BCV cero bloquea equivalencia USD', () => {
  const s=setBCV(createState({managedDate:date}),date,{...rate,value:0});
  assert.throws(()=>convertMoney(money(5,'VES'),'USD',s),{code:'MISSING_EXCHANGE_RATE'});
});
test('P1-06 BCV nula bloquea equivalencia USD', () => {
  assert.throws(()=>convertMoney(money(5,'VES'),'USD',createState({managedDate:date})),{code:'MISSING_EXCHANGE_RATE'});
});
test('P1-07 USD original preservado', () => {
 const a=money(800,'USD'); convertMoney(a,'VES',base());
 assert.equal(a.currency_original,'USD');assert.equal(a.amount_original,800);
});
test('P1-08 VES original preservado', () => {
 const a=money(100,'VES'); displayMoney(a,base());
 assert.equal(a.currency_original,'VES');assert.equal(a.amount_original,100);
});
test('P1-09 EUR sin tasa rechazada', () => {
 assert.throws(()=>convertMoney(money(42,'EUR'),'VES',base()),{code:'MISSING_EXCHANGE_RATE'});
});
test('P1-10 no suma directa de monedas heterogéneas', () => {
 assert.throws(()=>sumOriginals([money(100,'VES'),money(10,'USD')]),{code:'MIXED_CURRENCIES'});
 assert.equal(consolidateMoney([money(365,'VES'),money(10,'USD')],'VES',base()).amount,730);
});
test('P1-11 visualización inicial VES', () => assert.equal(createState({managedDate:date}).displayCurrency,'VES'));
test('P1-12 visualización persiste con almacenamiento', () => {
 const items=new Map();
 const storage={setItem:(k,v)=>items.set(k,v),getItem:(k)=>items.get(k)??null};
 saveState(storage,setDisplayCurrency(base(),'USD'));
 assert.equal(loadState(storage).displayCurrency,'USD');
});
test('P1-13 BCV vinculada a fecha administrada', () => {
 assert.throws(()=>setBCV(base(),'2026-10-09',rate),/RATE_DATE_MISMATCH/);
 assert.equal(createState({managedDate:'2026-10-09'}).rates.VES_USD_BCV.value,null);
});
test('P1-14 cambio BCV recalcula equivalencia sin alterar original', () => {
 const original=money(3650,'VES');
 const before=convertMoney(original,'USD',base()).amount;
 const changed=setBCV(base(),date,{...rate,value:73});
 const after=convertMoney(original,'USD',changed).amount;
 assert.equal(before,100);assert.equal(after,50);
 assert.deepEqual(original,money(3650,'VES'));
});
test('P1-15 centralidad motor: state usa validación central', () => {
 assert.equal(typeof validateState,'function');
 const s=base(); assert.equal(validateState(s),s);
 assert.throws(()=>setDisplayCurrency(s,'EUR'),{code:'INVALID_DISPLAY_CURRENCY'});
});
