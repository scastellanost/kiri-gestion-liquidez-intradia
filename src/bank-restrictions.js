import { createMoney, convertMoney } from './money.js';

export class BankRestrictionError extends Error {
  constructor(code) { super(code); this.name = 'BankRestrictionError'; this.code = code; }
}
const check = (condition, code) => { if (!condition) throw new BankRestrictionError(code); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const fingerprint = value => JSON.stringify(canonical(value));
function date(value) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'INVALID_DATE');
  const parsed = new Date(`${value}T00:00:00Z`);
  check(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, 'INVALID_DATE');
}
function timestamp(value) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)), 'INVALID_TIMESTAMP'); date(value.slice(0, 10));
}
function scope(state, row) {
  check(state.catalogue.bancos.includes(row.banco), 'INVALID_BANK');
  if (row.empresa !== undefined) check(state.catalogue.empresas.includes(row.empresa), 'INVALID_COMPANY');
  if (row.cuenta !== undefined) {
    const a = state.catalogue.cuentas.find(a => a.cuenta === row.cuenta);
    check(a && a.banco === row.banco && (row.empresa === undefined || row.empresa === a.empresa), 'INVALID_ACCOUNT_OWNER');
  }
  if (row.moneda !== undefined) createMoney(0, row.moneda);
  const normalized = { ...row };
  if (row.cuenta !== undefined && row.empresa === undefined) normalized.empresa = state.catalogue.cuentas.find(a => a.cuenta === row.cuenta).empresa;
  return Object.fromEntries(['banco', 'empresa', 'cuenta', 'moneda'].filter(key => normalized[key] !== undefined).map(key => [key, normalized[key]]));
}
function validateRules(state, rules) {
  check(rules && typeof rules === 'object' && !Array.isArray(rules), 'INVALID_RESTRICTION');
  const numeric = ['max_por_operacion', 'max_diario', 'minutos_acreditacion'];
  const bools = ['permite_intrabanco', 'permite_interbanco', 'requiere_aprobacion_adicional', 'estado_activo'];
  const arrays = ['monedas_permitidas', 'empresas_permitidas', 'cuentas_permitidas', 'dias_habiles_semana', 'feriados'];
  const allowed = [...numeric, ...bools, ...arrays, 'max_operaciones_dia', 'hora_inicio', 'cutoff', 'settlement'];
  for (const key of Object.keys(rules)) check(allowed.includes(key), 'UNKNOWN_RESTRICTION_FIELD');
  for (const key of numeric) if (rules[key] !== undefined) check(finite(rules[key]) && rules[key] >= 0, 'INVALID_RESTRICTION_AMOUNT');
  if (rules.max_operaciones_dia !== undefined) check(Number.isSafeInteger(rules.max_operaciones_dia) && rules.max_operaciones_dia >= 0, 'INVALID_OPERATION_COUNT');
  for (const key of bools) if (rules[key] !== undefined) check(typeof rules[key] === 'boolean', 'INVALID_RESTRICTION_BOOLEAN');
  for (const key of ['hora_inicio', 'cutoff']) if (rules[key] !== undefined) check(typeof rules[key] === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(rules[key]), 'INVALID_BANK_TIME');
  if (rules.settlement !== undefined) check(['T0', 'T1', 'BOTH'].includes(rules.settlement), 'INVALID_SETTLEMENT');
  for (const key of arrays) if (rules[key] !== undefined) check(Array.isArray(rules[key]) && new Set(rules[key]).size === rules[key].length, 'INVALID_RESTRICTION_LIST');
  for (const currency of rules.monedas_permitidas ?? []) createMoney(0, currency);
  for (const company of rules.empresas_permitidas ?? []) check(state.catalogue.empresas.includes(company), 'INVALID_COMPANY');
  for (const account of rules.cuentas_permitidas ?? []) check(state.catalogue.cuentas.some(a => a.cuenta === account), 'INVALID_ACCOUNT');
  for (const day of rules.dias_habiles_semana ?? []) check(Number.isInteger(day) && day >= 1 && day <= 7, 'INVALID_WEEKDAY');
  for (const holiday of rules.feriados ?? []) { try { date(holiday); } catch { throw new BankRestrictionError('INVALID_HOLIDAY'); } }
}
function change(state, row, request_id, operation, apply) {
  check(text(request_id), 'INVALID_IDEMPOTENCY_KEY');
  const payload = fingerprint({ kind: operation, rows: [row] });
  const receipt = state.receipts.find(r => r.scope === 'request_id' && r.id === request_id);
  if (receipt) { check(receipt.payload === payload, 'IDEMPOTENCY_CONFLICT'); return state; }
  check(text(row.origen), 'INVALID_ORIGIN'); timestamp(row.fecha_hora_evento);
  check(row.usuario === undefined || text(row.usuario), 'INVALID_USER');
  const next = structuredClone(state);
  const { before, after, selectors } = apply(next);
  next.events.push({ kind: 'BANK_RESTRICTION', operacion: operation, ...selectors,
    antes: before, despues: structuredClone(after), origen: row.origen,
    ...(row.usuario === undefined ? {} : { usuario: row.usuario }), fecha_hora_evento: row.fecha_hora_evento, request_id });
  next.receipts.push({ scope: 'request_id', id: request_id, payload }); return freeze(next);
}
export function setBankRestriction(state, row, request_id) {
  return change(state, row, request_id, 'SET_BANK_RESTRICTION', next => {
    const selectors = scope(next, row); validateRules(next, row.reglas);
    next.bankRestrictions ??= [];
    const index = next.bankRestrictions.findIndex(r => fingerprint(r.selectors) === fingerprint(selectors));
    const before = index < 0 ? null : structuredClone(next.bankRestrictions[index]);
    const after = { selectors, reglas: structuredClone(row.reglas) };
    if (index < 0) next.bankRestrictions.push(after); else next.bankRestrictions[index] = after;
    return { before, after, selectors };
  });
}
export function clearBankRestriction(state, row, request_id) {
  return change(state, row, request_id, 'CLEAR_BANK_RESTRICTION', next => {
    const selectors = scope(next, row); next.bankRestrictions ??= [];
    const index = next.bankRestrictions.findIndex(r => fingerprint(r.selectors) === fingerprint(selectors));
    const before = index < 0 ? null : next.bankRestrictions.splice(index, 1)[0];
    return { before, after: null, selectors };
  });
}
function usageRecord(state, row) {
  const selectors = scope(state, row);
  check(text(row.empresa) && text(row.cuenta) && text(row.moneda), 'INCOMPLETE_USAGE_SCOPE'); date(row.fecha);
  return { ...selectors, fecha: row.fecha };
}
export function setBankUsage(state, row, request_id) {
  return change(state, row, request_id, 'SET_BANK_USAGE', next => {
    const selectors = usageRecord(next, row);
    check(finite(row.monto_usado_dia) && row.monto_usado_dia >= 0, 'INVALID_USAGE_AMOUNT');
    check(Number.isSafeInteger(row.operaciones_usadas_dia) && row.operaciones_usadas_dia >= 0, 'INVALID_OPERATION_COUNT');
    next.bankUsage ??= [];
    const index = next.bankUsage.findIndex(r => ['banco', 'empresa', 'cuenta', 'moneda', 'fecha'].every(key => r[key] === selectors[key]));
    const before = index < 0 ? null : structuredClone(next.bankUsage[index]);
    const after = { ...selectors, monto_usado_dia: row.monto_usado_dia, operaciones_usadas_dia: row.operaciones_usadas_dia };
    if (index < 0) next.bankUsage.push(after); else next.bankUsage[index] = after;
    return { before, after, selectors };
  });
}
export function reserveBankCapacity(state, row, request_id) {
  return change(state, row, request_id, 'RESERVE_BANK_CAPACITY', next => {
    const selectors = usageRecord(next, row);
    check(text(row.reservation_id), 'INVALID_CAPACITY_RESERVATION_ID');
    check(finite(row.monto) && row.monto > 0, 'INVALID_USAGE_AMOUNT');
    check(Number.isSafeInteger(row.operaciones) && row.operaciones > 0, 'INVALID_OPERATION_COUNT');
    next.bankCapacityReservations ??= [];
    check(!next.bankCapacityReservations.some(r => r.reservation_id === row.reservation_id), 'DUPLICATE_CAPACITY_RESERVATION');
    const after = { ...selectors, reservation_id: row.reservation_id, monto: row.monto, operaciones: row.operaciones, estado: 'ACTIVA' };
    next.bankCapacityReservations.push(after); return { before: null, after, selectors };
  });
}
export function releaseBankCapacity(state, row, request_id) {
  return change(state, row, request_id, 'RELEASE_BANK_CAPACITY', next => {
    const record = (next.bankCapacityReservations ?? []).find(r => r.reservation_id === row.reservation_id);
    check(record, 'UNKNOWN_CAPACITY_RESERVATION'); check(record.estado === 'ACTIVA', 'CAPACITY_ALREADY_RELEASED');
    const before = structuredClone(record); record.estado = 'LIBERADA';
    return { before, after: record, selectors: scope(next, record) };
  });
}

function resolveRules(state, route) {
  const matches = (state.bankRestrictions ?? []).filter(r => r.reglas.estado_activo !== false
    && Object.entries(r.selectors).every(([key, value]) => route[key] === value));
  const rank = r => (r.selectors.cuenta ? 30 : r.selectors.empresa ? 20 : 10) + (r.selectors.moneda ? 1 : 0);
  matches.sort((a, b) => rank(a) - rank(b));
  const effective = {};
  for (const r of matches) for (const [key, value] of Object.entries(r.reglas)) if (key !== 'estado_activo') effective[key] = { value: structuredClone(value), selectors: structuredClone(r.selectors) };
  return effective;
}
export function getBankUsage(state, query) {
  scope(state, query); date(query.fecha); createMoney(0, query.moneda);
  const matches = row => row.banco === query.banco && row.moneda === query.moneda && row.fecha === query.fecha
    && (query.empresa === undefined || row.empresa === query.empresa) && (query.cuenta === undefined || row.cuenta === query.cuenta);
  const used = (state.bankUsage ?? []).filter(matches);
  const reserved = (state.bankCapacityReservations ?? []).filter(r => r.estado === 'ACTIVA' && matches(r));
  return freeze({ monto_usado_dia: used.reduce((sum, r) => sum + r.monto_usado_dia, 0),
    operaciones_usadas_dia: used.reduce((sum, r) => sum + r.operaciones_usadas_dia, 0),
    monto_reservado_por_aprobadas: reserved.reduce((sum, r) => sum + r.monto, 0),
    operaciones_reservadas: reserved.reduce((sum, r) => sum + r.operaciones, 0) });
}
function localParts(epoch, zone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(epoch));
  const p = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
}
function localInstant(day, time, zone, dimension) {
  const target = Date.parse(`${day}T${time}Z`);
  const offsetAt = epoch => {
    const local = localParts(epoch, zone);
    return Date.parse(`${local.day}T${local.time}Z`) - Math.floor(epoch / 1000) * 1000;
  };
  // Discover the zone's actual offsets around this date, including non-hour changes.
  const samples = [];
  for (let hour = -48; hour <= 48; hour++) {
    const epoch = target + hour * 3600000;
    samples.push({ epoch, offset: offsetAt(epoch) });
  }
  const candidates = [...new Set(samples.map(s => s.offset))].map(offset => target - offset)
    .filter(epoch => epoch + offsetAt(epoch) === target).sort((a, b) => a - b);
  const adjusted = (epoch, rule_id, impact, action) => ({ epoch, adjustment: {
    rule_id, dimension, configured: { fecha: day, hora: time, zona_horaria: zone },
    observed: new Date(epoch).toISOString(), impact, action
  } });
  if (candidates.length > 0) return candidates.length === 1 ? { epoch: candidates[0] }
    : adjusted(candidates[0], 'DST_AMBIGUOUS_LOCAL_TIME_FIRST_OCCURRENCE', 'INFO');
  for (let i = 1; i < samples.length; i++) {
    const before = samples[i - 1]; const after = samples[i];
    if (after.offset <= before.offset) continue;
    let low = before.epoch; let high = after.epoch;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (offsetAt(middle) === before.offset) low = middle; else high = middle;
    }
    if (target >= high + before.offset && target < high + after.offset) {
      return adjusted(high, 'DST_NONEXISTENT_LOCAL_TIME_SHIFTED', 'RESTRICCION', 'USAR_PRIMER_INSTANTE_VALIDO');
    }
  }
  throw new BankRestrictionError('LOCAL_TIME_RESOLUTION_FAILED');
}
const shiftDay = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const overnight = rules => rules.hora_inicio && rules.cutoff && rules.hora_inicio.value > rules.cutoff.value;
function windowForDay(day, rules, zone) {
  const opening = rules.hora_inicio ? localInstant(day, `${rules.hora_inicio.value}:00`, zone, 'hora_inicio') : { epoch: -Infinity };
  const closing = rules.cutoff ? localInstant(overnight(rules) ? shiftDay(day, 1) : day, `${rules.cutoff.value}:00`, zone, 'cutoff') : { epoch: Infinity };
  return { day, opening: opening.epoch, closing: closing.epoch,
    adjustments: [opening.adjustment, closing.adjustment].filter(Boolean) };
}
function operatingWindow(epoch, rules, zone) {
  const day = localParts(epoch, zone).day;
  const current = windowForDay(day, rules, zone);
  if (overnight(rules) && epoch < current.opening) {
    const previous = windowForDay(shiftDay(day, -1), rules, zone);
    if (epoch >= previous.opening && epoch <= previous.closing) return previous;
  }
  return current;
}
function businessDay(day, rules) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
  return (!rules.dias_habiles_semana || rules.dias_habiles_semana.value.includes(weekday))
    && !(rules.feriados?.value ?? []).includes(day);
}
function nextBusinessDay(day, rules) {
  check(!rules.dias_habiles_semana || rules.dias_habiles_semana.value.length > 0, 'NO_BUSINESS_DAY_AVAILABLE');
  const limit = (rules.feriados?.value.length ?? 0) * 7 + 14;
  let epoch = Date.parse(`${day}T00:00:00Z`);
  for (let i = 0; i < limit; i++) { epoch += 86400000; const candidate = new Date(epoch).toISOString().slice(0, 10); if (businessDay(candidate, rules)) return candidate; }
  throw new BankRestrictionError('NO_BUSINESS_DAY_AVAILABLE');
}
// Shared calendar for obligations whose value date belongs to the negotiating bank.
export function getBankValueDate(state, selectors, negotiatedAt, zone) {
  timestamp(negotiatedAt); check(text(zone), 'TIME_ZONE_REQUIRED');
  try { localParts(Date.parse(negotiatedAt), zone); } catch { throw new BankRestrictionError('INVALID_TIME_ZONE'); }
  const rules = resolveRules(state, scope(state, selectors));
  const window = operatingWindow(Date.parse(negotiatedAt), rules, zone);
  return freeze({ fecha_valor: nextBusinessDay(window.day, rules), jornada_negociacion: window.day,
    settlement_permitido: !rules.settlement || ['T1', 'BOTH'].includes(rules.settlement.value),
    reglas_efectivas: rules, ajustes_temporales: window.adjustments });
}
function validateContext(context) {
  timestamp(context.fecha_hora_evaluacion); check(text(context.zona_horaria), 'TIME_ZONE_REQUIRED');
  try { localParts(Date.parse(context.fecha_hora_evaluacion), context.zona_horaria); } catch { throw new BankRestrictionError('INVALID_TIME_ZONE'); }
  check(['INTRABANCO', 'INTERBANCO'].includes(context.tipo_ruta), 'INVALID_ROUTE_TYPE');
  check(['T0', 'T1'].includes(context.settlement), 'INVALID_SETTLEMENT');
  if (context.fecha_hora_objetivo !== undefined && context.fecha_hora_objetivo !== null) timestamp(context.fecha_hora_objetivo);
}
const outcome = explanations => explanations.some(r => r.impacto === 'BLOQUEO') ? 'BLOQUEADA'
  : explanations.some(r => r.impacto === 'RESTRICCION') ? 'VIABLE_CON_RESTRICCION' : 'VIABLE';
function evaluate(state, assignment, context, monetaryState, proposed) {
  validateContext(context);
  const route = scope(state, { banco: assignment.banco, cuenta: assignment.cuenta, empresa: context.empresa,
    moneda: context.moneda_operacion ?? assignment.moneda });
  check(text(context.empresa) && text(route.cuenta) && text(route.moneda), 'INCOMPLETE_ROUTE');
  check(finite(assignment.monto_asignado) && assignment.monto_asignado > 0, 'INVALID_ROUTE_AMOUNT');
  createMoney(assignment.monto_asignado, assignment.moneda);
  const monto = route.moneda === assignment.moneda ? assignment.monto_asignado
    : convertMoney(createMoney(assignment.monto_asignado, assignment.moneda), route.moneda, monetaryState).amount;
  const rules = resolveRules(state, route); const explanations = [];
  const add = (id, dimension, configured, observed, impact, action) => explanations.push({ rule_id: id, dimension,
    valor_configurado: configured, valor_observado: observed, resultado: impact === 'BLOQUEO' ? 'BLOQUEADA' : impact === 'RESTRICCION' ? 'VIABLE_CON_RESTRICCION' : 'VIABLE',
    impacto: impact, ...(action ? { accion_requerida: action } : {}) });
  const epoch = Date.parse(context.fecha_hora_evaluacion); const local = localParts(epoch, context.zona_horaria);
  const window = operatingWindow(epoch, rules, context.zona_horaria);
  const explainAdjustment = adjustment => {
    if (adjustment) add(adjustment.rule_id, adjustment.dimension, adjustment.configured,
      adjustment.observed, adjustment.impact, adjustment.action);
  };
  window.adjustments.forEach(explainAdjustment);
  let ops = 1; let split = [{ monto, operaciones: 1 }];
  if (rules.max_por_operacion) {
    const max = rules.max_por_operacion.value;
    if (max === 0) { split = []; add('MAX_PER_OPERATION', 'max_por_operacion', max, monto, 'BLOQUEO'); }
    else if (monto > max) {
      ops = Math.ceil(monto / max); check(Number.isSafeInteger(ops), 'INVALID_OPERATION_COUNT');
      const last = monto - max * (ops - 1);
      // Compact tranches avoid allocating millions of identical array entries.
      split = [{ monto: max, operaciones: ops - 1 }, { monto: last, operaciones: 1 }];
      add('MAX_PER_OPERATION', 'max_por_operacion', max, monto, 'RESTRICCION', 'DIVIDIR_OPERACION');
    } else add('MAX_PER_OPERATION', 'max_por_operacion', max, monto, 'INFO');
  }
  for (const [key, usedKey, reservedKey, proposedKey, addition] of [
    ['max_diario', 'monto_usado_dia', 'monto_reservado_por_aprobadas', 'monto', monto],
    ['max_operaciones_dia', 'operaciones_usadas_dia', 'operaciones_reservadas', 'operaciones', ops]
  ]) if (rules[key]) {
    const query = { ...rules[key].selectors, moneda: route.moneda, fecha: window.day };
    const usage = getBankUsage(state, query);
    const pending = proposed.filter(r => r.banco === query.banco && r.moneda === query.moneda && r.fecha === query.fecha
      && (query.empresa === undefined || r.empresa === query.empresa) && (query.cuenta === undefined || r.cuenta === query.cuenta))
      .reduce((sum, r) => sum + r[proposedKey], 0);
    const total = usage[usedKey] + usage[reservedKey] + pending + addition;
    add(key === 'max_diario' ? 'DAILY_AMOUNT_LIMIT' : 'DAILY_OPERATION_LIMIT', key, rules[key].value,
      { usado: usage[usedKey], reservado: usage[reservedKey], propuesto_previo: pending, propuesto: addition, total },
      total > rules[key].value ? 'BLOQUEO' : 'INFO');
  }
  const milliseconds = new Date(epoch).getUTCMilliseconds();
  const time = `${local.time}.${String(milliseconds).padStart(3, '0')}`;
  if (epoch < window.opening) add(overnight(rules) ? 'INTERVALO_ENTRE_VENTANAS' : 'BEFORE_OPENING',
    'hora_inicio', rules.hora_inicio.value, time, 'RESTRICCION', 'ESPERAR_APERTURA');
  const typeKey = context.tipo_ruta === 'INTRABANCO' ? 'permite_intrabanco' : 'permite_interbanco';
  if (rules[typeKey]) add('ROUTE_TYPE', typeKey, rules[typeKey].value, context.tipo_ruta, rules[typeKey].value ? 'INFO' : 'BLOQUEO');
  if (rules.settlement) add('SETTLEMENT', 'settlement', rules.settlement.value, context.settlement,
    rules.settlement.value === 'BOTH' || rules.settlement.value === context.settlement ? 'INFO' : 'BLOQUEO');
  for (const [key, observed] of [['monedas_permitidas', route.moneda], ['empresas_permitidas', route.empresa], ['cuentas_permitidas', route.cuenta]]) {
    if (rules[key]) add('ALLOWED_' + key.toUpperCase(), key, rules[key].value, observed, rules[key].value.includes(observed) ? 'INFO' : 'BLOQUEO');
  }
  if (rules.requiere_aprobacion_adicional?.value) add('ADDITIONAL_APPROVAL', 'requiere_aprobacion_adicional', true, false, 'RESTRICCION', 'APROBACION_ADICIONAL');
  if (!businessDay(window.day, rules)) add('NON_BUSINESS_DAY', 'calendario', {
    dias_habiles_semana: rules.dias_habiles_semana?.value ?? null, feriados: rules.feriados?.value ?? []
  }, window.day, context.settlement === 'T0' ? 'BLOQUEO' : 'RESTRICCION', context.settlement === 'T1' ? 'ESPERAR_SIGUIENTE_HABIL' : undefined);
  let settlementTime = Math.max(epoch, window.opening); let eta = null;
  let settlementWindow = window; let shiftedSettlement = false;
  if (context.settlement === 'T1') {
    try {
      const next = nextBusinessDay(window.day, rules);
      const continuation = overnight(rules) && local.day !== window.day;
      const resolved = localInstant(continuation ? shiftDay(next, 1) : next, time, context.zona_horaria, 'settlement');
      explainAdjustment(resolved.adjustment);
      shiftedSettlement = resolved.adjustment?.rule_id === 'DST_NONEXISTENT_LOCAL_TIME_SHIFTED';
      settlementWindow = windowForDay(next, rules, context.zona_horaria);
      settlementWindow.adjustments.forEach(explainAdjustment);
      settlementTime = Math.max(resolved.epoch, settlementWindow.opening);
      add('T1_NEXT_BUSINESS_DAY', 'settlement', 'T1', next, 'RESTRICCION', 'ESPERAR_LIQUIDACION_T1');
    } catch (error) { add(error.code, 'settlement', 'T1', local.day, 'BLOQUEO'); settlementTime = null; }
  }
  if (settlementTime !== null && settlementTime > settlementWindow.closing && (context.settlement === 'T0' || shiftedSettlement))
    add('AFTER_CUTOFF', 'cutoff', rules.cutoff.value, new Date(settlementTime).toISOString(), 'BLOQUEO');
  if (rules.minutos_acreditacion && settlementTime !== null) {
    const etaEpoch = settlementTime + rules.minutos_acreditacion.value * 60000;
    check(Number.isFinite(etaEpoch) && Number.isFinite(new Date(etaEpoch).getTime()), 'INVALID_ETA');
    eta = new Date(etaEpoch).toISOString();
    add('ACCREDITATION_DEADLINE', 'minutos_acreditacion', rules.minutos_acreditacion.value,
      { eta, fecha_hora_objetivo: context.fecha_hora_objetivo ?? null }, context.fecha_hora_objetivo && etaEpoch > Date.parse(context.fecha_hora_objetivo) ? 'BLOQUEO' : 'INFO');
  } else if (!rules.minutos_acreditacion && context.fecha_hora_objetivo) {
    add('ACCREDITATION_TIME_REQUIRED', 'minutos_acreditacion', null, context.fecha_hora_objetivo, 'BLOQUEO');
  }
  const result = { ...route, monto_propuesto: monto, fecha: window.day, fecha_hora_evaluacion: context.fecha_hora_evaluacion,
    zona_horaria: context.zona_horaria, tipo_ruta: context.tipo_ruta, settlement: context.settlement,
    resultado: outcome(explanations), operaciones_requeridas: ops, tramos: split, eta,
    reglas_efectivas: structuredClone(rules), explicaciones: explanations,
    alertas: explanations.map(r => ({ ...r, severidad: r.impacto })),
    acciones_requeridas: [...new Set(explanations.flatMap(r => r.accion_requerida ? [r.accion_requerida] : []))] };
  proposed.push({ ...route, fecha: window.day, monto, operaciones: ops });
  return result;
}
export function evaluateAssignmentRoute(state, assignment, context, monetaryState) {
  return freeze(evaluate(state, assignment, context, monetaryState, []));
}
function evaluateAffectation(state, posture, context, monetaryState, proposed) {
  validateContext(context);
  const linked = (state.needs ?? []).find(n => n.affectation_id === posture.affectation_id && n.estado === 'ACTIVA');
  const assignments = posture.asignaciones.map(assignment => {
    const perAccount = context.por_cuenta && Object.hasOwn(context.por_cuenta, assignment.cuenta) ? context.por_cuenta[assignment.cuenta] : {};
    return evaluate(state, assignment, { ...context, empresa: posture.empresa,
      fecha_hora_objetivo: linked?.fecha_hora_objetivo ?? context.fecha_hora_objetivo, ...perAccount }, monetaryState, proposed);
  });
  const explanations = assignments.flatMap(a => a.explicaciones);
  if (posture.publicable === false || posture.monto_no_localizado === null || posture.monto_no_localizado > 0) explanations.push({
    rule_id: 'BLOQUEADA_POR_LOCALIZACION_INCOMPLETA', dimension: 'localizacion', valor_configurado: 0,
    valor_observado: posture.monto_no_localizado, resultado: 'BLOQUEADA', impacto: 'BLOQUEO'
  });
  return { affectation_id: posture.affectation_id, empresa: posture.empresa, resultado: outcome(explanations),
    asignaciones: assignments, explicaciones: explanations, alertas: explanations.map(r => ({ ...r, severidad: r.impacto })) };
}
export function evaluateAffectationRoute(state, posture, context, monetaryState) {
  return freeze(evaluateAffectation(state, posture, context, monetaryState, []));
}
export function buildBankRestrictionReport(state, posture, context, monetaryState) {
  validateContext(context); const proposed = [];
  const evaluations = posture.afectaciones.map(a => evaluateAffectation(state, a, context, monetaryState, proposed));
  const explanations = evaluations.flatMap(a => a.explicaciones);
  return freeze({ empresa: posture.empresa, fecha_hora_evaluacion: context.fecha_hora_evaluacion,
    resultado: outcome(explanations), afectaciones: evaluations, alertas: explanations.map(r => ({ ...r, severidad: r.impacto })) });
}
