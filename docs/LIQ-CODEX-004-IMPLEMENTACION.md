# LIQ-CODEX-004 — Postura Empresa → Banco → Cuenta

## Archivos y APIs

Se añaden exclusivamente:

- `src/posture.js`.
- `test/liq-codex-004.test.js`.
- `docs/LIQ-CODEX-004-IMPLEMENTACION.md`.

APIs públicas en `src/posture.js`:

- `PostureError(code)`: error controlado con código estable.
- `setPostureConfig(state, row, request_id)`: configura las preferencias de una empresa.
- `clearPostureConfig(state, row, request_id)`: elimina sus preferencias.
- `buildPosture(state, empresa, monetaryState)`: reconstruye la localización y las
  vistas por afectación, cuenta y banco sin modificar el estado.

No cambian las APIs ni los archivos de Moneda, Posición o Necesidades.

## Configuración

```js
import { setPostureConfig, clearPostureConfig, buildPosture } from '../src/posture.js';
import { saveNeedState, loadNeedState } from '../src/needs.js';

// state es el snapshot existente de Posición/Necesidades; cuentas y bancos
// deben existir en su catálogo y pertenecer a la empresa indicada.
state = setPostureConfig(state, {
  empresa: 'E',
  orden_bancos: ['A', 'B'],
  orden_cuentas_por_banco: { A: ['A1', 'A2'], B: ['B1'] },
  origen: 'MANUAL', usuario: 'tesoreria',
  fecha_hora_evento: '2026-10-02T12:00:00Z'
}, 'posture-config-1');

const posture = buildPosture(state, 'E', monetaryState);

// El adaptador de persistencia existente guarda el snapshot completo,
// incluidos postura, eventos y recibos, sin una segunda implementación.
saveNeedState(localStorage, state);
state = loadNeedState(localStorage);

state = clearPostureConfig(state, {
  empresa: 'E', origen: 'MANUAL', fecha_hora_evento: '2026-10-02T13:00:00Z'
}, 'posture-clear-1');
```

`postureConfigs` contiene como máximo una configuración por empresa. Los arrays
conservan exactamente el orden indicado. Una nueva configuración reemplaza la
anterior de esa empresa, conservándola en el evento de trazabilidad.

Se validan empresas/bancos/cuentas existentes, pertenencia y duplicados.
`orden_bancos: []` y `orden_cuentas_por_banco: {}` son válidos. Un banco puede
tener un orden de cuentas sin figurar en `orden_bancos`: ese orden permite
localizar afectaciones con banco explícito, sin habilitarlo para las no asignadas.
Las cuentas omitidas no participan en los recorridos.

SET y CLEAR requieren request_id, origen y timestamp válido con zona horaria;
usuario es opcional. Comparten el registro de idempotencia con las demás capas:
mismo ID/contenido devuelve el mismo snapshot; otro contenido produce
IDEMPOTENCY_CONFLICT. No se consumen identificadores en operaciones fallidas.

Los eventos `SET_POSTURE_CONFIG` y `CLEAR_POSTURE_CONFIG` conservan empresa,
antes, después, origen, usuario opcional, fecha_hora_evento y request_id.

## Reconstrucción y responsabilidad económica

1. `buildNeedQueue` aporta la cola de CODEX-003 y los resultados económicos de
   Posición. Se procesan primero sus necesidades activas clasificadas en su orden
   exacto; después el bloque UNCLASSIFIED_NEED en su orden existente.
2. `getAffectationPending` aporta el pendiente de la afectación. No se reimplementa
   la fórmula de compromiso ni se vuelve a descontar la obligación.
3. Los saldos vigentes de cada cuenta se consolidan en VES con CODEX-001. Si hay
   varios registros monetarios vigentes de una cuenta, se convierten antes de sumar.
4. Se mantiene un único acumulador de capacidad restante por cuenta para toda la
   empresa durante la construcción. Cada asignación consume como máximo el menor
   entre el pendiente y la capacidad restante; ninguna unidad se reutiliza.
5. Banco explícito limita la ruta a ese banco. Sin banco explícito se usa
   `orden_bancos`. Dentro de cada banco se recorre por completo su orden de cuentas
   antes de pasar al siguiente, solo mientras exista residual.
6. El resultado es derivado: no se almacena como una afectación adicional ni cambia
   banco_asignado, stock, originales o disponibilidad para gestión.

Solo se usan cuentas de la empresa. Para elegibilidad se exige saldo positivo y
ausencia de marcas de catálogo `moneda_ambigua: true` o `no_utilizable: true`.
Son indicadores técnicos de los supuestos del contrato; no se implementan cutoff,
límites u otras restricciones bancarias. Las cuentas sin saldo positivo no asignan.

Las capacidades de salida son `max(0, saldo_vigente)` menos las asignaciones de
esta reconstrucción. Se muestran también cuentas omitidas o no elegibles para
conservar visibilidad del saldo; tener capacidad numérica no habilita una cuenta
fuera del orden configurado ni elimina su marca de no elegibilidad.

La postura no limita la capacidad física usando el saldo de gestión después de
afectaciones, porque eso volvería a descontarlas. La disponibilidad y déficit de
empresa se muestran exactamente como los devuelve Posición. Ninguna capacidad
se presenta como remanente movilizable ni autoriza transferencias.

## Moneda y errores de ruta

Toda salida monetaria es VES. Las conversiones usan exclusivamente `convertMoney`
y `consolidateMoney` de CODEX-001; no se reescriben saldos originales.

Antes de asignar se valida la conversión de todas las cuentas utilizables de la
ruta configurada, aunque una cuenta anterior parezca suficiente. Si falta tasa,
esa afectación devuelve `publicable: false`, MISSING_EXCHANGE_RATE y ninguna
asignación, sin consumir capacidad parcialmente. Si tampoco puede convertirse
el pendiente, sus importes pendiente/residual quedan `null`.

Una ruta independiente que solo use bancos con tasas completas puede calcularse.
Cada ruta conserva su indicador `publicable`. La salida global queda no publicable
si la posición consolidada o alguna ruta no lo es. No se oculta una moneda faltante
para presentar una posición completa.

## Salidas

- Empresa: `empresa`, `moneda`, `publicable`, `errors`, `saldo_disponible_gestion`,
  `deficit`, `criterios_orden`, `afectaciones`, `cuentas`, `bancos`.
- Afectación: ID, empresa, naturaleza, moneda, pendiente, banco asignado,
  asignaciones, localizado, no localizado y estado LOCALIZADA_TOTAL,
  LOCALIZADA_PARCIAL o NO_LOCALIZADA. Incluye need_id/clasificación, criterio de
  cola, ruta de bancos y recorrido explicativo.
- Cuenta: empresa/banco/cuenta, saldo vigente VES, asignado, capacidad restante,
  elegibilidad, motivo de exclusión, publicabilidad y errores.
- Banco: saldo, asignado, capacidad restante, IDs de afectaciones localizadas y
  `residual_no_localizado_en_banco`. Este residual suma únicamente el de las
  afectaciones con ese banco explícito: no se duplica el residual sin banco en
  todos los bancos recorridos.

El recorrido registra consumo, capacidad antes/después, pendiente y razones para
no asignar: capacidad agotada, cuenta no elegible o falta de orden configurado.
La ausencia de configuración es una localización no lograda, no una preferencia
implícita ni una fuente de cobertura.

Cada construcción parte del stock actual; no consume resultados de posturas
anteriores. ANULADAS y pendientes cero desaparecen de la postura activa. Cambios
de stock y prioridades se reflejan al reconstruir. No hay timestamps generados ni
ordenación por archivos de carga; los mismos inputs producen la misma salida.

## QA ejecutado

Comando: `node --test`.

| Suite | Resultado |
|---|---|
| CODEX-001 | 15/15 PASS |
| CODEX-002 | 20/20 PASS |
| CODEX-002A | 12/12 PASS |
| CODEX-003 | 25/25 PASS |
| CODEX-004 | 30/30 PASS |
| Total | **102/102 PASS** |

| Caso | Verificación | Resultado |
|---|---|---|
| QA-B01 | Configuración válida conserva orden, incluso tras persistir/recargar | PASS |
| QA-B02 | Cuenta inexistente rechazada | PASS |
| QA-B03 | Cuenta de otra empresa/banco rechazada; sin consumo intercompany | PASS |
| QA-B04 | Banco duplicado rechazado | PASS |
| QA-B05 | Cuenta duplicada rechazada | PASS |
| QA-B06 | Banco explícito: 16 = A1 10 + A2 6 | PASS |
| QA-B07 | Banco explícito A no usa B: 15 localizado, 5 residual | PASS |
| QA-B08 | Sin banco: A 15 + B 5 | PASS |
| QA-B09 | Intrabanco: A1 10 + A2 6, B1 0 | PASS |
| QA-B10 | Capacidad 15 compartida: 12 + 3; residual 5 | PASS |
| QA-B11 | P1 antes de P3 según CODEX-003 | PASS |
| QA-B12 | Clasificada antes de UNCLASSIFIED | PASS |
| QA-B13 | Reserva localizable sin alterar economía | PASS |
| QA-B14 | Disponibilidad de gestión y estado intactos | PASS |
| QA-B15 | Asignado + residual = pendiente económico | PASS |
| QA-B16 | Capacidades no negativas; cuentas no elegibles excluidas | PASS |
| QA-B17 | Anulada libera localización al reconstruir | PASS |
| QA-B18 | Pendiente cero no consume | PASS |
| QA-B19 | Reconstrucción determinística e independiente del orden de saldos | PASS |
| QA-B20 | Nuevo stock 10→20 cambia capacidad sin acumulación | PASS |
| QA-B21 | Sin configuración/vacía/limpiada: NO_LOCALIZADA | PASS |
| QA-B22 | Banco explícito usa únicamente orden de cuentas configurado | PASS |
| QA-B23 | Cuenta USD convertida a VES con BCV | PASS |
| QA-B24 | Sin tasa: ruta no publicable y cero asignaciones parciales | PASS |
| QA-B25 | Originales y entradas intactos | PASS |
| QA-B26 | Cuenta 10, asignado 6, restante 4 | PASS |
| QA-B27 | Banco 18, asignado 16, restante 2 | PASS |
| QA-B28 | Residual explícito expuesto solo en su banco | PASS |
| QA-B29 | SET/CLEAR idempotentes sin nuevos eventos | PASS |
| QA-B30 | Mismo request_id con distinto payload rechazado | PASS |

Runner: **102 tests, 102 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**.
No se modificaron las suites anteriores para obtener este resultado.

## Bloqueos

Ningún `BLOCKED_BY_FUNCTIONAL_RULE` pendiente para el alcance implementado.
