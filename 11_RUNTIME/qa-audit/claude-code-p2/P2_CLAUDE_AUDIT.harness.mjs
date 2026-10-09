// PILOT-01/F1/P2 — Arnés de auditoría independiente (Claude Code).
// No forma parte de la suite `node --test` del motor: se ejecuta explícitamente contra un checkout
// del commit auditado. No modifica código de producción.
//
//   KIRI_P2_ROOT=/ruta/al/checkout/851bb58 node --test 11_RUNTIME/qa-audit/claude-code-p2/P2_CLAUDE_AUDIT.harness.mjs
//
// Oráculos escritos a partir de los contratos LIQ-CODEX-002, 002A, 003 y del work-request P2,
// no copiados de salidas del motor. Las aserciones expresan el comportamiento CONTRACTUAL;
// un test rojo es evidencia de desviación. Los casos OBS-* documentan comportamiento observado
// no regulado por contrato (para decisión del Líder Funcional, sin asumir regla de negocio).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.env.KIRI_P2_ROOT ?? '.');
const SRC = join(ROOT, 'src');
const load = file => import(pathToFileURL(join(SRC, file)).href);
const { createState, setDisplayCurrency } = await load('state.js');
const P = await load('position.js');
const N = await load('needs.js');

// ---------- Datos sintéticos (no productivos) ----------
const BCV = 36.5; // VES por USD — valor SINTÉTICO de auditoría, no tasa BCV real.
const DAY = '2026-10-09';
const at = (h, m = 0) => `${DAY}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
const tr = (h, m = 0) => ({ origen: 'AUDITORIA-CLAUDE-P2', usuario: 'auditor.claude', fecha_hora_evento: at(h, m) });
const rate = value => ({ value, source: 'SINTETICO-AUDITORIA', timestamp: at(7) });
const mVES = createState({ managedDate: DAY, rates: { VES_USD_BCV: rate(BCV) } });
const mUSD = setDisplayCurrency(mVES, 'USD');
const mEUR = createState({ managedDate: DAY, rates: { VES_USD_BCV: rate(BCV), EUR_VES: rate(40) } });
const mNoRate = createState({ managedDate: DAY });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);

const catalogue = () => P.createPositionState({
  empresas: ['KIRI_A', 'KIRI_B'], bancos: ['BNC', 'BDV'],
  cuentas: [
    { cuenta: 'A-BNC-01', empresa: 'KIRI_A', banco: 'BNC', monedas: ['VES', 'USD', 'EUR'] },
    { cuenta: 'A-BDV-01', empresa: 'KIRI_A', banco: 'BDV', monedas: ['VES'] },
    { cuenta: 'B-BNC-01', empresa: 'KIRI_B', banco: 'BNC', monedas: ['VES'] }
  ]
});
const bal = (cuenta, amount, h, currency = 'VES', m = 0) => {
  const banco = cuenta.includes('BDV') ? 'BDV' : 'BNC'; const empresa = cuenta.startsWith('A') ? 'KIRI_A' : 'KIRI_B';
  return { empresa, banco, cuenta, amount_original: amount, currency_original: currency, fecha_hora_saldo: at(h, m), ...tr(h, m) };
};
const alta = (id, amount, extra = {}) => ({ affectation_id: id, empresa: 'KIRI_A', tipo_partida: 'PAGO_PROVEEDOR',
  naturaleza_afectacion: 'COMPROMISO', amount_original: amount, currency_original: 'VES', operacion: 'ALTA', ...tr(8), ...extra });
const start = (saldo = 100) => P.registerBalance(catalogue(), bal('A-BNC-01', saldo, 7), 'saldo-inicial');
const pos = (s, m = mVES) => P.calculateCompanyPosition(s, 'KIRI_A', m);
const usd = p => P.displayPosition(p, mUSD);
const frozenCopy = s => structuredClone(s);
const rejects = (fn, code, s) => { const before = frozenCopy(s); assert.throws(fn, { code }); assert.deepEqual(s, before, 'estado mutado tras rechazo'); };
const need = (id, aff, prio, rig, h = 10, extra = {}) => ({ need_id: id, affectation_id: aff, prioridad_economica: prio, rigidez_temporal: rig, ...tr(h), ...extra });

// ---------- Registro de evidencia ----------
const ledger = [];
const rec = (scenario, caso, data) => ledger.push({ scenario, caso, ...data });
const snap = s => { const v = pos(s); const u = usd(v); return {
  VES: { saldo: v.saldo_bancario, compromisos: v.compromisos_por_ejecutar, reservas: v.reservas_bloqueadas, disponible: v.saldo_disponible_gestion, deficit: v.deficit },
  USD_equiv_BCV: u.publicable ? { saldo: u.saldo_bancario, compromisos: u.compromisos_por_ejecutar, reservas: u.reservas_bloqueadas, disponible: u.saldo_disponible_gestion, deficit: u.deficit } : null }; };
after(() => {
  const out = process.env.KIRI_P2_EVIDENCE;
  if (out) writeFileSync(out, JSON.stringify({ commit_auditado: process.env.KIRI_P2_COMMIT ?? null, bcv_sintetico: BCV, ledger }, null, 2));
});

// ===================== S01 Alta y cambios controlados =====================
test('S01-a ALTA conserva identificador, originales y trazabilidad (USD → VES/USD)', () => {
  const s = P.registerAffectation(start(10000), alta('A1', 100, { currency_original: 'USD', banco_asignado: 'BNC' }), 'req-a1');
  const a = s.affectations[0];
  assert.deepEqual([a.affectation_id, a.amount_original, a.currency_original, a.monto_vigente, a.monto_reflejado_confirmado, a.estado],
    ['A1', 100, 'USD', 100, 0, 'ACTIVA']);
  assert.equal(a.request_id, 'req-a1'); assert.equal(a.origen, 'AUDITORIA-CLAUDE-P2'); assert.equal(a.usuario, 'auditor.claude');
  const p = pos(s); close(p.compromisos_por_ejecutar, 3650); close(p.saldo_disponible_gestion, 6350); close(usd(p).compromisos_por_ejecutar, 100);
  rec('S01', 'S01-a', { entrada: 'saldo 10000 VES; ALTA compromiso 100 USD', ...snap(s) });
});
test('S01-b AJUSTE gobernado conserva id/originales y no crea segundo registro', () => {
  let s = P.registerAffectation(start(10000), alta('A1', 100, { currency_original: 'USD' }), 'r1');
  const events = s.events.length;
  s = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'AJUSTE', monto_vigente: 120, ...tr(9) }, 'r2');
  assert.equal(s.affectations.length, 1); assert.equal(s.events.length, events + 1);
  const a = s.affectations[0]; assert.deepEqual([a.amount_original, a.currency_original, a.monto_vigente], [100, 'USD', 120]);
  close(pos(s).compromisos_por_ejecutar, 4380);
  rec('S01', 'S01-b', { entrada: 'AJUSTE 100→120 USD', ...snap(s) });
});
test('S01-c Cambios a campos inmutables se rechazan sin mutación', () => {
  const s = P.registerAffectation(start(), alta('A1', 20), 'r1');
  for (const [k, v] of [['amount_original', 25], ['currency_original', 'USD'], ['empresa', 'KIRI_B'], ['naturaleza_afectacion', 'RESERVA'], ['monto_original', 1], ['moneda_original', 'USD']]) {
    rejects(() => P.registerAffectation(s, { affectation_id: 'A1', operacion: 'AJUSTE', monto_vigente: 22, [k]: v, ...tr(9) }, 'x-' + k), 'IMMUTABLE_AFFECTATION_FIELD', s);
  }
});
test('S01-d Validaciones de alta/referencia: sin mutación, preview no muta', () => {
  const s = P.registerAffectation(start(), alta('A1', 20), 'r1');
  rejects(() => P.registerAffectation(s, alta('A1', 5), 'r-dup'), 'AFFECTATION_ALREADY_EXISTS', s);
  rejects(() => P.registerAffectation(s, { affectation_id: 'ZZ', operacion: 'AJUSTE', monto_vigente: 5, ...tr(9) }, 'r-unk'), 'UNKNOWN_AFFECTATION_REFERENCE', s);
  rejects(() => P.registerAffectation(s, alta('A2', 0), 'r-zero'), 'INVALID_INITIAL_AMOUNT', s);
  rejects(() => P.registerAffectation(s, alta('A2', -5), 'r-neg'), 'INVALID_INITIAL_AMOUNT', s);
  rejects(() => P.registerAffectation(s, alta('A2', 5, { empresa: 'KIRI_X' }), 'r-co'), 'INVALID_COMPANY', s);
  rejects(() => P.registerAffectation(s, alta('A2', 5, { banco_asignado: 'BANCO_X' }), 'r-bk'), 'INVALID_BANK', s);
  rejects(() => P.registerAffectation(s, { affectation_id: 'A1', operacion: 'AJUSTE', monto_vigente: 'veinte', ...tr(9) }, 'r-nan'), 'INVALID_CURRENT_AMOUNT', s);
  const before = frozenCopy(s); const pv = P.previewAffectations(s, [alta('A3', 5)], { request_id: 'pv' });
  assert.equal(pv.status, 'VALID'); assert.deepEqual(s, before);
});
test('S01-e AJUSTE de vigente por debajo de lo confirmado se rechaza', () => {
  const s = P.registerAffectation(start(), alta('A1', 20, { monto_reflejado_confirmado: 10 }), 'r1');
  rejects(() => P.registerAffectation(s, { affectation_id: 'A1', operacion: 'AJUSTE', monto_vigente: 8, ...tr(9) }, 'r2'), 'INVALID_CONFIRMED_AMOUNT', s);
});

// ===================== S02 Anulación parcial y total =====================
test('S02-a Compromiso 20/conf 10: anula 5 → pend 5 ACTIVA; anula 5 → ANULADA; confirmado intacto', () => {
  let s = P.registerAffectation(start(), alta('A1', 20, { monto_reflejado_confirmado: 10 }), 'r1');
  s = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 5, ...tr(9) }, 'c1');
  let a = s.affectations[0]; assert.deepEqual([a.monto_vigente, a.monto_reflejado_confirmado, a.estado], [15, 10, 'ACTIVA']);
  assert.equal(pos(s).saldo_disponible_gestion, 95);
  s = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 5, ...tr(10) }, 'c2');
  a = s.affectations[0]; assert.deepEqual([a.monto_vigente, a.monto_reflejado_confirmado, a.estado, a.amount_original], [10, 10, 'ANULADA', 20]);
  assert.equal(pos(s).saldo_disponible_gestion, 100); assert.equal(s.affectations.length, 1);
  rec('S02', 'S02-a', { entrada: 'saldo 100; compromiso 20 conf 10; anula 5 + 5', ...snap(s) });
});
test('S02-b Reserva 15: anula 5 → 10 ACTIVA; anula 10 → 0 ANULADA', () => {
  let s = P.registerAffectation(start(), alta('R1', 15, { naturaleza_afectacion: 'RESERVA' }), 'r1');
  s = P.registerAffectation(s, { affectation_id: 'R1', operacion: 'ANULACION', monto_anulado: 5, ...tr(9) }, 'c1');
  assert.deepEqual([s.affectations[0].monto_vigente, s.affectations[0].estado], [10, 'ACTIVA']); assert.equal(pos(s).saldo_disponible_gestion, 90);
  s = P.registerAffectation(s, { affectation_id: 'R1', operacion: 'ANULACION', monto_anulado: 10, ...tr(10) }, 'c2');
  assert.deepEqual([s.affectations[0].monto_vigente, s.affectations[0].estado], [0, 'ANULADA']); assert.equal(pos(s).saldo_disponible_gestion, 100);
  rec('S02', 'S02-b', { entrada: 'saldo 100; reserva 15; anula 5 + 10', ...snap(s) });
});
test('S02-c No exceder pendiente; montos inválidos; anular ANULADA', () => {
  let s = P.registerAffectation(start(), alta('A1', 20, { monto_reflejado_confirmado: 10 }), 'r1');
  for (const [v, k] of [[11, 'gt'], [0, 'zero'], [-1, 'neg'], [Number.NaN, 'nan'], ['5', 'str']]) {
    rejects(() => P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: v, ...tr(9) }, 'c-' + k), 'EXCESSIVE_OR_INVALID_CANCELLATION', s);
  }
  s = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 10, ...tr(9) }, 'c-all');
  rejects(() => P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 1, ...tr(10) }, 'c-again'), 'AFFECTATION_NOT_ACTIVE', s);
  const ev = s.events.filter(e => e.kind === 'AFECTACION' && e.result.affectation_id === 'A1');
  assert.deepEqual(ev.map(e => e.result.operacion), ['ALTA', 'ANULACION']); // trazabilidad conservada
});
for (const [total, first] of [[1250.30, 250.10], [1.10, 1.00], [0.30, 0.10]]) {
  test(`S02-d Anulación total tras parcial con decimales: ${total} VES, anula ${first} y luego el resto ${(total - first).toFixed(2)}`, () => {
    let s = P.registerAffectation(start(5000), alta('A1', total), 'r1');
    s = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: first, ...tr(9) }, 'c1');
    const resto = Number((total - first).toFixed(2));
    const observed = { vigente_tras_parcial: s.affectations[0].monto_vigente, resto_mostrado: resto };
    let result;
    try { result = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: resto, ...tr(10) }, 'c2'); }
    catch (e) { observed.error = e.code; }
    if (result) { observed.estado = result.affectations[0].estado; observed.residuo = result.affectations[0].monto_vigente;
      observed.sin_clasificar = N.buildNeedQueue(result, 'KIRI_A', mVES).necesidades_sin_clasificar.length; }
    rec('S02', `S02-d ${total}/${first}`, { entrada: `compromiso ${total} VES; anula ${first}; anula resto ${resto}`, observado: observed });
    assert.equal(observed.error, undefined, `anulación del resto rechazada: ${JSON.stringify(observed)}`);
    assert.equal(observed.estado, 'ANULADA', `afectación queda con residuo fantasma: ${JSON.stringify(observed)}`);
    assert.equal(observed.sin_clasificar, 0);
  });
}

// ===================== S03 Saldos como stock reemplazable =====================
test('S03-a Nueva observación reemplaza stock (100 → 90 = 90, no 190); historial técnico', () => {
  let s = start(100); s = P.registerBalance(s, bal('A-BNC-01', 90, 10), 's2');
  assert.equal(pos(s).saldo_bancario, 90); assert.equal(s.balances.length, 1);
  assert.equal(s.events.filter(e => e.kind === 'SALDO').length, 2);
  rec('S03', 'S03-a', { entrada: 'saldo 100 @07; saldo 90 @10', ...snap(s) });
});
test('S03-b Ejemplo rector 002: no doble descuento y no inferir ejecución', () => {
  let s = P.registerAffectation(start(100), alta('A1', 20), 'r1'); assert.equal(pos(s).saldo_disponible_gestion, 80);
  const s90 = P.registerAffectation(P.registerBalance(s, bal('A-BNC-01', 90, 10), 's90'),
    { affectation_id: 'A1', operacion: 'AJUSTE', monto_reflejado_confirmado: 10, ...tr(10) }, 'conf10');
  assert.deepEqual([pos(s90).compromisos_por_ejecutar, pos(s90).saldo_disponible_gestion], [10, 80]);
  const s80 = P.registerBalance(s, bal('A-BNC-01', 80, 10), 's80');
  assert.deepEqual([pos(s80).compromisos_por_ejecutar, pos(s80).saldo_disponible_gestion], [20, 60]);
  rec('S03', 'S03-b reflejado', { entrada: 'saldo 100, comp 20; saldo 90 + conf 10', ...snap(s90) });
  rec('S03', 'S03-b no inferir', { entrada: 'saldo 100, comp 20; saldo 80 sin conf', ...snap(s80) });
});
test('S03-c Stock por moneda y por cuenta; multi-banco suma 70+30; reemplazo USD', () => {
  let s = P.applyBalanceBatch(catalogue(), [bal('A-BNC-01', 70, 7), bal('A-BDV-01', 30, 7), bal('A-BNC-01', 10, 7, 'USD')], 'lote-1');
  close(pos(s).saldo_bancario, 70 + 30 + 10 * BCV);
  s = P.registerBalance(s, bal('A-BNC-01', 12, 9, 'USD'), 'usd-2');
  close(pos(s).saldo_bancario, 70 + 30 + 12 * BCV); assert.equal(s.balances.length, 3);
  assert.equal(P.calculateBankPosition(s, 'KIRI_A', 'BDV', mVES).saldo_bancario, 30);
  rec('S03', 'S03-c', { entrada: 'BNC 70 VES + BDV 30 VES + BNC 10→12 USD', ...snap(s) });
});
test('S03-d Duplicado conflictivo en lote se rechaza sin mutación', () => {
  const s = start(100);
  rejects(() => P.applyBalanceBatch(s, [bal('A-BNC-01', 90, 9), bal('A-BNC-01', 95, 10)], 'lote-x'), 'CONFLICTING_BATCH_DUPLICATE', s);
});
test('S03-e Cuenta inexistente / de otra empresa / moneda no habilitada', () => {
  const s = start(100);
  rejects(() => P.registerBalance(s, { ...bal('A-BNC-01', 5, 9), cuenta: 'NO-EXISTE' }, 'x1'), 'INVALID_ACCOUNT', s);
  rejects(() => P.registerBalance(s, { ...bal('B-BNC-01', 5, 9), empresa: 'KIRI_A' }, 'x2'), 'ACCOUNT_OWNER_MISMATCH', s);
  rejects(() => P.registerBalance(s, bal('A-BDV-01', 5, 9, 'USD'), 'x3'), 'ACCOUNT_CURRENCY_MISMATCH', s);
});

// ===================== S04 Saldo retroactivo histórico =====================
test('S04-a Saldo 90 de 10:00 tras vigente 100 de 12:00: vigente 100, histórico conserva 90', () => {
  let s = P.registerBalance(catalogue(), bal('A-BNC-01', 100, 12), 's12');
  s = P.registerBalance(s, bal('A-BNC-01', 90, 10), 's10');
  assert.equal(pos(s).saldo_bancario, 100); assert.equal(s.balances[0].amount_original, 100);
  const h = s.events.at(-1); assert.deepEqual([h.treatment, h.amount_original, h.request_id], ['HISTORICAL_ONLY', 90, 's10']);
  rec('S04', 'S04-a', { entrada: 'vigente 100 @12; llega 90 @10', ...snap(s) });
});
test('S04-b Retroactividad con zona horaria explícita (-04:00) se evalúa por instante', () => {
  let s = P.registerBalance(catalogue(), bal('A-BNC-01', 100, 12), 's12');
  s = P.registerBalance(s, { ...bal('A-BNC-01', 80, 7), fecha_hora_saldo: `${DAY}T07:30:00-04:00` }, 's-tz'); // 11:30Z
  assert.equal(pos(s).saldo_bancario, 100); assert.equal(s.events.at(-1).treatment, 'HISTORICAL_ONLY');
});
test('S04-c Mismo timestamp: monto distinto = error sin mutación; mismo monto = sin cambio', () => {
  const s = P.registerBalance(catalogue(), bal('A-BNC-01', 100, 12), 's12');
  rejects(() => P.registerBalance(s, bal('A-BNC-01', 99, 12), 'dup-ts'), 'CONFLICTING_STOCK_TIMESTAMP', s);
  assert.equal(pos(P.registerBalance(s, bal('A-BNC-01', 100, 12), 'same-ts')).saldo_bancario, 100);
});

// ===================== S05 Ajuste/anulación retroactiva =====================
test('S05-a AJUSTE y ANULACION retroactivos: RETROACTIVE_AFFECTATION_EVENT sin mutación', () => {
  const s = P.registerAffectation(P.registerAffectation(start(), alta('A1', 20), 'r1'),
    { affectation_id: 'A1', operacion: 'AJUSTE', monto_vigente: 25, ...tr(11) }, 'r2');
  rejects(() => P.registerAffectation(s, { affectation_id: 'A1', operacion: 'AJUSTE', monto_vigente: 30, ...tr(10, 59) }, 'retro-aj'), 'RETROACTIVE_AFFECTATION_EVENT', s);
  rejects(() => P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 5, ...tr(9) }, 'retro-an'), 'RETROACTIVE_AFFECTATION_EVENT', s);
  rejects(() => P.registerAffectation(s, { affectation_id: 'A1', operacion: 'AJUSTE', monto_vigente: 30, origen: 'AUD', fecha_hora_evento: `${DAY}T06:59:00-04:00` }, 'retro-tz'), 'RETROACTIVE_AFFECTATION_EVENT', s);
  assert.equal(pos(s).saldo_disponible_gestion, 75);
  rec('S05', 'S05-a', { entrada: 'comp 20 → ajuste 25 @11; intentos retroactivos @10:59Z, @09:00Z y @06:59-04:00 (=10:59Z)', ...snap(s) });
});
test('S05-b Lote con un registro retroactivo es atómico: nada se aplica', () => {
  const s = P.registerAffectation(P.registerAffectation(start(), alta('A1', 20), 'r1'), { affectation_id: 'A1', operacion: 'AJUSTE', monto_vigente: 25, ...tr(11) }, 'r2');
  rejects(() => P.applyAffectationBatch(s, [alta('B1', 7, tr(12)), { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 5, ...tr(9) }], 'lote-retro'), 'RETROACTIVE_AFFECTATION_EVENT', s);
  assert.equal(s.affectations.length, 1);
});

// ===================== S06 Confirmado no disminuye =====================
test('S06-a Disminuir confirmado vía AJUSTE: CONFIRMED_AMOUNT_REVERSAL_NOT_ALLOWED; aumentar permitido', () => {
  const s = P.registerAffectation(start(), alta('A1', 20, { monto_reflejado_confirmado: 15 }), 'r1');
  rejects(() => P.registerAffectation(s, { affectation_id: 'A1', operacion: 'AJUSTE', monto_reflejado_confirmado: 10, ...tr(9) }, 'rev'), 'CONFIRMED_AMOUNT_REVERSAL_NOT_ALLOWED', s);
  rejects(() => P.registerAffectation(s, { affectation_id: 'A1', operacion: 'AJUSTE', monto_reflejado_confirmado: 21, ...tr(9) }, 'over'), 'INVALID_CONFIRMED_AMOUNT', s);
  const up = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'AJUSTE', monto_reflejado_confirmado: 18, ...tr(9) }, 'up');
  assert.deepEqual([pos(up).compromisos_por_ejecutar, pos(up).saldo_disponible_gestion], [2, 98]);
  rec('S06', 'S06-a', { entrada: 'comp 20 conf 15; intento 15→10 rechazado; 15→18 aceptado', ...snap(up) });
});
test('S06-b Ni ANULACION ni reclasificación COMPROMISO→RESERVA reducen confirmado', () => {
  const s = P.registerAffectation(start(), alta('A1', 20, { monto_reflejado_confirmado: 10 }), 'r1');
  const c = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 4, ...tr(9) }, 'c');
  assert.equal(c.affectations[0].monto_reflejado_confirmado, 10);
  rejects(() => N.reclassifyAffectation(s, { affectation_id: 'A1', naturaleza_destino: 'RESERVA', motivo_reclasificacion: 'm', ...tr(9) }, 'rc'), 'RECLASSIFICATION_AFTER_CONFIRMED_EXECUTION_NOT_ALLOWED', s);
});

// ===================== S07 Idempotencia batch_id / request_id =====================
test('S07-a batch_id repetido: misma referencia de estado, sin eventos nuevos; payload distinto: conflicto', () => {
  const rows = [bal('A-BNC-01', 100, 7), bal('A-BDV-01', 50, 7)];
  const s = P.applyBalanceBatch(catalogue(), rows, 'lote-1');
  assert.strictEqual(P.applyBalanceBatch(s, rows, 'lote-1'), s);
  assert.strictEqual(P.applyBalanceBatch(s, rows.map(r => Object.fromEntries(Object.entries(r).reverse())), 'lote-1'), s); // orden de claves irrelevante
  assert.equal(P.previewBalances(s, rows, { batch_id: 'lote-1' }).idempotent, true);
  rejects(() => P.applyBalanceBatch(s, [rows[0]], 'lote-1'), 'IDEMPOTENCY_CONFLICT', s);
  assert.equal(pos(s).saldo_bancario, 150);
  rec('S07', 'S07-a', { entrada: 'lote-1 aplicado 2 veces', ...snap(s) });
});
test('S07-b request_id repetido en ALTA, ANULACION y CREATE_NEED no duplica efectos', () => {
  let s = P.registerAffectation(start(), alta('A1', 20), 'r1');
  assert.strictEqual(P.registerAffectation(s, alta('A1', 20), 'r1'), s);
  s = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 5, ...tr(9) }, 'an-1');
  assert.strictEqual(P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 5, ...tr(9) }, 'an-1'), s);
  assert.equal(s.affectations[0].monto_vigente, 15);
  s = N.createNeed(s, need('N1', 'A1', 'P3_NORMAL', 'R4_FLEXIBLE'), 'nd-1');
  assert.strictEqual(N.createNeed(s, need('N1', 'A1', 'P3_NORMAL', 'R4_FLEXIBLE'), 'nd-1'), s);
  rejects(() => N.createNeed(s, need('N1', 'A1', 'P1_CRITICA', 'R4_FLEXIBLE'), 'nd-1'), 'IDEMPOTENCY_CONFLICT', s);
  assert.equal(s.needs.length, 1); assert.equal(pos(s).saldo_disponible_gestion, 85);
  rec('S07', 'S07-b', { entrada: 'ALTA 20, ANULACION 5 y CREATE_NEED repetidos', ...snap(s) });
});
test('S07-c Idempotencia se conserva tras persistir y recargar', () => {
  let s = N.createNeed(P.registerAffectation(start(), alta('A1', 20), 'r1'), need('N1', 'A1', 'P3_NORMAL', 'R4_FLEXIBLE'), 'nd-1');
  const store = new Map(); const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  N.saveNeedState(storage, s); const r = N.loadNeedState(storage);
  assert.strictEqual(P.registerAffectation(r, alta('A1', 20), 'r1'), r);
  assert.strictEqual(N.createNeed(r, need('N1', 'A1', 'P3_NORMAL', 'R4_FLEXIBLE'), 'nd-1'), r);
});

// ===================== S08 Una necesidad activa por afectación =====================
test('S08-a Segunda necesidad (create o link) para la misma afectación: DUPLICATE_ACTIVE_NEED', () => {
  let s = P.registerAffectation(start(), alta('A1', 20), 'r1');
  s = N.createNeed(s, need('N1', 'A1', 'P3_NORMAL', 'R4_FLEXIBLE'), 'n1');
  rejects(() => N.createNeed(s, need('N2', 'A1', 'P1_CRITICA', 'R4_FLEXIBLE', 11), 'n2'), 'DUPLICATE_ACTIVE_NEED', s);
  const u = N.createNeed(s, { need_id: 'N3', empresa: 'KIRI_A', tipo_partida: 'PAGO_PROVEEDOR', naturaleza: 'COMPROMISO', amount_original: 20, currency_original: 'VES', prioridad_economica: 'P2_ALTA', rigidez_temporal: 'R4_FLEXIBLE', ...tr(10) }, 'n3');
  rejects(() => N.linkNeedToAffectation(u, { need_id: 'N3', affectation_id: 'A1', ...tr(11) }, 'l3'), 'DUPLICATE_ACTIVE_NEED', u);
  const q = N.buildNeedQueue(u, 'KIRI_A', mVES);
  assert.equal(q.necesidades_activas.filter(n => n.affectation_id === 'A1').length, 1);
  assert.equal(q.total_necesidad_vigente, 20); // la necesidad sin vínculo no suma economía
  rec('S08', 'S08-a', { entrada: 'A1 20; N1 vinculada; N2/N3 rechazadas', ...snap(u), cola: { activas: q.necesidades_activas.length, sin_vinculo: q.necesidades_sin_vinculo.length } });
});
test('S08-b Afectación anulada cierra la necesidad y no admite una nueva', () => {
  let s = N.createNeed(P.registerAffectation(start(), alta('A1', 20), 'r1'), need('N1', 'A1', 'P3_NORMAL', 'R4_FLEXIBLE'), 'n1');
  s = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 20, ...tr(11) }, 'c');
  const q = N.buildNeedQueue(s, 'KIRI_A', mVES);
  assert.equal(q.necesidades_activas.length, 0); assert.deepEqual(q.necesidades_cerradas.map(n => [n.need_id, n.estado]), [['N1', 'CERRADA']]);
  rejects(() => N.createNeed(s, need('N2', 'A1', 'P3_NORMAL', 'R4_FLEXIBLE', 12), 'n2'), 'AFFECTATION_NOT_ACTIVE', s);
});
test('OBS-08 Persistencia: loadNeedState acepta estado almacenado que viola invariantes', () => {
  const s = N.createNeed(P.registerAffectation(start(), alta('A1', 20), 'r1'), need('N1', 'A1', 'P3_NORMAL', 'R4_FLEXIBLE'), 'n1');
  const tampered = structuredClone(s); tampered.needs.push({ ...tampered.needs[0], need_id: 'N1-BIS' }); tampered.affectations[0].monto_vigente = -50;
  const store = new Map(); const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  let loaded = null, error = null;
  try { N.saveNeedState(storage, tampered); loaded = N.loadNeedState(storage); } catch (e) { error = e.code; }
  const q = loaded && N.buildNeedQueue(loaded, 'KIRI_A', mVES);
  rec('X', 'OBS-08', { observado: { error, activas: q?.necesidades_activas.map(n => n.need_id), disponible: q?.saldo_disponible_gestion } });
  assert.ok(error, `estado inconsistente aceptado: activas=${q?.necesidades_activas.map(n => n.need_id)} disponible=${q?.saldo_disponible_gestion}`);
});

// ===================== S09 Déficit derivado =====================
test('S09-a Déficit = max(0,-disponible); no crea necesidad DEFICIT; vista USD', () => {
  let s = P.registerAffectation(P.registerAffectation(start(100), alta('A1', 80), 'r1'), alta('R1', 50, { naturaleza_afectacion: 'RESERVA' }), 'r2');
  s = N.createNeed(N.createNeed(s, need('N1', 'A1', 'P2_ALTA', 'R4_FLEXIBLE'), 'n1'), need('N2', 'R1', 'P3_NORMAL', 'R4_FLEXIBLE'), 'n2');
  const q = N.buildNeedQueue(s, 'KIRI_A', mVES); const p = pos(s);
  assert.deepEqual([p.saldo_disponible_gestion, p.deficit, q.deficit, q.brecha_consolidada, q.total_necesidad_vigente], [-30, 30, 30, 30, 130]);
  const all = [...q.necesidades_activas, ...q.necesidades_sin_clasificar, ...q.necesidades_sin_vinculo];
  assert.equal(all.length, 2); assert.ok(!JSON.stringify(all).includes('DEFICIT'));
  assert.equal(s.needs.length, 2); close(usd(p).deficit, 30 / BCV);
  assert.equal(pos(P.registerAffectation(start(100), alta('A1', 80), 'x')).deficit, 0);
  rec('S09', 'S09-a', { entrada: 'saldo 100; comp 80; reserva 50', ...snap(s) });
});

// ===================== S10 Prioridad/rigidez y orden determinístico =====================
const S10 = [ // [need_id, prioridad, rigidez, objetivo, hora_evento]
  ['NA', 'P1_CRITICA', 'R4_FLEXIBLE', null, 10], ['NB', 'P2_ALTA', 'R1_HORA_RIGIDA', at(13), 10],
  ['NC', 'P4_DISCRECIONAL', 'R1_HORA_RIGIDA', at(11), 10], ['ND', 'P1_CRITICA', 'R3_FECHA_RIGIDA', at(23, 59), 10],
  ['NE', 'P3_NORMAL', 'R2_VENTANA_DIA', null, 10], ['NF', 'P1_CRITICA', 'R1_HORA_RIGIDA', at(13), 10],
  ['NG', 'P1_CRITICA', 'R1_HORA_RIGIDA', at(13), 10], ['NH', 'P1_CRITICA', 'R1_HORA_RIGIDA', at(13), 9]];
// Oráculo derivado de la Regla 5 (LIQ-CODEX-003): rigidez (R1<R2<R3<R4) → objetivo → prioridad → evento → need_id.
const S10_EXPECTED = ['NC', 'NH', 'NF', 'NG', 'NB', 'NE', 'ND', 'NA'];
const buildS10 = order => {
  let s = start(1000);
  for (const [id] of S10) s = P.registerAffectation(s, alta('AF-' + id, 10), 'alta-' + id);
  for (const [id, p, r, o, h] of order) s = N.createNeed(s, need(id, 'AF-' + id, p, r, h, o ? { fecha_hora_objetivo: o } : {}), 'need-' + id);
  return s;
};
test('S10-a Orden determinístico según Regla 5, independiente del orden de alta, y explicable', () => {
  const s1 = buildS10(S10); const s2 = buildS10([...S10].reverse());
  const q1 = N.buildNeedQueue(s1, 'KIRI_A', mVES); const q2 = N.buildNeedQueue(s2, 'KIRI_A', mVES);
  assert.deepEqual(q1.necesidades_activas.map(n => n.need_id), S10_EXPECTED);
  assert.deepEqual(q2.necesidades_activas.map(n => n.need_id), S10_EXPECTED);
  for (const n of q1.necesidades_activas) assert.deepEqual(Object.keys(n.criterio_orden), ['rigidez_temporal', 'fecha_hora_objetivo', 'prioridad_economica', 'fecha_hora_evento', 'need_id']);
  for (const [id, p, r] of S10) { const n = q1.necesidades_activas.find(x => x.need_id === id); assert.deepEqual([n.prioridad_economica, n.rigidez_temporal], [p, r]); }
  rec('S10', 'S10-a', { orden: q1.necesidades_activas.map(n => n.need_id), criterios: q1.criterios_orden, ...snap(s1) });
});
test('S10-b R1/R3 exigen objetivo; repriorización exige motivo, no es retroactiva y no altera posición', () => {
  const s = N.createNeed(P.registerAffectation(start(), alta('A1', 20), 'r1'), need('N1', 'A1', 'P4_DISCRECIONAL', 'R4_FLEXIBLE'), 'n1');
  const base = P.registerAffectation(start(), alta('A2', 20), 'r2');
  rejects(() => N.createNeed(base, need('X1', 'A2', 'P1_CRITICA', 'R1_HORA_RIGIDA'), 'x1'), 'TARGET_DATETIME_REQUIRED', base);
  rejects(() => N.createNeed(base, need('X3', 'A2', 'P1_CRITICA', 'R3_FECHA_RIGIDA'), 'x3'), 'TARGET_DATETIME_REQUIRED', base);
  rejects(() => N.createNeed(base, need('X4', 'A2', 'P0', 'R4_FLEXIBLE'), 'x4'), 'INVALID_ECONOMIC_PRIORITY', base);
  rejects(() => N.reprioritizeNeed(s, { need_id: 'N1', prioridad_economica: 'P1_CRITICA', ...tr(11) }, 'p0'), 'PRIORITY_REASON_REQUIRED', s);
  rejects(() => N.reprioritizeNeed(s, { need_id: 'N1', prioridad_economica: 'P1_CRITICA', motivo_prioridad: 'm', ...tr(9) }, 'p-retro'), 'RETROACTIVE_NEED_EVENT', s);
  rejects(() => N.reprioritizeNeed(s, { need_id: 'N1', rigidez_temporal: 'R1_HORA_RIGIDA', motivo_prioridad: 'm', ...tr(11) }, 'p-r1'), 'TARGET_DATETIME_REQUIRED', s);
  rejects(() => N.reprioritizeNeed(s, { need_id: 'N1', prioridad_economica: 'P1_CRITICA', monto_vigente: 5, motivo_prioridad: 'm', ...tr(11) }, 'p-amt'), 'IMMUTABLE_NEED_FIELD', s);
  const r = N.reprioritizeNeed(s, { need_id: 'N1', prioridad_economica: 'P1_CRITICA', motivo_prioridad: 'urgencia', ...tr(11) }, 'p1');
  assert.deepEqual(pos(r), pos(s)); const n = r.needs[0];
  assert.deepEqual([n.prioridad_economica, n.rigidez_temporal, n.naturaleza, n.monto_vigente, n.currency_original], ['P1_CRITICA', 'R4_FLEXIBLE', 'COMPROMISO', 20, 'VES']);
  const ev = r.events.at(-1); assert.deepEqual([ev.operacion, ev.anteriores.prioridad_economica, ev.posteriores.prioridad_economica, ev.motivo], ['REPRIORITIZE_NEED', 'P4_DISCRECIONAL', 'P1_CRITICA', 'urgencia']);
});

// ===================== S11 Reclasificación sin doble impacto =====================
test('S11-a COMPROMISO 20 ↔ RESERVA 20 mantiene disponible 80, una afectación, una necesidad', () => {
  let s = N.createNeed(P.registerAffectation(start(), alta('A1', 20), 'r1'), need('N1', 'A1', 'P3_NORMAL', 'R4_FLEXIBLE'), 'n1');
  s = N.reclassifyAffectation(s, { affectation_id: 'A1', naturaleza_destino: 'RESERVA', motivo_reclasificacion: 'garantía', ...tr(11) }, 'rc1');
  assert.deepEqual([pos(s).compromisos_por_ejecutar, pos(s).reservas_bloqueadas, pos(s).saldo_disponible_gestion], [0, 20, 80]);
  assert.deepEqual([s.affectations.length, s.needs.length, s.needs[0].naturaleza, s.affectations[0].amount_original], [1, 1, 'RESERVA', 20]);
  const ev = s.events.at(-1); assert.deepEqual([ev.operacion, ev.anteriores.affectation.naturaleza_afectacion, ev.posteriores.affectation.naturaleza_afectacion], ['RECLASIFICACION', 'COMPROMISO', 'RESERVA']);
  rec('S11', 'S11-a C→R', { entrada: 'saldo 100; comp 20 → reserva', ...snap(s) });
  s = N.reclassifyAffectation(s, { affectation_id: 'A1', naturaleza_destino: 'COMPROMISO', motivo_reclasificacion: 'liberada', ...tr(12) }, 'rc2');
  assert.deepEqual([pos(s).compromisos_por_ejecutar, pos(s).reservas_bloqueadas, pos(s).saldo_disponible_gestion], [20, 0, 80]);
  assert.equal(N.buildNeedQueue(s, 'KIRI_A', mVES).necesidades_activas.length, 1);
  rec('S11', 'S11-a R→C', { entrada: 'reserva 20 → compromiso', ...snap(s) });
});
test('S11-b Reclasificación en USD conserva equivalente VES', () => {
  const s = P.registerAffectation(start(1000), alta('A1', 10, { currency_original: 'USD' }), 'r1');
  const r = N.reclassifyAffectation(s, { affectation_id: 'A1', naturaleza_destino: 'RESERVA', motivo_reclasificacion: 'm', ...tr(9) }, 'rc');
  close(pos(s).saldo_disponible_gestion, 1000 - 365); close(pos(r).saldo_disponible_gestion, 1000 - 365);
  rec('S11', 'S11-b', { entrada: 'saldo 1000 VES; comp 10 USD → reserva', ...snap(r) });
});
test('S11-c Reclasificación inválida se rechaza sin mutación', () => {
  const s = N.createNeed(P.registerAffectation(start(), alta('A1', 20), 'r1'), need('N1', 'A1', 'P3_NORMAL', 'R4_FLEXIBLE', 10), 'n1');
  rejects(() => N.reclassifyAffectation(s, { affectation_id: 'A1', naturaleza_destino: 'RESERVA', motivo_reclasificacion: '  ', ...tr(11) }, 'a'), 'RECLASSIFICATION_REASON_REQUIRED', s);
  rejects(() => N.reclassifyAffectation(s, { affectation_id: 'A1', naturaleza_destino: 'COMPROMISO', motivo_reclasificacion: 'm', ...tr(11) }, 'b'), 'INVALID_RECLASSIFICATION_TARGET', s);
  rejects(() => N.reclassifyAffectation(s, { affectation_id: 'A1', naturaleza_destino: 'RESERVA', motivo_reclasificacion: 'm', ...tr(9, 30) }, 'c'), 'RETROACTIVE_NEED_EVENT', s);
  rejects(() => N.reclassifyAffectation(s, { affectation_id: 'A1', naturaleza_destino: 'RESERVA', monto_vigente: 15, motivo_reclasificacion: 'm', ...tr(11) }, 'd'), 'IMMUTABLE_RECLASSIFICATION_AMOUNT', s);
});

// ===================== S12 Monedas heterogéneas =====================
test('S12-a VES + USD con BCV consolidan en VES; vista USD equivalente', () => {
  let s = P.applyBalanceBatch(catalogue(), [bal('A-BNC-01', 3650, 7), bal('A-BNC-01', 100, 7, 'USD')], 'lote');
  s = P.registerAffectation(s, alta('A1', 50, { currency_original: 'USD' }), 'r1');
  const p = pos(s); assert.deepEqual([p.saldo_bancario, p.compromisos_por_ejecutar, p.saldo_disponible_gestion], [7300, 1825, 5475]);
  close(usd(p).saldo_disponible_gestion, 150);
  assert.deepEqual(s.balances.map(b => [b.amount_original, b.currency_original]), [[3650, 'VES'], [100, 'USD']]);
  rec('S12', 'S12-a', { entrada: 'saldo 3650 VES + 100 USD; comp 50 USD', ...snap(s) });
});
test('S12-b Moneda sin tasa: posición y cola no publicables, error controlado, originales intactos', () => {
  let s = P.registerAffectation(start(1000), alta('E1', 10, { currency_original: 'EUR', naturaleza_afectacion: 'RESERVA' }), 'r1');
  s = N.createNeed(s, need('N1', 'E1', 'P3_NORMAL', 'R4_FLEXIBLE'), 'n1');
  const before = frozenCopy(s); const p = pos(s, mVES); const q = N.buildNeedQueue(s, 'KIRI_A', mVES);
  assert.deepEqual([p.publicable, p.saldo_disponible_gestion, p.errors[0].code], [false, null, 'MISSING_EXCHANGE_RATE']);
  assert.deepEqual([q.publicable, q.total_necesidad_vigente], [false, null]); assert.deepEqual(s, before);
  const pe = pos(s, mEUR); assert.deepEqual([pe.publicable, pe.reservas_bloqueadas, pe.saldo_disponible_gestion], [true, 400, 600]);
  const pn = P.calculateCompanyPosition(P.registerBalance(s, bal('A-BNC-01', 1, 8, 'USD'), 'u'), 'KIRI_A', mNoRate);
  assert.equal(pn.publicable, false);
  rec('S12', 'S12-b', { entrada: 'saldo 1000 VES; reserva 10 EUR; sin EUR_VES → no publicable; con EUR_VES=40 → 400 VES', con_tasa_EUR: { reservas: pe.reservas_bloqueadas, disponible: pe.saldo_disponible_gestion } });
});
test('S12-c position.js y needs.js no implementan conversiones paralelas a money.js', () => {
  for (const f of ['position.js', 'needs.js']) {
    const code = readFileSync(join(SRC, f), 'utf8');
    assert.ok(!/rates\s*[.[]/.test(code), `${f} accede a tasas directamente`);
    assert.ok(!/VES_USD_BCV/.test(code), `${f} referencia BCV directamente`);
  }
});

// ===================== S13 Regresión íntegra =====================
test('S13 Regresión íntegra `node --test` en el commit auditado: 0 fallos', () => {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap'], { cwd: ROOT, encoding: 'utf8', timeout: 300000,
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')) });
  const count = k => Number((r.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1]);
  const summary = { tests: count('tests'), pass: count('pass'), fail: count('fail'), skipped: count('skipped'), todo: count('todo'), cancelled: count('cancelled') };
  rec('S13', 'S13', { regresion: summary, exit: r.status });
  assert.equal(r.status, 0); assert.equal(summary.fail, 0); assert.equal(summary.pass, summary.tests); assert.ok(summary.tests >= 369);
});

// ===================== Transversales =====================
test('X-01 Sin ejecución bancaria ni E/S de red/archivo en src/', () => {
  for (const f of readdirSync(SRC).filter(x => x.endsWith('.js'))) {
    const code = readFileSync(join(SRC, f), 'utf8');
    for (const [m] of code.matchAll(/import[^;]*from\s+['"]([^'"]+)['"]/g)) assert.ok(/from\s+['"]\.\/[a-z-]+\.js['"]/.test(m), `${f}: import externo ${m}`);
    assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|require)\s*\(/.test(code), `${f}: E/S de red`);
  }
});
test('X-02 Estados devueltos son inmutables (congelados en profundidad)', () => {
  const s = P.registerAffectation(start(), alta('A1', 20), 'r1');
  assert.throws(() => { s.affectations[0].monto_vigente = 0; }, TypeError);
  assert.throws(() => { s.balances.push({}); }, TypeError);
});
test('OBS-X03 Simultaneidad: dos escrituras sobre el mismo estado base no se detectan entre sí', () => {
  const base = P.registerAffectation(start(), alta('A1', 20), 'r1');
  const w1 = P.registerAffectation(base, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 15, ...tr(9) }, 'w1');
  const w2 = P.registerAffectation(base, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 15, ...tr(9) }, 'w2');
  rec('X', 'OBS-X03', { observado: { w1_vigente: w1.affectations[0].monto_vigente, w2_vigente: w2.affectations[0].monto_vigente, nota: 'motor puro sin token de versión; la serialización corresponde al llamador' } });
  assert.equal(w1.affectations[0].monto_vigente, 5); assert.equal(w2.affectations[0].monto_vigente, 5); // documental
});
test('OBS-X04 Semántica no regulada: RESERVA con confirmado>0 en ALTA; ALTA con vigente 0', () => {
  const r = P.registerAffectation(start(), alta('R1', 20, { naturaleza_afectacion: 'RESERVA', monto_reflejado_confirmado: 10 }), 'r');
  let e = null; try { P.registerAffectation(r, { affectation_id: 'R1', operacion: 'ANULACION', monto_anulado: 15, ...tr(9) }, 'c'); } catch (x) { e = x.code; }
  const z = P.registerAffectation(start(), alta('Z1', 5, { naturaleza_afectacion: 'RESERVA', monto_vigente: 0 }), 'z');
  rec('X', 'OBS-X04', { observado: { reserva_conf_bloqueado: pos(r).reservas_bloqueadas, anula_15_de_20_conf_10: e, alta_vigente_0_estado: z.affectations[0].estado } });
  assert.equal(e, 'INVALID_CONFIRMED_AMOUNT'); assert.equal(z.affectations[0].estado, 'ACTIVA'); // documental
});
