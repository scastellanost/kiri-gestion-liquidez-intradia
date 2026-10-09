// OBS-RQ-02 — Compatibilidad de estado persistido versión 1 entre el commit auditado previo y el candidato.
//   node P2_CLAUDE_REQA_COMPAT_PROBE.mjs <checkout 851bb58> <checkout 9146f4f>
// Genera, con el motor de 851bb58, un estado válido según sus propias operaciones (afectación ANULADA con
// need vinculada) y lo carga con el motor candidato. No modifica ningún checkout.
import { join, resolve } from 'node:path'; import { pathToFileURL } from 'node:url';
const mod = (root, f) => import(pathToFileURL(join(resolve(root), 'src', f)).href);
const [baseRoot, candRoot] = process.argv.slice(2);
const at = h => `2026-10-09T${String(h).padStart(2, '0')}:00:00Z`; const tr = h => ({ origen: 'AUD', fecha_hora_evento: at(h) });
async function produce(root) {
  const P = await mod(root, 'position.js'), N = await mod(root, 'needs.js');
  const cat = P.createPositionState({ empresas: ['E'], bancos: ['B'], cuentas: [{ cuenta: 'C', empresa: 'E', banco: 'B', monedas: ['VES'] }] });
  const out = {};
  for (const [name, op] of [['anulada', { operacion: 'ANULACION', monto_anulado: 20 }], ['reflejado_total', { operacion: 'AJUSTE', monto_reflejado_confirmado: 20 }]]) {
    let s = P.registerAffectation(cat, { affectation_id: 'A', empresa: 'E', tipo_partida: 'P', naturaleza_afectacion: 'COMPROMISO', amount_original: 20, currency_original: 'VES', operacion: 'ALTA', ...tr(8) }, 'a');
    s = N.createNeed(s, { need_id: 'N1', affectation_id: 'A', prioridad_economica: 'P1_CRITICA', rigidez_temporal: 'R4_FLEXIBLE', ...tr(9) }, 'n');
    s = P.registerAffectation(s, { affectation_id: 'A', ...op, ...tr(10) }, 'x');
    const m = new Map(); N.saveNeedState({ setItem: (k, v) => m.set(k, v) }, s); out[name] = { raw: [...m.values()][0], need: s.needs[0].estado };
  }
  return out;
}
const base = await produce(baseRoot); const Nc = await mod(candRoot, 'needs.js');
const result = {};
for (const [name, { raw, need }] of Object.entries(base)) {
  let load; try { Nc.loadNeedState({ getItem: () => raw }); load = 'OK'; } catch (e) { load = e.code; }
  result[name] = { need_guardada_por_851bb58: need, carga_en_9146f4f: load };
}
console.log(JSON.stringify(result, null, 2));
