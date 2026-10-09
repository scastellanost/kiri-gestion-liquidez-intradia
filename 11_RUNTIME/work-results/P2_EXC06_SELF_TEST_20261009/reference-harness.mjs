// PILOT-01/F1/P2 — Arnés de RE-QA independiente nº 3 (Claude Code), 2026-10-09 — EXC-P2-04/05.
// Copia del arnés de 73 casos (rama claude/wizardly-feynman-d2ar02 @ d7847b4, que NO se modifica) con dos
// adaptaciones documentadas: umbral S13 ≥ 397 y RQ-X-02 referido al candidato previo 5af50fd. Añade RQ3-*
// (S12 compatibilidad heterogénea frente a oráculo heredado, banco nativo con FX ajeno, cola sin excepción,
// transiciones nativo↔heterogéneo, persistencia) y OBS-RQ-03 (residuos binarios en la ruta heterogénea aprobada).
//
//   KIRI_P2_ROOT=/ruta/al/checkout/a285519 node --test 11_RUNTIME/qa-audit/claude-code-p2-reqa3/P2_CLAUDE_REQA3.harness.mjs
//
// Oráculos: LIQ-CODEX-001/002/002A/003, aprobaciones #6084388651 (EXC-P2-04) y #6084761588 (EXC-P2-05, opción a:
// exacto cuando los componentes están originalmente en la misma moneda; ruta heterogénea compatible; cola sin
// excepciones no controladas). Un test rojo es evidencia de desviación; OBS-* son documentales.
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
test('OBS-08 (EXC-P2-02) Persistencia: loadNeedState debe rechazar estado almacenado que viola invariantes', () => {
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
  assert.equal(r.status, 0); assert.equal(summary.fail, 0); assert.equal(summary.pass, summary.tests); assert.ok(summary.tests >= 397);
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

// =====================================================================================
// AMPLIACIÓN RE-QA (RQ-*) — oráculos escritos desde LIQ-CODEX-002/002A/003, la aprobación
// funcional #6082751466 y la puerta de compatibilidad monetaria (aritmética decimal exacta,
// sin redondeo, rechazo explícito si no hay representación sin pérdida).
// =====================================================================================
const M = await load('money.js');
const storage = () => { const m = new Map(); return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const KEY = 'kiri.liq-codex-003.state';
// Oráculo decimal independiente (centésimas enteras): no usa el código auditado.
const cents = x => Math.round(x * 100);
const fromCents = c => Number((c / 100).toFixed(2));
const allCents = [];
for (let c = 1; c <= 200; c++) allCents.push(c);
const lcg = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

// ---------------- S02 — precisión, fronteras, divisas, idempotencia ----------------
test('RQ-S02-01 Ejemplos rectores EXC-P2-01 en COMPROMISO y RESERVA: total exacto, ANULADA, sin UNCLASSIFIED ni need activa', () => {
  const out = [];
  for (const nat of ['COMPROMISO', 'RESERVA']) for (const parts of [[1250.30, 250.10, 1000.20], [1.10, 1.00, 0.10], [0.30, 0.10, 0.20], [100.01, 33.33, 33.34, 33.34]]) {
    const [total, ...cuts] = parts;
    let s = P.registerAffectation(start(5000), alta('A1', total, { naturaleza_afectacion: nat }), 'r1');
    s = N.createNeed(s, need('N1', 'A1', 'P2_ALTA', 'R4_FLEXIBLE', 8), 'n1');
    const trail = [];
    cuts.forEach((c, i) => { s = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: c, ...tr(9 + i) }, `c${i}`); trail.push(s.affectations[0].monto_vigente); });
    const q = N.buildNeedQueue(s, 'KIRI_A', mVES);
    out.push({ nat, parts, trail, estado: s.affectations[0].estado, need: s.needs[0].estado });
    assert.equal(s.affectations[0].estado, 'ANULADA'); assert.equal(s.affectations[0].monto_vigente, 0);
    assert.equal(s.affectations[0].amount_original, total); assert.equal(s.affectations[0].currency_original, 'VES');
    assert.equal(s.needs[0].estado, 'CERRADA'); assert.equal(q.necesidades_sin_clasificar.length, 0); assert.equal(q.necesidades_activas.length, 0);
    assert.equal(pos(s).compromisos_por_ejecutar + pos(s).reservas_bloqueadas, 0);
    // valor intermedio exacto (oráculo en centésimas)
    let expected = cents(total); cuts.slice(0, -1).forEach((c, i) => { expected -= cents(c); assert.equal(trail[i], fromCents(expected)); });
  }
  rec('S02', 'RQ-S02-01', { observado: out });
});
test('RQ-S02-02 Barrido exhaustivo 0,01–2,00 × cortes (2 decimales): parcial→total siempre ANULADA y vigente intermedio exacto', () => {
  let total = 0, bad = [];
  for (const T of allCents) for (let f = 1; f < T; f += 3) {
    total++;
    let s = P.registerAffectation(catalogue(), alta('A', T / 100), 'a');
    s = P.registerAffectation(s, { affectation_id: 'A', operacion: 'ANULACION', monto_anulado: f / 100, ...tr(9) }, 'c1');
    if (s.affectations[0].monto_vigente !== fromCents(T - f)) { bad.push([T, f, 'INTERMEDIO', s.affectations[0].monto_vigente]); continue; }
    try { const r = P.registerAffectation(s, { affectation_id: 'A', operacion: 'ANULACION', monto_anulado: fromCents(T - f), ...tr(10) }, 'c2');
      if (r.affectations[0].estado !== 'ANULADA' || r.affectations[0].monto_vigente !== 0) bad.push([T, f, 'RESIDUO']); }
    catch (e) { bad.push([T, f, e.code]); }
  }
  rec('S02', 'RQ-S02-02', { casos: total, defectos: bad.length, ejemplos: bad.slice(0, 5) });
  assert.equal(bad.length, 0, JSON.stringify(bad.slice(0, 5)));
});
test('RQ-S02-03 Muestreo aleatorio 3 000 casos VES/USD/EUR, 2–4 decimales, 2–5 cortes, compromiso con reflejado y reserva', () => {
  const rnd = lcg(20261009); let total = 0; const bad = [];
  const mk = (cur) => P.createPositionState({ empresas: ['E'], bancos: ['B'], cuentas: [{ cuenta: 'C', empresa: 'E', banco: 'B', monedas: [cur] }] });
  for (let i = 0; i < 3000; i++) {
    const cur = ['VES', 'USD', 'EUR'][i % 3]; const scale = 2 + (i % 3); const unit = 10 ** scale;
    const T = 1 + Math.floor(rnd() * 5_000_000); const conf = i % 4 === 0 ? Math.floor(rnd() * T / 2) : 0;
    const nat = i % 5 === 0 ? 'RESERVA' : 'COMPROMISO'; const confUsed = nat === 'COMPROMISO' ? conf : 0;
    const k = 2 + (i % 4); let pending = T - confUsed; const cuts = [];
    for (let j = 0; j < k - 1 && pending > 1; j++) { const c = 1 + Math.floor(rnd() * (pending - 1)); cuts.push(c); pending -= c; }
    cuts.push(pending);
    const dec = u => Number((u / unit).toFixed(scale));
    total++;
    try {
      let s = P.registerAffectation(mk(cur), { affectation_id: 'A', empresa: 'E', tipo_partida: 'P', naturaleza_afectacion: nat, amount_original: dec(T), currency_original: cur, operacion: 'ALTA', ...tr(8) }, 'a');
      if (confUsed) s = P.registerAffectation(s, { affectation_id: 'A', operacion: 'AJUSTE', monto_reflejado_confirmado: dec(confUsed), ...tr(8, 30) }, 'aj');
      let left = T;
      cuts.forEach((c, j) => { s = P.registerAffectation(s, { affectation_id: 'A', operacion: 'ANULACION', monto_anulado: dec(c), ...tr(9, j) }, `c${j}`); left -= c;
        if (s.affectations[0].monto_vigente !== dec(left)) throw Object.assign(new Error(), { code: `INTERMEDIO ${s.affectations[0].monto_vigente}≠${dec(left)}` }); });
      const a = s.affectations[0];
      if (a.estado !== 'ANULADA' || a.monto_vigente !== dec(confUsed) || a.amount_original !== dec(T) || a.currency_original !== cur) bad.push({ i, cur, T: dec(T), estado: a.estado, vig: a.monto_vigente });
    } catch (e) { bad.push({ i, cur, scale, T: dec(T), conf: dec(confUsed), cuts: cuts.map(dec), error: e.code }); }
  }
  rec('S02', 'RQ-S02-03', { casos: total, defectos: bad.length, ejemplos: bad.slice(0, 5) });
  assert.equal(bad.length, 0, JSON.stringify(bad.slice(0, 5)));
});
test('RQ-S02-04 Fronteras: exceso mínimo (0,01 y 0,0001) rechazado sin mutación; exacto aceptado; cero/negativo/NaN rechazados', () => {
  let s = P.registerAffectation(start(5000), alta('A1', 1250.30), 'r1');
  s = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 250.10, ...tr(9) }, 'c1');
  for (const x of [1000.21, 1000.2001, 1000.200001, 0, -1, NaN, Infinity, '1000.20'])
    rejects(() => P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: x, ...tr(10) }, `x${x}`), 'EXCESSIVE_OR_INVALID_CANCELLATION', s);
  const ok = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 1000.20, ...tr(10) }, 'c2');
  assert.equal(ok.affectations[0].estado, 'ANULADA');
  rejects(() => P.registerAffectation(ok, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 0.01, ...tr(11) }, 'c3'), 'AFFECTATION_NOT_ACTIVE', ok);
  // compromiso con reflejado decimal: el pendiente exacto es la frontera
  let c = P.registerAffectation(start(5000), alta('C1', 100.10, { monto_reflejado_confirmado: 33.33 }), 'k');
  rejects(() => P.registerAffectation(c, { affectation_id: 'C1', operacion: 'ANULACION', monto_anulado: 66.78, ...tr(9) }, 'k1'), 'EXCESSIVE_OR_INVALID_CANCELLATION', c);
  c = P.registerAffectation(c, { affectation_id: 'C1', operacion: 'ANULACION', monto_anulado: 66.77, ...tr(9) }, 'k2');
  assert.equal(c.affectations[0].estado, 'ANULADA'); assert.equal(c.affectations[0].monto_vigente, 33.33); assert.equal(c.affectations[0].monto_reflejado_confirmado, 33.33);
  assert.equal(pos(c).compromisos_por_ejecutar, 0);
  rec('S02', 'RQ-S02-04', { observado: { tras_parcial: s.affectations[0].monto_vigente, compromiso_reflejado_final: c.affectations[0] } });
});
test('RQ-S02-05 Pendiente exacto en Posición (1250,30 − 250,10 reflejado = 1000,20) y en la cola', () => {
  const s = P.registerAffectation(start(1000.20), alta('A1', 1250.30, { monto_reflejado_confirmado: 250.10 }), 'r1');
  const p = pos(s); const q = N.buildNeedQueue(s, 'KIRI_A', mVES);
  rec('S02', 'RQ-S02-05', snap(s));
  assert.equal(p.compromisos_por_ejecutar, 1000.2); assert.equal(p.saldo_disponible_gestion, 0); assert.equal(p.deficit, 0);
  assert.equal(q.necesidades_sin_clasificar[0].monto_pendiente, 1000.2);
});
test('RQ-S02-06 Idempotencia de anulación decimal: mismo request_id = misma referencia; payload distinto = IDEMPOTENCY_CONFLICT; tras recarga persiste', () => {
  let s = P.registerAffectation(start(5000), alta('A1', 1.10), 'r1');
  s = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 1.00, ...tr(9) }, 'c1');
  const again = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 1.00, ...tr(9) }, 'c1');
  assert.equal(again, s);
  rejects(() => P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 0.10, ...tr(9) }, 'c1'), 'IDEMPOTENCY_CONFLICT', s);
  const st = storage(); N.saveNeedState(st, s); const loaded = N.loadNeedState(st);
  assert.equal(P.registerAffectation(loaded, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 1.00, ...tr(9) }, 'c1'), loaded);
  const fin = P.registerAffectation(loaded, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 0.10, ...tr(10) }, 'c2');
  assert.equal(fin.affectations[0].estado, 'ANULADA');
  assert.equal(fin.events.filter(e => e.kind === 'AFECTACION').length, 3);
});
test('RQ-S02-07 FX: USD 10,10 anula 0,10 y 10,00 con BCV sintético; equivalencias VES/USD y originales intactos', () => {
  let s = P.registerAffectation(start(1000), alta('U1', 10.10, { currency_original: 'USD' }), 'u');
  s = P.registerAffectation(s, { affectation_id: 'U1', operacion: 'ANULACION', monto_anulado: 0.10, ...tr(9) }, 'u1');
  const mid = pos(s); close(mid.compromisos_por_ejecutar, 10 * BCV); close(usd(mid).compromisos_por_ejecutar, 10);
  s = P.registerAffectation(s, { affectation_id: 'U1', operacion: 'ANULACION', monto_anulado: 10.00, ...tr(10) }, 'u2');
  assert.equal(s.affectations[0].estado, 'ANULADA'); assert.equal(pos(s).compromisos_por_ejecutar, 0);
  assert.equal(s.affectations[0].amount_original, 10.10); assert.equal(s.affectations[0].currency_original, 'USD');
  assert.equal(P.calculateCompanyPosition(s, 'KIRI_A', mNoRate).publicable, true); // sin afectación USD activa no requiere tasa
  rec('S02', 'RQ-S02-07', { intermedio_VES: mid.compromisos_por_ejecutar, intermedio_USD: usd(mid).compromisos_por_ejecutar });
});
test('RQ-S02-08 Representación no segura: rechazo explícito MONETARY_PRECISION_UNSUPPORTED sin mutación (sin redondeo silencioso)', () => {
  const s = P.registerAffectation(start(), alta('H1', 1e20), 'h');
  rejects(() => P.registerAffectation(s, { affectation_id: 'H1', operacion: 'ANULACION', monto_anulado: 0.01, ...tr(9) }, 'h1'), 'MONETARY_PRECISION_UNSUPPORTED', s);
  rejects(() => P.registerAffectation(start(), alta('H2', 1e20, { monto_reflejado_confirmado: 0.01 }), 'h2'), 'MONETARY_PRECISION_UNSUPPORTED', start());
  // exponencial pequeño: exacto
  let e = P.registerAffectation(start(), alta('E1', 0.000001), 'e');
  e = P.registerAffectation(e, { affectation_id: 'E1', operacion: 'ANULACION', monto_anulado: 1e-7, ...tr(9) }, 'e1');
  assert.equal(e.affectations[0].monto_vigente, 9e-7);
  assert.equal(M.subtractDecimal(0.3, 0.1), 0.2); assert.equal(M.addDecimal(0.1, 0.2), 0.3); assert.equal(M.compareDecimal(1000.2, 1250.3 - 250.1), 1);
  rec('S02', 'RQ-S02-08', { observado: { e1_vigente: e.affectations[0].monto_vigente } });
});

// ---------------- S09 — déficit derivado con importes decimales (oráculo exacto) ----------------
test('RQ-S09-01 Déficit exacto: saldo 0,30 con compromisos 0,10 + 0,20 ⇒ disponible 0 y déficit 0 (Regla 6)', () => {
  let s = P.registerBalance(catalogue(), bal('A-BNC-01', 0.30, 7), 'b');
  s = P.applyAffectationBatch(s, [alta('A1', 0.10), alta('A2', 0.20)], 'lote');
  const p = pos(s); const q = N.buildNeedQueue(s, 'KIRI_A', mVES);
  rec('S09', 'RQ-S09-01', { entrada: 'saldo 0,30 VES; compromisos 0,10 y 0,20 VES', observado: { compromisos: p.compromisos_por_ejecutar, disponible: p.saldo_disponible_gestion, deficit: p.deficit, brecha_cola: q.brecha_consolidada, total_necesidad_vigente: q.total_necesidad_vigente } });
  assert.equal(p.compromisos_por_ejecutar, 0.3, `compromisos ${p.compromisos_por_ejecutar}`);
  assert.equal(p.saldo_disponible_gestion, 0, `disponible ${p.saldo_disponible_gestion}`);
  assert.equal(p.deficit, 0, `déficit fantasma ${p.deficit}`);
  assert.equal(q.brecha_consolidada, 0, `brecha fantasma ${q.brecha_consolidada}`);
});
test('RQ-S09-02 Muestreo 2 000 posiciones VES (2 decimales, 2–5 compromisos/reservas, saldo = suma exacta ± 0,01): déficit = oráculo exacto', () => {
  const rnd = lcg(42); let total = 0, zeroCases = 0, phantom = 0, wrongSign = 0, inexact = 0; const ex = [];
  for (let i = 0; i < 2000; i++) {
    const k = 2 + (i % 4); const items = Array.from({ length: k }, () => 1 + Math.floor(rnd() * 1_000_000));
    const sum = items.reduce((a, b) => a + b, 0); const delta = [-1, 0, 0, 1][i % 4]; const saldoC = sum + delta;
    let s = P.registerBalance(catalogue(), bal('A-BNC-01', saldoC / 100, 7), 'b');
    s = P.applyAffectationBatch(s, items.map((c, j) => alta(`A${j}`, c / 100, { naturaleza_afectacion: j % 2 ? 'RESERVA' : 'COMPROMISO' })), 'lote');
    const p = pos(s); total++;
    const exactDef = Math.max(0, -delta) / 100; if (exactDef === 0) zeroCases++;
    if (exactDef === 0 && p.deficit > 0) { phantom++; if (ex.length < 6) ex.push({ saldo: saldoC / 100, items: items.map(c => c / 100), deficit: p.deficit, disponible: p.saldo_disponible_gestion }); }
    else if (exactDef > 0 && !(p.deficit > 0)) wrongSign++;
    else if (p.deficit !== exactDef) inexact++;
  }
  rec('S09', 'RQ-S09-02', { casos: total, casos_con_deficit_exacto_cero: zeroCases, deficit_fantasma: phantom, deficit_omitido: wrongSign, deficit_inexacto: inexact, tasa_fantasma: +(phantom / total).toFixed(4), ejemplos: ex });
  assert.equal(phantom, 0, `déficit fantasma en ${phantom}/${total}: ${JSON.stringify(ex.slice(0, 3))}`);
});

// ---------------- S08 — persistencia válida y corrupta, cierre atómico ----------------
const linkedState = () => {
  let s = P.registerAffectation(start(), alta('A1', 20), 'r1');
  s = P.registerAffectation(s, alta('R1', 15, { naturaleza_afectacion: 'RESERVA', tipo_partida: 'RESERVA_NOMINA' }), 'r2');
  s = N.createNeed(s, need('N1', 'A1', 'P2_ALTA', 'R1_HORA_RIGIDA', 9, { fecha_hora_objetivo: at(15) }), 'n1');
  return N.createNeed(s, need('N2', 'R1', 'P3_NORMAL', 'R4_FLEXIBLE', 9), 'n2');
};
const corruptions = {
  'necesidad ACTIVA duplicada por afectación': s => s.needs.push({ ...s.needs[0], need_id: 'N1-BIS' }),
  'need_id duplicado': s => s.needs.push({ ...s.needs[1], need_id: 'N1' }),
  'affectation_id duplicado': s => s.affectations.push({ ...s.affectations[0] }),
  'monto_vigente negativo': s => { s.affectations[0].monto_vigente = -50; },
  'reflejado > vigente': s => { s.affectations[0].monto_reflejado_confirmado = 25; },
  'reflejado negativo': s => { s.affectations[0].monto_reflejado_confirmado = -1; },
  'amount_original 0 en afectación': s => { s.affectations[0].amount_original = 0; },
  'ANULADA con pendiente': s => { s.affectations[0].estado = 'ANULADA'; },
  'estado de afectación desconocido': s => { s.affectations[0].estado = 'SUSPENDIDA'; },
  'naturaleza desconocida': s => { s.affectations[0].naturaleza_afectacion = 'PRESTAMO'; },
  'empresa fuera de catálogo': s => { s.affectations[0].empresa = 'KIRI_Z'; },
  'banco asignado fuera de catálogo': s => { s.affectations[0].banco_asignado = 'BANCO_X'; },
  'moneda inválida en afectación': s => { s.affectations[0].currency_original = 'bolivar'; },
  'timestamp inválido en afectación': s => { s.affectations[0].fecha_hora_evento = '2026-02-30T10:00:00Z'; },
  'need ACTIVA sobre afectación ANULADA': s => { Object.assign(s.affectations[0], { estado: 'ANULADA', monto_vigente: 0 }); },
  'need vinculada a afectación inexistente': s => { s.needs[0].affectation_id = 'NO-EXISTE'; },
  'need con empresa distinta de su afectación': s => { s.needs[0].empresa = 'KIRI_B'; },
  'need con moneda distinta de su afectación': s => { s.needs[0].currency_original = 'USD'; },
  'need con amount_original distinto': s => { s.needs[0].amount_original = 21; },
  'need con tipo_partida distinto': s => { s.needs[0].tipo_partida = 'OTRA'; },
  'need ACTIVA con naturaleza distinta': s => { s.needs[0].naturaleza = 'RESERVA'; },
  'need con estado desconocido': s => { s.needs[0].estado = 'PAUSADA'; },
  'need con prioridad inválida': s => { s.needs[0].prioridad_economica = 'P0'; },
  'R1 sin objetivo': s => { s.needs[0].fecha_hora_objetivo = null; },
  'need con seguimiento no booleano': s => { s.needs[0].requiere_seguimiento_adicional = 'no'; },
  'need ACTIVA con pendiente 0 sin seguimiento': s => { s.affectations[0].monto_reflejado_confirmado = 20; },
  'saldo duplicado por cuenta/moneda': s => s.balances.push({ ...s.balances[0] }),
  'saldo en cuenta de otra empresa': s => { s.balances[0].empresa = 'KIRI_B'; },
  'saldo en moneda no habilitada': s => { s.balances[0].currency_original = 'GBP'; },
  'catálogo sin cuentas': s => { delete s.catalogue.cuentas; },
  'needs no es arreglo': s => { s.needs = {}; },
  'importe NaN serializado (null)': s => { s.affectations[1].monto_vigente = null; }
};
test(`RQ-S08-01 Persistencia corrupta: ${Object.keys(corruptions).length} manipulaciones ⇒ INVALID_STORED_NEED_STATE en load y en save, sin escritura ni reparación`, () => {
  const base = linkedState(); const result = {};
  for (const [name, mutate] of Object.entries(corruptions)) {
    const bad = structuredClone(base); mutate(bad);
    const st = storage(); st.setItem(KEY, JSON.stringify({ version: 1, state: bad })); const raw = st.m.get(KEY);
    let loadErr = null, saveErr = null;
    try { N.loadNeedState(st); } catch (e) { loadErr = e.code; }
    const st2 = storage(); try { N.saveNeedState(st2, bad); } catch (e) { saveErr = e.code; }
    result[name] = { load: loadErr, save: saveErr };
    assert.equal(loadErr, 'INVALID_STORED_NEED_STATE', `${name}: load ${loadErr}`);
    assert.equal(saveErr, 'INVALID_STORED_NEED_STATE', `${name}: save ${saveErr}`);
    assert.equal(st.m.get(KEY), raw, `${name}: almacenamiento modificado`); assert.equal(st2.m.size, 0, `${name}: escritura parcial`);
  }
  for (const raw of ['{', '[]', 'null', JSON.stringify({ version: 2, state: base }), JSON.stringify({ version: 1 })]) {
    const st = storage(); st.setItem(KEY, raw); assert.throws(() => N.loadNeedState(st), { code: 'INVALID_STORED_NEED_STATE' }, raw.slice(0, 20));
  }
  rec('S08', 'RQ-S08-01', { manipulaciones: result, malformados: 5 });
});
test('RQ-S08-02 Propiedad: 400 secuencias aleatorias de operaciones válidas ⇒ todo estado alcanzable se guarda, recarga idéntico y conserva ≤1 need ACTIVA por afectación', () => {
  const rnd = lcg(7); let states = 0, ops = 0; const failures = [];
  for (let seq = 0; seq < 400; seq++) {
    let s = start(500); let h = 8, m = 0; const tick = () => { m += 1; if (m === 60) { m = 0; h++; } return tr(h, m); };
    for (let step = 0; step < 12; step++) {
      const ids = s.affectations.map(a => a.affectation_id); const act = s.affectations.filter(a => a.estado === 'ACTIVA');
      const pick = arr => arr[Math.floor(rnd() * arr.length)]; const r = Math.floor(rnd() * 8); const rid = `q${seq}-${step}`;
      try {
        if (r === 0 || !act.length) s = P.registerAffectation(s, alta(`A${ids.length}`, (1 + Math.floor(rnd() * 9999)) / 100, { naturaleza_afectacion: rnd() < 0.5 ? 'COMPROMISO' : 'RESERVA', ...tick() }), rid);
        else { const a = pick(act); const pend = Math.round(P.getAffectationPending(a) * 100);
          if ((r === 1 || r === 2) && pend === 0) continue; // sin pendiente no hay anulación válida que generar
          if (r === 1) s = P.registerAffectation(s, { affectation_id: a.affectation_id, operacion: 'ANULACION', monto_anulado: Math.max(1, Math.floor(rnd() * pend)) / 100, ...tick() }, rid);
          else if (r === 2) s = P.registerAffectation(s, { affectation_id: a.affectation_id, operacion: 'ANULACION', monto_anulado: pend / 100, ...tick() }, rid);
          else if (r === 3 && a.naturaleza_afectacion === 'COMPROMISO') s = P.registerAffectation(s, { affectation_id: a.affectation_id, operacion: 'AJUSTE', monto_reflejado_confirmado: a.monto_vigente, ...tick() }, rid);
          else if (r === 4) s = P.registerAffectation(s, { affectation_id: a.affectation_id, operacion: 'AJUSTE', monto_vigente: Number((a.monto_vigente + 1.11).toFixed(2)), ...tick() }, rid);
          else if (r === 5 && !(a.naturaleza_afectacion === 'COMPROMISO' && a.monto_reflejado_confirmado > 0)) s = N.reclassifyAffectation(s, { affectation_id: a.affectation_id, naturaleza_destino: a.naturaleza_afectacion === 'COMPROMISO' ? 'RESERVA' : 'COMPROMISO', motivo_reclasificacion: 'auditoría', ...tick() }, rid);
          else if (r === 6 && !(s.needs ?? []).some(n => n.affectation_id === a.affectation_id && n.estado === 'ACTIVA')) s = N.createNeed(s, { need_id: `N${(s.needs ?? []).length}`, affectation_id: a.affectation_id, prioridad_economica: pick(['P1_CRITICA', 'P2_ALTA', 'P3_NORMAL', 'P4_DISCRECIONAL']), rigidez_temporal: 'R4_FLEXIBLE', requiere_seguimiento_adicional: rnd() < 0.3, ...tick() }, rid);
          else if (r === 7) { const n = (s.needs ?? []).find(x => x.affectation_id === a.affectation_id && x.estado === 'ACTIVA'); if (n) s = N.reprioritizeNeed(s, { need_id: n.need_id, prioridad_economica: 'P1_CRITICA', motivo_prioridad: 'auditoría', ...tick() }, rid); }
        }
        ops++;
      } catch (e) { failures.push({ seq, step, r, op_error: e.code }); continue; }
      states++;
      const st = storage();
      try { N.saveNeedState(st, s); const back = N.loadNeedState(st); assert.deepEqual(back, s); }
      catch (e) { failures.push({ seq, step, persist_error: e.code ?? e.message.slice(0, 80) }); }
      for (const a of s.affectations) assert.ok((s.needs ?? []).filter(n => n.affectation_id === a.affectation_id && n.estado === 'ACTIVA').length <= 1);
    }
  }
  rec('S08', 'RQ-S08-02', { secuencias: 400, estados_verificados: states, operaciones: ops, fallos: failures.length, ejemplos: failures.slice(0, 5) });
  assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 5)));
});
test('RQ-S08-03 Cierre atómico: anulación total cierra la need en la misma operación, con evento trazable, sin cambio económico extra; rechazo no deja cierre parcial', () => {
  let s = linkedState(); const before = pos(s);
  const evs = s.events.length;
  const t = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 20, ...tr(10) }, 'x');
  const close = t.events.slice(evs);
  assert.deepEqual(close.map(e => e.kind + ':' + (e.operacion ?? e.result?.operacion)), ['AFECTACION:ANULACION', 'NEED:CLOSE_NEED_IF_RESOLVED']);
  assert.equal(close[1].anteriores.estado, 'ACTIVA'); assert.equal(close[1].posteriores.estado, 'CERRADA'); assert.equal(close[1].request_id, 'x');
  assert.equal(t.needs.find(n => n.need_id === 'N1').estado, 'CERRADA'); assert.equal(t.needs.find(n => n.need_id === 'N2').estado, 'ACTIVA');
  close; assert.equal(pos(t).saldo_disponible_gestion, before.saldo_disponible_gestion + 20);
  // lote atómico: segundo registro inválido ⇒ nada se cierra
  rejects(() => P.applyAffectationBatch(s, [{ affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 20, ...tr(10) }, { affectation_id: 'R1', operacion: 'ANULACION', monto_anulado: 99, ...tr(10) }], 'lx'), 'EXCESSIVE_OR_INVALID_CANCELLATION', s);
  // repetición idempotente: sin eventos duplicados
  assert.equal(P.registerAffectation(t, { affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 20, ...tr(10) }, 'x'), t);
  rec('S08', 'RQ-S08-03', { eventos: close.map(e => ({ kind: e.kind, operacion: e.operacion ?? e.result?.operacion, request_id: e.request_id })) });
});
test('RQ-S08-04 Pendiente 0 por reflejado total: need sin seguimiento se cierra; con seguimiento permanece en seguimiento (Regla 12)', () => {
  let s = P.registerAffectation(start(), alta('A1', 20), 'r1');
  s = P.registerAffectation(s, alta('A2', 30, { tipo_partida: 'IMPUESTO' }), 'r2');
  s = N.createNeed(s, need('N1', 'A1', 'P2_ALTA', 'R4_FLEXIBLE'), 'n1');
  s = N.createNeed(s, need('N2', 'A2', 'P2_ALTA', 'R4_FLEXIBLE', 10, { requiere_seguimiento_adicional: true }), 'n2');
  s = P.applyAffectationBatch(s, [{ affectation_id: 'A1', operacion: 'AJUSTE', monto_reflejado_confirmado: 20, ...tr(11) }, { affectation_id: 'A2', operacion: 'AJUSTE', monto_reflejado_confirmado: 30, ...tr(11) }], 'aj');
  const q = N.buildNeedQueue(s, 'KIRI_A', mVES);
  assert.equal(s.needs[0].estado, 'CERRADA'); assert.equal(s.needs[1].estado, 'ACTIVA');
  assert.deepEqual(q.necesidades_seguimiento.map(n => n.need_id), ['N2']); assert.equal(q.necesidades_activas.length, 0);
  const st = storage(); N.saveNeedState(st, s); assert.deepEqual(N.loadNeedState(st), s);
});
test('OBS-RQ-01 Reapertura tras pendiente 0: AJUSTE posterior que eleva el vigente deja la need CERRADA y la afectación como UNCLASSIFIED (base 851bb58: need ACTIVA con su prioridad)', () => {
  let s = P.registerAffectation(start(), alta('A1', 100), 'r1');
  s = N.createNeed(s, need('N1', 'A1', 'P1_CRITICA', 'R1_HORA_RIGIDA', 9, { fecha_hora_objetivo: at(15) }), 'n1');
  s = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'AJUSTE', monto_reflejado_confirmado: 100, ...tr(10) }, 'aj1');
  s = P.registerAffectation(s, { affectation_id: 'A1', operacion: 'AJUSTE', monto_vigente: 150, ...tr(11) }, 'aj2');
  const q = N.buildNeedQueue(s, 'KIRI_A', mVES);
  const observed = { need: s.needs[0].estado, activas: q.necesidades_activas.map(n => n.need_id), sin_clasificar: q.necesidades_sin_clasificar.map(n => [n.affectation_id, n.monto_pendiente]), prioridad_perdida: 'P1_CRITICA/R1' };
  rec('X', 'OBS-RQ-01', { observado: observed, nota: 'Contrato (Regla 12/16) no regula la reapertura; decisión funcional requerida' });
  assert.equal(observed.need, 'CERRADA'); assert.deepEqual(observed.sin_clasificar, [['A1', 50]]); // documental
});

// ---------------- S10 — jerarquía R1→R2→R3→R4 y desempates ----------------
const RANK = { R1_HORA_RIGIDA: 0, R2_VENTANA_DIA: 1, R3_FECHA_RIGIDA: 2, R4_FLEXIBLE: 3 };
const PR = { P1_CRITICA: 0, P2_ALTA: 1, P3_NORMAL: 2, P4_DISCRECIONAL: 3 };
const oracle = (a, b) => {
  const ta = a.fecha_hora_objetivo ? Date.parse(a.fecha_hora_objetivo) : Infinity, tb = b.fecha_hora_objetivo ? Date.parse(b.fecha_hora_objetivo) : Infinity;
  return RANK[a.rigidez_temporal] - RANK[b.rigidez_temporal] || (ta < tb ? -1 : ta > tb ? 1 : 0) || PR[a.prioridad_economica] - PR[b.prioridad_economica]
    || Date.parse(a.fecha_hora_evento) - Date.parse(b.fecha_hora_evento) || (a.need_id < b.need_id ? -1 : a.need_id > b.need_id ? 1 : 0);
};
const queueOf = specs => {
  let s = P.registerBalance(catalogue(), bal('A-BNC-01', 100, 7), 'b');
  s = P.applyAffectationBatch(s, specs.map(x => alta(`AF-${x.need_id}`, 1)), 'lote');
  specs.forEach((x, i) => { s = N.createNeed(s, { affectation_id: `AF-${x.need_id}`, origen: 'AUDITORIA-CLAUDE-P2', ...x }, `n-${i}`); });
  return N.buildNeedQueue(s, 'KIRI_A', mVES);
};
test('RQ-S10-01 Jerarquía prevalece sobre fecha objetivo y prioridad: R2 sin objetivo/P4 antes que R3 con objetivo más temprano/P1', () => {
  const q = queueOf([
    { need_id: 'R4-P1', rigidez_temporal: 'R4_FLEXIBLE', prioridad_economica: 'P1_CRITICA', fecha_hora_objetivo: at(8, 30), fecha_hora_evento: at(8) },
    { need_id: 'R3-P1', rigidez_temporal: 'R3_FECHA_RIGIDA', prioridad_economica: 'P1_CRITICA', fecha_hora_objetivo: at(9), fecha_hora_evento: at(8) },
    { need_id: 'R2-P4', rigidez_temporal: 'R2_VENTANA_DIA', prioridad_economica: 'P4_DISCRECIONAL', fecha_hora_evento: at(8) },
    { need_id: 'R1-P4', rigidez_temporal: 'R1_HORA_RIGIDA', prioridad_economica: 'P4_DISCRECIONAL', fecha_hora_objetivo: '2026-10-10T23:00:00Z', fecha_hora_evento: at(8) }
  ]);
  const order = q.necesidades_activas.map(n => n.need_id);
  rec('S10', 'RQ-S10-01', { orden: order, criterios: q.necesidades_activas.map(n => n.criterio_orden) });
  assert.deepEqual(order, ['R1-P4', 'R2-P4', 'R3-P1', 'R4-P1']);
  assert.deepEqual(q.criterios_orden, ['rigidez_temporal', 'fecha_hora_objetivo', 'prioridad_economica', 'fecha_hora_evento', 'need_id']);
});
test('RQ-S10-02 Desempates sucesivos dentro de igual rigidez: objetivo (ausente al final) → prioridad → evento → need_id; zonas horarias por instante', () => {
  const q = queueOf([
    { need_id: 'Z', rigidez_temporal: 'R2_VENTANA_DIA', prioridad_economica: 'P1_CRITICA', fecha_hora_evento: at(8) },
    { need_id: 'B', rigidez_temporal: 'R2_VENTANA_DIA', prioridad_economica: 'P3_NORMAL', fecha_hora_objetivo: '2026-10-09T08:00:00-04:00', fecha_hora_evento: at(9) },
    { need_id: 'A', rigidez_temporal: 'R2_VENTANA_DIA', prioridad_economica: 'P3_NORMAL', fecha_hora_objetivo: at(12), fecha_hora_evento: at(9) },
    { need_id: 'C', rigidez_temporal: 'R2_VENTANA_DIA', prioridad_economica: 'P2_ALTA', fecha_hora_objetivo: at(12), fecha_hora_evento: at(10) },
    { need_id: 'D', rigidez_temporal: 'R2_VENTANA_DIA', prioridad_economica: 'P2_ALTA', fecha_hora_objetivo: at(12), fecha_hora_evento: at(8) },
    { need_id: 'F', rigidez_temporal: 'R2_VENTANA_DIA', prioridad_economica: 'P2_ALTA', fecha_hora_objetivo: at(12), fecha_hora_evento: at(8) },
    { need_id: 'E', rigidez_temporal: 'R2_VENTANA_DIA', prioridad_economica: 'P2_ALTA', fecha_hora_objetivo: at(12), fecha_hora_evento: at(8) }
  ]);
  // B: 08:00-04:00 = 12:00Z, empata con A/C/D/E/F en objetivo; Z sin objetivo al final pese a P1.
  assert.deepEqual(q.necesidades_activas.map(n => n.need_id), ['D', 'E', 'F', 'C', 'A', 'B', 'Z']);
  assert.equal(q.necesidades_activas.find(n => n.need_id === 'Z').fecha_hora_objetivo, null); // no completa objetivo ausente
});
test('RQ-S10-03 Matriz completa 4 rigideces × 4 prioridades × objetivo{temprano,tardío,ausente} (40 needs válidas), 50 permutaciones de alta: orden = oráculo e invariante', () => {
  const specs = []; let i = 0;
  for (const r of Object.keys(RANK)) for (const p of Object.keys(PR)) for (const t of [at(10), at(16), null]) {
    if (t === null && (r === 'R1_HORA_RIGIDA' || r === 'R3_FECHA_RIGIDA')) continue;
    specs.push({ need_id: `n${String(i).padStart(2, '0')}`, rigidez_temporal: r, prioridad_economica: p, fecha_hora_evento: at(8, i % 7), ...(t ? { fecha_hora_objetivo: t } : {}) }); i++;
  }
  const expected = specs.map(x => ({ ...x, fecha_hora_objetivo: x.fecha_hora_objetivo ?? null })).sort(oracle).map(x => x.need_id);
  const rnd = lcg(99);
  for (let k = 0; k < 50; k++) {
    const perm = specs.slice(); for (let j = perm.length - 1; j > 0; j--) { const x = Math.floor(rnd() * (j + 1)); [perm[j], perm[x]] = [perm[x], perm[j]]; }
    assert.deepEqual(queueOf(perm).necesidades_activas.map(n => n.need_id), expected, `permutación ${k}`);
  }
  rec('S10', 'RQ-S10-03', { needs: specs.length, permutaciones: 50, primeros: expected.slice(0, 6), ultimos: expected.slice(-4) });
});
test('RQ-S10-04 Repriorización R4→R1 reubica la need sin alterar posición ni naturaleza; jerarquía no reclasifica', () => {
  let s = P.registerBalance(catalogue(), bal('A-BNC-01', 100, 7), 'b');
  s = P.applyAffectationBatch(s, [alta('X', 10), alta('Y', 20, { naturaleza_afectacion: 'RESERVA' })], 'l');
  s = N.createNeed(s, need('NX', 'X', 'P1_CRITICA', 'R2_VENTANA_DIA'), 'nx');
  s = N.createNeed(s, need('NY', 'Y', 'P4_DISCRECIONAL', 'R4_FLEXIBLE'), 'ny');
  const before = pos(s);
  s = N.reprioritizeNeed(s, { need_id: 'NY', rigidez_temporal: 'R1_HORA_RIGIDA', fecha_hora_objetivo: at(18), motivo_prioridad: 'cierre de nómina', ...tr(11) }, 'rp');
  const q = N.buildNeedQueue(s, 'KIRI_A', mVES);
  assert.deepEqual(q.necesidades_activas.map(n => n.need_id), ['NY', 'NX']);
  assert.equal(q.necesidades_activas[0].naturaleza, 'RESERVA'); assert.deepEqual(pos(s), before);
  rejects(() => N.reprioritizeNeed(s, { need_id: 'NX', rigidez_temporal: 'R3_FECHA_RIGIDA', motivo_prioridad: 'x', ...tr(12) }, 'rp2'), 'TARGET_DATETIME_REQUIRED', s);
});

// ---------------- Transversales ampliados ----------------
test('RQ-X-01 Sin efectos secundarios: lectura (posición, cola, preview, save) no muta el estado; rechazos no mutan', () => {
  const s = linkedState(); const copy = structuredClone(s);
  pos(s); usd(pos(s)); N.buildNeedQueue(s, 'KIRI_A', mVES); P.previewAffectations(s, [{ affectation_id: 'A1', operacion: 'ANULACION', monto_anulado: 20, ...tr(10) }], { request_id: 'pv' });
  N.saveNeedState(storage(), s);
  assert.deepEqual(s, copy);
  rejects(() => N.createNeed(s, need('N9', 'A1', 'P1_CRITICA', 'R4_FLEXIBLE', 12), 'n9'), 'DUPLICATE_ACTIVE_NEED', s);
});
test('RQ-X-02 Superficie de cambio acotada respecto del candidato previo 5af50fd: src/ solo position.js y needs.js; test/ solo altas', () => {
  const r = spawnSync('git', ['diff', '--name-status', '5af50fdc829e94a6b62dc909923093a393c5912b', 'HEAD', '--', 'src', 'test', 'package.json'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) return; // checkout sin historia: se acredita por manifiesto en el dictamen
  const files = r.stdout.trim().split('\n').filter(Boolean).sort();
  rec('X', 'RQ-X-02', { cambiados: files });
  assert.deepEqual(files, ['A\ttest/p2-exc05-fx-compatibility.test.js', 'M\tsrc/needs.js', 'M\tsrc/position.js']);
});

// =====================================================================================
// AMPLIACIÓN RE-QA 2 (RQ2-*) — EXC-P2-04 y no regresión de monedas heterogéneas.
// =====================================================================================
const mRate = (bcv, eur = 40) => createState({ managedDate: DAY, rates: { VES_USD_BCV: rate(bcv), EUR_VES: rate(eur) } });
const balB = (amount, currency = 'VES') => bal('A-BNC-01', amount, 7, currency);
const relClose = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} ≉ ${b}`);
const tryQueue = (s, m) => { try { return { q: N.buildNeedQueue(s, 'KIRI_A', m) }; } catch (e) { return { thrown: `${e.name}:${e.code}` }; } };

// ---------------- S09 — EXC-P2-04 en empresa, banco y cola ----------------
test('RQ2-S09-01 1 500 posiciones VES exactamente equilibradas (2 decimales, 2–6 afectaciones, compromisos con reflejado parcial y reservas, asignadas a banco): empresa, banco y cola sin déficit fantasma', () => {
  const rnd = lcg(5); let bad = []; let n = 0;
  for (let i = 0; i < 1500; i++) {
    const k = 2 + (i % 5); const rows = []; let pendTotal = 0;
    for (let j = 0; j < k; j++) {
      const amt = 1 + Math.floor(rnd() * 2_000_000); const nat = j % 2 ? 'RESERVA' : 'COMPROMISO';
      const conf = nat === 'COMPROMISO' && j % 3 === 0 ? Math.floor(rnd() * amt) : 0;
      rows.push(alta(`A${j}`, amt / 100, { naturaleza_afectacion: nat, banco_asignado: 'BNC', ...(conf ? { monto_reflejado_confirmado: conf / 100 } : {}) }));
      pendTotal += amt - conf;
    }
    let s = P.registerBalance(catalogue(), balB(pendTotal / 100), 'b'); s = P.applyAffectationBatch(s, rows, 'l');
    const p = pos(s); const b = P.calculateBankPosition(s, 'KIRI_A', 'BNC', mVES); const { q, thrown } = tryQueue(s, mVES); n++;
    const ok = p.publicable && p.saldo_disponible_gestion === 0 && p.deficit === 0 && p.compromisos_por_ejecutar + 0 === p.compromisos_por_ejecutar
      && b.publicable && b.disponibilidad_localizada_preliminar === 0 && !thrown && q.deficit === 0 && q.brecha_consolidada === 0 && q.total_necesidad_vigente === pendTotal / 100;
    if (!ok && bad.length < 5) bad.push({ i, saldo: pendTotal / 100, disp: p.saldo_disponible_gestion, def: p.deficit, banco: b.disponibilidad_localizada_preliminar, cola: thrown ?? [q.deficit, q.total_necesidad_vigente] });
    if (!ok) bad.n = (bad.n ?? 0) + 1;
  }
  rec('S09', 'RQ2-S09-01', { casos: n, defectos: bad.n ?? 0, ejemplos: bad });
  assert.equal(bad.n ?? 0, 0, JSON.stringify(bad));
});
test('RQ2-S09-02 Déficit real y superávit exactos: −0,01 ⇒ déficit 0,01; −0,00001 ⇒ 0,00001; +0,01 ⇒ disponible 0,01 y déficit 0 (500 casos c/u)', () => {
  const rnd = lcg(11); let bad = 0; const ex = [];
  for (const [unit, delta, expDisp, expDef] of [[100, -1, -0.01, 0.01], [100000, -1, -0.00001, 0.00001], [100, 1, 0.01, 0]]) for (let i = 0; i < 500; i++) {
    const items = [1 + Math.floor(rnd() * 1e7), 1 + Math.floor(rnd() * 1e7), 1 + Math.floor(rnd() * 1e7)];
    const sum = items.reduce((a, b) => a + b, 0);
    let s = P.registerBalance(catalogue(), balB((sum + delta) / unit), 'b');
    s = P.applyAffectationBatch(s, items.map((c, j) => alta(`A${j}`, c / unit, { naturaleza_afectacion: j ? 'RESERVA' : 'COMPROMISO' })), 'l');
    const p = pos(s); const { q, thrown } = tryQueue(s, mVES);
    if (!(p.saldo_disponible_gestion === expDisp && p.deficit === expDef && !thrown && q.brecha_consolidada === expDef)) { bad++; if (ex.length < 4) ex.push({ unit, delta, disp: p.saldo_disponible_gestion, def: p.deficit, err: p.errors, cola: thrown }); }
  }
  rec('S09', 'RQ2-S09-02', { casos: 1500, defectos: bad, ejemplos: ex });
  assert.equal(bad, 0, JSON.stringify(ex));
});
test('RQ2-S09-03 Frontera de representación en igual moneda: resultado no representable ⇒ posición no publicable con MONETARY_PRECISION_UNSUPPORTED, cola controlada, originales intactos', () => {
  let s = P.registerBalance(catalogue(), balB(1e16), 'b'); s = P.registerAffectation(s, alta('A1', 0.01), 'a');
  const p = pos(s); const { q, thrown } = tryQueue(s, mVES);
  rec('S09', 'RQ2-S09-03', { posicion: { publicable: p.publicable, errores: p.errors }, cola: thrown ?? { publicable: q.publicable, errores: q.errors } });
  assert.equal(p.publicable, false); assert.deepEqual(p.errors.map(e => e.code), ['MONETARY_PRECISION_UNSUPPORTED']);
  assert.equal(thrown, undefined); assert.equal(q.publicable, false); assert.equal(q.deficit, null);
  assert.equal(s.balances[0].amount_original, 1e16); assert.equal(s.affectations[0].amount_original, 0.01);
});
test('RQ2-S09-04 Equilibrio exacto persiste tras guardar y recargar; vista USD de posición equilibrada con déficit 0', () => {
  let s = P.registerBalance(catalogue(), balB(0.30), 'b'); s = P.applyAffectationBatch(s, [alta('A1', 0.10), alta('A2', 0.20, { naturaleza_afectacion: 'RESERVA' })], 'l');
  const st = storage(); N.saveNeedState(st, s); const back = N.loadNeedState(st);
  assert.deepEqual(back, s); assert.equal(pos(back).deficit, 0); assert.equal(usd(pos(back)).deficit, 0); assert.equal(usd(pos(back)).saldo_disponible_gestion, 0);
});

// ---------------- S12 — monedas heterogéneas (preservación exigida por #6084388651) ----------------
test('RQ2-S12-01 Reproducción mínima: saldo USD 5 624,34 + VES 82 075,82, BCV 36,4721; compromiso VES 5 792,17 y reserva VES 18,25 ⇒ posición publicable (en 9146f4f: disponible 281 396,890914)', () => {
  const m = mRate(36.4721);
  let s = P.applyBalanceBatch(catalogue(), [balB(5624.34, 'USD'), balB(82075.82)], 'b');
  s = P.applyAffectationBatch(s, [alta('A1', 5792.17), alta('R1', 18.25, { naturaleza_afectacion: 'RESERVA' })], 'l');
  const p = P.calculateCompanyPosition(s, 'KIRI_A', m); const { q, thrown } = tryQueue(s, m);
  const oracle = 5624.34 * 36.4721 + 82075.82 - 5792.17 - 18.25;
  rec('S12', 'RQ2-S12-01', { oraculo_disponible: oracle, observado: { publicable: p.publicable, disponible: p.saldo_disponible_gestion, errores: p.errors, cola: thrown ?? q.publicable } });
  assert.equal(p.publicable, true, `posición no publicable: ${JSON.stringify(p.errors)}`);
  relClose(p.saldo_disponible_gestion, oracle, 'disponible'); assert.equal(thrown, undefined);
});
test('RQ2-S12-02 buildNeedQueue no debe lanzar excepción: saldo USD 4 087,82 + VES 54 425,29, BCV 191,6489; compromiso USD 9 024,27 y reserva VES 449,19', () => {
  const m = mRate(191.6489);
  let s = P.applyBalanceBatch(catalogue(), [balB(4087.82, 'USD'), balB(54425.29)], 'b');
  s = P.applyAffectationBatch(s, [alta('A1', 9024.27, { currency_original: 'USD' }), alta('R1', 449.19, { naturaleza_afectacion: 'RESERVA' })], 'l');
  const p = P.calculateCompanyPosition(s, 'KIRI_A', m); const { q, thrown } = tryQueue(s, m);
  rec('S12', 'RQ2-S12-02', { observado: { posicion_publicable: p.publicable, deficit: p.deficit, cola: thrown ?? { publicable: q.publicable, deficit: q.deficit } } });
  assert.equal(thrown, undefined, `la cola lanza ${thrown}`);
  relClose(q.deficit, 9024.27 * 191.6489 + 449.19 - 4087.82 * 191.6489 - 54425.29, 'déficit');
});
test('RQ2-S12-03 Muestreo 2 000 posiciones heterogéneas VES/USD/EUR, BCV {36,5; 36,4721; 37,123456; 40,1234; 191,6489}: publicables, ≈ oráculo FX independiente, cola sin excepción', () => {
  const rnd = lcg(2026); const rates = [36.5, 36.4721, 37.123456, 40.1234, 191.6489]; let n = 0, unpub = 0, thrownN = 0, off = 0; const ex = [];
  for (let i = 0; i < 2000; i++) {
    const bcv = rates[i % 5]; const eur = 39.87; const m = mRate(bcv, eur);
    const conv = (a, c) => c === 'USD' ? a * bcv : c === 'EUR' ? a * eur : a;
    const bals = [[(1 + Math.floor(rnd() * 1e6)) / 100, 'USD'], [(1 + Math.floor(rnd() * 1e7)) / 100, 'VES']];
    const affs = [[(1 + Math.floor(rnd() * 1e6)) / 100, i % 2 ? 'USD' : 'VES', 'COMPROMISO'], [(1 + Math.floor(rnd() * 1e5)) / 100, i % 3 ? 'EUR' : 'VES', 'RESERVA']];
    let s = P.applyBalanceBatch(catalogue(), bals.map(([a, c]) => balB(a, c)), 'b');
    s = P.applyAffectationBatch(s, affs.map(([a, c, nat], j) => alta(`A${j}`, a, { currency_original: c, naturaleza_afectacion: nat })), 'l');
    const p = P.calculateCompanyPosition(s, 'KIRI_A', m); const { thrown } = tryQueue(s, m); n++;
    const oracle = bals.reduce((t, [a, c]) => t + conv(a, c), 0) - affs.reduce((t, [a, c]) => t + conv(a, c), 0);
    if (!p.publicable) unpub++; if (thrown) thrownN++;
    if (p.publicable && Math.abs(p.saldo_disponible_gestion - oracle) > 1e-9 * Math.max(1, Math.abs(oracle))) off++;
    if ((!p.publicable || thrown) && ex.length < 5) ex.push({ bcv, bals, affs, error: p.errors.map(e => e.code), cola: thrown ?? 'ok' });
  }
  rec('S12', 'RQ2-S12-03', { casos: n, posicion_no_publicable: unpub, cola_lanza_excepcion: thrownN, fuera_de_oraculo: off, tasa_no_publicable: +(unpub / n).toFixed(4), ejemplos: ex });
  assert.equal(unpub + thrownN + off, 0, `no publicables ${unpub}/${n}, excepciones en cola ${thrownN}/${n}, fuera de oráculo ${off}: ${JSON.stringify(ex.slice(0, 2))}`);
});
test('RQ2-S12-04 Tasa ausente con saldo USD: error controlado MISSING_EXCHANGE_RATE, cola sin excepción, sin mutación', () => {
  let s = P.applyBalanceBatch(catalogue(), [balB(10, 'USD'), balB(100)], 'b'); s = P.registerAffectation(s, alta('A1', 5), 'a');
  const copy = structuredClone(s); const p = P.calculateCompanyPosition(s, 'KIRI_A', mNoRate); const { q, thrown } = tryQueue(s, mNoRate);
  assert.equal(p.publicable, false); assert.deepEqual(p.errors.map(e => e.code), ['MISSING_EXCHANGE_RATE']);
  assert.equal(thrown, undefined); assert.equal(q.publicable, false); assert.deepEqual(s, copy);
});
test('RQ2-P1-01 money.js: sumOriginals exacto en igual moneda y MIXED_CURRENCIES; convertMoney idéntico al producto con la tasa; consolidateMoney igual moneda exacto', () => {
  assert.equal(M.sumOriginals([M.createMoney(0.1, 'VES'), M.createMoney(0.2, 'VES')]).amount_original, 0.3);
  assert.throws(() => M.sumOriginals([M.createMoney(1, 'VES'), M.createMoney(1, 'USD')]), { code: 'MIXED_CURRENCIES' });
  const m = mRate(36.4721);
  assert.equal(M.convertMoney(M.createMoney(5624.34, 'USD'), 'VES', m).amount, 5624.34 * 36.4721);
  assert.equal(M.consolidateMoney([M.createMoney(0.1, 'VES'), M.createMoney(0.2, 'VES')], 'VES', m).amount, 0.3);
});

// =====================================================================================
// AMPLIACIÓN RE-QA 3 (RQ3-*) — EXC-P2-04/05 conjuntamente.
// Oráculo independiente: un componente (saldo, compromisos o reservas) cuyos registros están todos en VES se suma
// en decimal exacto (centésimas enteras); si interviene otra moneda se reproduce la suma numérica heredada
// (Σ importe × tasa en orden de registro). El disponible y el déficit son exactos solo si todos los componentes
// de la empresa/banco están en VES (aprobación #6084761588); en otro caso, resta numérica heredada.
// =====================================================================================
const toC = x => Math.round(x * 100);
const fromC = c => Number((c / 100).toFixed(2));
function legacyOracle(recs, bcv, eur) {
  const conv = r => r.c === 'USD' ? r.a * bcv : r.c === 'EUR' ? r.a * eur : r.a;
  const comp = list => list.every(r => r.c === 'VES') ? fromC(list.reduce((t, r) => t + toC(r.a), 0)) : list.reduce((t, r) => t + conv(r), 0);
  const view = banco => {
    const b = recs.bal.filter(r => banco === undefined || r.banco === banco);
    const a = recs.aff.filter(r => banco === undefined || r.banco === banco);
    const saldo = comp(b), compromisos = comp(a.filter(r => r.nat === 'COMPROMISO')), reservas = comp(a.filter(r => r.nat === 'RESERVA'));
    const native = b.concat(a).every(r => r.c === 'VES');
    const disponible = native ? fromC(toC(saldo) - toC(compromisos) - toC(reservas)) : saldo - compromisos - reservas;
    const total = native ? fromC(toC(compromisos) + toC(reservas)) : compromisos + reservas;
    return { saldo, compromisos, reservas, disponible, deficit: Math.max(0, native ? (disponible === 0 ? 0 : -disponible) : -disponible), total, native };
  };
  return { empresa: view(), BNC: view('BNC'), BDV: view('BDV') };
}
function heteroCase(rnd, i, rates) {
  const bcv = rates[i % rates.length], eur = [39.87, 41.12345, 40][i % 3];
  const bal = [{ cuenta: 'A-BNC-01', banco: 'BNC', c: 'VES', a: (1 + Math.floor(rnd() * 1e7)) / 100 }, { cuenta: 'A-BDV-01', banco: 'BDV', c: 'VES', a: (1 + Math.floor(rnd() * 1e7)) / 100 }];
  if (i % 4 === 1 || i % 4 === 3) bal.push({ cuenta: 'A-BNC-01', banco: 'BNC', c: 'USD', a: (1 + Math.floor(rnd() * 1e6)) / 100 });
  if (i % 4 === 2 || i % 4 === 3) bal.push({ cuenta: 'A-BNC-01', banco: 'BNC', c: 'EUR', a: (1 + Math.floor(rnd() * 1e6)) / 100 });
  const aff = [];
  for (let j = 0; j < 2 + (i % 4); j++) {
    const c = rnd() < 0.6 ? 'VES' : rnd() < 0.5 ? 'USD' : 'EUR';
    const banco = c === 'VES' ? (rnd() < 0.5 ? 'BDV' : rnd() < 0.5 ? 'BNC' : null) : (rnd() < 0.5 ? 'BNC' : null);
    aff.push({ id: `A${j}`, c, banco, nat: j % 2 ? 'RESERVA' : 'COMPROMISO', a: (1 + Math.floor(rnd() * (c === 'VES' ? 1e7 : 1e5))) / 100 });
  }
  return { bcv, eur, bal, aff };
}
function buildHetero(k) {
  let s = P.applyBalanceBatch(catalogue(), k.bal.map(b => bal(b.cuenta, b.a, 7, b.c)), 'b');
  return P.applyAffectationBatch(s, k.aff.map(a => alta(a.id, a.a, { currency_original: a.c, naturaleza_afectacion: a.nat, ...(a.banco ? { banco_asignado: a.banco } : {}) })), 'l');
}
test('RQ3-S12-01 2 000 posiciones heterogéneas (VES en 2 bancos, USD/EUR, 2–5 afectaciones VES/USD/EUR con banco o sin él, 6 tasas BCV y 3 EUR): empresa, BNC, BDV y cola publicables e idénticos al oráculo', () => {
  const rnd = lcg(31337); const rates = [36.5, 36.4721, 37.123456, 40.1234, 191.6489, 36.53]; let n = 0, bad = 0, nativeBanks = 0, heteroCompanies = 0; const ex = [];
  for (let i = 0; i < 2000; i++) {
    const k = heteroCase(rnd, i, rates); const m = mRate(k.bcv, k.eur); const s = buildHetero(k);
    const o = legacyOracle({ bal: k.bal, aff: k.aff.map(a => ({ ...a, banco: a.banco ?? 'NONE' })) }, k.bcv, k.eur);
    const oE = legacyOracle({ bal: k.bal, aff: k.aff }, k.bcv, k.eur).empresa;
    const p = P.calculateCompanyPosition(s, 'KIRI_A', m); const { q, thrown } = tryQueue(s, m); n++;
    if (!oE.native) heteroCompanies++;
    const diffs = [];
    if (!p.publicable) diffs.push(['empresa', p.errors]);
    else for (const [key, exp] of [['saldo_bancario', oE.saldo], ['compromisos_por_ejecutar', oE.compromisos], ['reservas_bloqueadas', oE.reservas], ['saldo_disponible_gestion', oE.disponible], ['deficit', oE.deficit]]) if (p[key] !== exp) diffs.push([key, p[key], exp]);
    if (thrown) diffs.push(['cola', thrown]); else if (q.total_necesidad_vigente !== oE.total || q.deficit !== oE.deficit) diffs.push(['cola', q.total_necesidad_vigente, oE.total]);
    for (const banco of ['BNC', 'BDV']) {
      const b = P.calculateBankPosition(s, 'KIRI_A', banco, m); const ob = o[banco]; if (ob.native) nativeBanks++;
      if (!b.publicable || b.saldo_bancario !== ob.saldo || b.compromisos_por_ejecutar !== ob.compromisos || b.reservas_bloqueadas !== ob.reservas || b.disponibilidad_localizada_preliminar !== ob.disponible) diffs.push([banco, b.disponibilidad_localizada_preliminar, ob.disponible, b.errors]);
    }
    if (diffs.length) { bad++; if (ex.length < 4) ex.push({ i, k, diffs }); }
  }
  rec('S12', 'RQ3-S12-01', { casos: n, empresas_heterogeneas: heteroCompanies, bancos_nativos_verificados: nativeBanks, defectos: bad, ejemplos: ex });
  assert.equal(bad, 0, JSON.stringify(ex.slice(0, 2)));
});
test('RQ3-S12-02 Banco nativo con FX ajeno: BDV solo VES (0,70 − 0,60 − 0,10 = 0) exacto aunque BNC tenga USD/EUR; empresa heterogénea publicable', () => {
  const m = mRate(36.4721, 41.12345);
  let s = P.applyBalanceBatch(catalogue(), [bal('A-BDV-01', 0.70, 7), bal('A-BNC-01', 5624.34, 7, 'USD'), bal('A-BNC-01', 10.01, 7, 'EUR')], 'b');
  s = P.applyAffectationBatch(s, [alta('V1', 0.60, { banco_asignado: 'BDV' }), alta('V2', 0.10, { banco_asignado: 'BDV', naturaleza_afectacion: 'RESERVA' }), alta('U1', 12.34, { currency_original: 'USD', banco_asignado: 'BNC' })], 'l');
  const bdv = P.calculateBankPosition(s, 'KIRI_A', 'BDV', m); const bnc = P.calculateBankPosition(s, 'KIRI_A', 'BNC', m); const p = P.calculateCompanyPosition(s, 'KIRI_A', m);
  rec('S12', 'RQ3-S12-02', { BDV: bdv.disponibilidad_localizada_preliminar, BNC: bnc.disponibilidad_localizada_preliminar, empresa: p.saldo_disponible_gestion });
  assert.equal(bdv.disponibilidad_localizada_preliminar, 0); assert.equal(bdv.compromisos_por_ejecutar, 0.6); assert.equal(bdv.reservas_bloqueadas, 0.1);
  assert.equal(bnc.publicable, true); assert.equal(p.publicable, true);
  assert.equal(p.saldo_disponible_gestion, (0.7 + 5624.34 * 36.4721 + 10.01 * 41.12345) - (0.6 + 12.34 * 36.4721) - 0.1);
});
test('RQ3-S12-03 buildNeedQueue nunca lanza: empresa inválida, tasa ausente, precisión no representable, vínculo corrupto en memoria, estado nulo y estado monetario inválido ⇒ resultado congelado no publicable con error, sin mutación', () => {
  let s = P.applyBalanceBatch(catalogue(), [balB(10, 'USD'), balB(1e16)], 'b'); s = P.registerAffectation(s, alta('A1', 0.01), 'a');
  const native = P.registerAffectation(P.registerBalance(catalogue(), balB(1e16), 'b'), alta('A1', 0.01), 'a');
  const corrupt = structuredClone(N.createNeed(P.registerAffectation(start(), alta('A1', 20), 'r'), need('N1', 'A1', 'P1_CRITICA', 'R4_FLEXIBLE'), 'n')); corrupt.needs[0].affectation_id = 'NO-EXISTE';
  const cases = [['empresa inválida', start(), 'KIRI_Z', mVES], ['tasa ausente', s, 'KIRI_A', mNoRate], ['precisión nativa no representable', native, 'KIRI_A', mVES],
    ['vínculo corrupto', corrupt, 'KIRI_A', mVES], ['estado nulo', null, 'KIRI_A', mVES], ['estado monetario inválido', start(), 'KIRI_A', { managedDate: 'x' }]];
  const out = {};
  for (const [name, st, emp, m] of cases) {
    const copy = st && structuredClone(st); let q, thrown = null;
    try { q = N.buildNeedQueue(st, emp, m); } catch (e) { thrown = `${e.name}:${e.code}`; }
    out[name] = thrown ?? { publicable: q.publicable, errores: q.errors.map(e => e.code) };
    assert.equal(thrown, null, `${name}: lanza ${thrown}`);
    assert.equal(q.publicable, false, name); assert.ok(q.errors.length > 0, name); assert.equal(q.deficit, null, name); assert.equal(q.saldo_disponible_gestion, null, name);
    assert.ok(Object.isFrozen(q), name); if (st) assert.deepEqual(st, copy, `${name}: estado mutado`);
  }
  rec('S12', 'RQ3-S12-03', { resultados: out });
});
test('RQ3-S12-04 Transición nativo → heterogéneo → nativo: anular la afectación USD restablece el cálculo exacto (0,30 − 0,10 − 0,20 = 0)', () => {
  const m = mRate(36.4721);
  let s = P.registerBalance(catalogue(), balB(0.30), 'b');
  s = P.applyAffectationBatch(s, [alta('A1', 0.10), alta('A2', 0.20, { naturaleza_afectacion: 'RESERVA' })], 'l');
  const p0 = P.calculateCompanyPosition(s, 'KIRI_A', m);
  s = P.registerAffectation(s, alta('U1', 1.23, { currency_original: 'USD', ...tr(9) }), 'u');
  const p1 = P.calculateCompanyPosition(s, 'KIRI_A', m);
  s = P.registerAffectation(s, { affectation_id: 'U1', operacion: 'ANULACION', monto_anulado: 1.23, ...tr(10) }, 'x');
  const p2 = P.calculateCompanyPosition(s, 'KIRI_A', m); const q2 = N.buildNeedQueue(s, 'KIRI_A', m);
  rec('S12', 'RQ3-S12-04', { nativo: [p0.saldo_disponible_gestion, p0.deficit], heterogeneo: [p1.saldo_disponible_gestion, p1.deficit], tras_anular_USD: [p2.saldo_disponible_gestion, p2.deficit, q2.total_necesidad_vigente] });
  assert.equal(p0.deficit, 0); assert.equal(p0.saldo_disponible_gestion, 0);
  assert.equal(p1.publicable, true); relClose(p1.deficit, 1.23 * 36.4721, 'déficit heterogéneo');
  assert.equal(p2.saldo_disponible_gestion, 0); assert.equal(p2.deficit, 0); assert.equal(q2.total_necesidad_vigente, 0.3);
});
test('RQ3-S12-05 Empresa solo USD (sin VES) y vista USD: publicable, valores = oráculo heredado, originales intactos', () => {
  const m = mRate(37.123456);
  let s = P.registerBalance(catalogue(), balB(100.10, 'USD'), 'b'); s = P.applyAffectationBatch(s, [alta('U1', 33.37, { currency_original: 'USD' }), alta('U2', 66.73, { currency_original: 'USD', naturaleza_afectacion: 'RESERVA' })], 'l');
  const p = P.calculateCompanyPosition(s, 'KIRI_A', m); const u = P.displayPosition(p, setDisplayCurrency(m, 'USD'));
  const o = 100.10 * 37.123456 - 33.37 * 37.123456 - 66.73 * 37.123456;
  rec('S12', 'RQ3-S12-05', { disponible_VES: p.saldo_disponible_gestion, oraculo: o, disponible_USD: u.saldo_disponible_gestion, deficit: p.deficit });
  assert.equal(p.publicable, true); assert.equal(p.saldo_disponible_gestion, o);
  assert.deepEqual(s.affectations.map(a => [a.amount_original, a.currency_original]), [[33.37, 'USD'], [66.73, 'USD']]);
});
test('RQ3-S08-01 Persistencia heterogénea: guardar/recargar conserva posición idéntica e idempotencia', () => {
  const k = heteroCase(lcg(3), 3, [36.4721]); const m = mRate(k.bcv, k.eur); const s = buildHetero(k);
  const st = storage(); N.saveNeedState(st, s); const back = N.loadNeedState(st);
  assert.deepEqual(P.calculateCompanyPosition(back, 'KIRI_A', m), P.calculateCompanyPosition(s, 'KIRI_A', m));
  assert.equal(P.applyAffectationBatch(back, k.aff.map(a => alta(a.id, a.a, { currency_original: a.c, naturaleza_afectacion: a.nat, ...(a.banco ? { banco_asignado: a.banco } : {}) })), 'l'), back);
});
test('OBS-RQ-03 Ruta heterogénea aprobada conserva residuos binarios: déficit > 0 cuando el valor decimal exacto es 0 (documental)', () => {
  const rnd = lcg(77); let zeroFx = 0, zeroFxPhantom = 0, prodCases = 0, prodPhantom = 0; const ex = [];
  // (i) componente FX nulo: cuenta USD con saldo 0,00 junto a saldos VES en dos bancos que igualan los compromisos VES.
  for (let i = 0; i < 1000; i++) {
    const a = 1 + Math.floor(rnd() * 1e6), b = 1 + Math.floor(rnd() * 1e6);
    let s = P.applyBalanceBatch(catalogue(), [bal('A-BNC-01', a / 100, 7), bal('A-BDV-01', b / 100, 7), bal('A-BNC-01', 0, 7, 'USD')], 'b');
    s = P.registerAffectation(s, alta('A1', fromC(a + b)), 'a'); zeroFx++;
    const p = pos(s); if (p.deficit > 0) { zeroFxPhantom++; if (ex.length < 3) ex.push({ VES: [a / 100, b / 100], USD: 0, compromiso: fromC(a + b), deficit: p.deficit }); }
  }
  // (ii) saldo USD u × BCV r compensado por un compromiso VES igual al producto decimal exacto.
  for (let i = 0; i < 1000; i++) {
    const u = 1 + Math.floor(rnd() * 1e6), r = 364721 + Math.floor(rnd() * 1000); // u centésimas, r diezmilésimas
    const exact = Number((BigInt(u) * BigInt(r)).toString().replace(/(\d{6})$/, '.$1'));
    const m = mRate(r / 10000);
    let s = P.registerBalance(catalogue(), balB(u / 100, 'USD'), 'b'); s = P.registerAffectation(s, alta('A1', exact), 'a'); prodCases++;
    const p = P.calculateCompanyPosition(s, 'KIRI_A', m); if (p.deficit > 0) { prodPhantom++; if (ex.length < 6) ex.push({ USD: u / 100, BCV: r / 10000, compromiso_VES_exacto: exact, deficit: p.deficit }); }
  }
  rec('X', 'OBS-RQ-03', { fx_nulo: { casos: zeroFx, deficit_fantasma: zeroFxPhantom }, producto_exacto: { casos: prodCases, deficit_fantasma: prodPhantom }, ejemplos: ex,
    nota: 'Comportamiento conforme a la aprobación #6084761588 (ruta heterogénea heredada); no hay política de precisión FX aprobada. Decisión funcional requerida si se pretende eliminar.' });
  assert.ok(zeroFxPhantom >= 0 && prodPhantom >= 0); // documental
});
test('OBS-RQ-04 Empresa de moneda única distinta de VES (solo USD o solo EUR) exactamente equilibrada en su moneda: déficit VES > 0 por conversión previa a la suma (documental)', () => {
  const rnd = lcg(404); const rates = [36.5, 36.4721, 37.123456, 40.1234, 191.6489]; const out = { USD: [0, 0], EUR: [0, 0] }; const ex = [];
  for (let i = 0; i < 2000; i++) {
    const cur = i % 2 ? 'EUR' : 'USD'; const m = mRate(rates[i % 5], [39.87, 41.12345][i % 2]);
    const items = [1 + Math.floor(rnd() * 1e6), 1 + Math.floor(rnd() * 1e6), 1 + Math.floor(rnd() * 1e6)]; const sum = items.reduce((a, b) => a + b, 0);
    let s = P.registerBalance(catalogue(), balB(fromC(sum), cur), 'b');
    s = P.applyAffectationBatch(s, items.map((c, j) => alta(`A${j}`, c / 100, { currency_original: cur, naturaleza_afectacion: j ? 'RESERVA' : 'COMPROMISO' })), 'l');
    const p = P.calculateCompanyPosition(s, 'KIRI_A', m); out[cur][0]++;
    if (p.deficit > 0) { out[cur][1]++; if (ex.length < 4) ex.push({ moneda: cur, saldo: fromC(sum), afectaciones: items.map(c => c / 100), deficit_VES: p.deficit }); }
  }
  rec('X', 'OBS-RQ-04', { USD: { casos: out.USD[0], deficit_fantasma: out.USD[1] }, EUR: { casos: out.EUR[0], deficit_fantasma: out.EUR[1] }, ejemplos: ex,
    nota: 'La implementación limita la ruta exacta a componentes VES (moneda destino), conforme al texto de la opción (a) del dictamen #6084668117; la aprobación #6084761588 la parafrasea como "misma moneda". Interpretación a decidir por el Líder Funcional.' });
  assert.ok(out.USD[1] >= 0); // documental
});
