// Muestreo original de EXC-P2-01 (5 008 casos, reutilizado sin cambios del arnés 152a834) contra el motor de KIRI_P2_ROOT. Montos con 2 decimales.
import { join, resolve } from 'node:path'; import { pathToFileURL } from 'node:url';
const SRC = join(resolve(process.env.KIRI_P2_ROOT ?? '.'), 'src');
const P = await import(pathToFileURL(join(SRC, 'position.js')).href);
const tr = h => ({ origen: 'AUD', fecha_hora_evento: `2026-10-09T${h}:00:00Z` });
const base = P.createPositionState({ empresas: ['E'], bancos: ['B'], cuentas: [{ cuenta: 'C', empresa: 'E', banco: 'B', monedas: ['VES'] }] });
let total = 0, rejected = 0, ghost = 0; const examples = [];
for (let cents = 101; cents <= 1000000; cents += 997) for (const firstCents of [10, 25, 110, 1001, 5050]) {
  if (firstCents >= cents) continue; total++;
  const T = cents / 100, f = firstCents / 100, rest = (cents - firstCents) / 100;
  let s = P.registerAffectation(base, { affectation_id: 'A', empresa: 'E', tipo_partida: 'P', naturaleza_afectacion: 'COMPROMISO', amount_original: T, currency_original: 'VES', operacion: 'ALTA', ...tr('08') }, 'a');
  s = P.registerAffectation(s, { affectation_id: 'A', operacion: 'ANULACION', monto_anulado: f, ...tr('09') }, 'c1');
  try { const r = P.registerAffectation(s, { affectation_id: 'A', operacion: 'ANULACION', monto_anulado: rest, ...tr('10') }, 'c2');
    if (r.affectations[0].estado !== 'ANULADA') { ghost++; if (examples.length < 6) examples.push({ T, f, rest, tipo: 'RESIDUO_ACTIVO', residuo: r.affectations[0].monto_vigente }); } }
  catch (e) { rejected++; if (examples.length < 6) examples.push({ T, f, rest, tipo: e.code }); }
}
console.log(JSON.stringify({ casos: total, rechazados: rejected, residuo_activo: ghost, tasa_defecto: +((rejected + ghost) / total).toFixed(4), ejemplos: examples }, null, 2));
