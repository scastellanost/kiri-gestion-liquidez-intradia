# LIQ-CODEX-003 — Necesidades, Prioridad y Reclasificación

## Archivos

- `src/needs.js`: entidad de decisión, clasificación, cola, operaciones manuales,
  trazabilidad y persistencia inyectable.
- `src/position.js`: operación explícita RECLASIFICACION sobre la misma afectación
  y extracción del pendiente económico compartido.
- `test/liq-codex-003.test.js`: 25 QA con aserciones complementarias.
- `docs/LIQ-CODEX-003-IMPLEMENTACION.md`: esta documentación.

No se modifican `money.js`, `state.js` ni las suites anteriores.
No se implementan UI, postura, cobertura, restricciones bancarias, FX específico,
What If, mandatos, conciliación avanzada, cierre ni SIGRF.

## APIs públicas

En `src/needs.js`:

- `NeedError(code, detail)`: error con código estable.
- `createNeed(state, row, request_id)`.
- `linkNeedToAffectation(state, row, request_id)`.
- `reprioritizeNeed(state, row, request_id)`.
- `reclassifyAffectation(state, row, request_id)`.
- `closeNeedIfResolved(state, row, request_id)`.
- `buildNeedQueue(state, empresa, monetaryState)`.
- `saveNeedState(storage, state)`.
- `loadNeedState(storage)`.

En `src/position.js`:

- `getAffectationPending(affectation)`: expone el pendiente económico central,
  cero para ANULADA, vigente menos confirmado para COMPROMISO y vigente para RESERVA.
- Las APIs existentes de registro/preview de afectaciones ahora aceptan
  `operacion: 'RECLASIFICACION'`, sin cambiar sus firmas.

## Estado y entradas

Se utiliza el mismo snapshot de Posición, ampliado con `needs`. Las operaciones
devuelven nuevos snapshots congelados. `events` conserva la trazabilidad y
`receipts` la idempotencia de ambas capas. Las llamadas fallidas no mutan estado
ni consumen identificadores.

Toda operación manual recibe `request_id`, `origen`, `fecha_hora_evento` con zona
horaria y `usuario` opcional. El mismo request_id con el mismo contenido no agrega
eventos; con otro contenido produce IDEMPOTENCY_CONFLICT, incluso entre capas.
El orden de claves de objetos no afecta esta comparación.

Creación vinculada:

```js
import { createNeed, reprioritizeNeed, reclassifyAffectation,
  buildNeedQueue, saveNeedState, loadNeedState } from '../src/needs.js';

// positionState y monetaryState provienen de CODEX-002 y CODEX-001.
// La afectación OB-1 debe existir y pertenecer a la empresa consultada.
let state = createNeed(positionState, {
  need_id: 'NEED-1', affectation_id: 'OB-1',
  prioridad_economica: 'P3_NORMAL', rigidez_temporal: 'R4_FLEXIBLE',
  origen: 'MANUAL', fecha_hora_evento: '2026-10-02T10:00:00Z'
}, 'need-create-1');

state = reprioritizeNeed(state, {
  need_id: 'NEED-1', prioridad_economica: 'P1_CRITICA',
  rigidez_temporal: 'R1_HORA_RIGIDA', fecha_hora_objetivo: '2026-10-02T14:00:00Z',
  motivo_prioridad: 'Vencimiento confirmado', origen: 'MANUAL',
  fecha_hora_evento: '2026-10-02T11:00:00Z'
}, 'need-priority-1');

state = reclassifyAffectation(state, {
  affectation_id: 'OB-1', naturaleza_destino: 'RESERVA',
  motivo_reclasificacion: 'Fondos reservados por Tesorería', origen: 'MANUAL',
  fecha_hora_evento: '2026-10-02T12:00:00Z'
}, 'need-reclass-1');

const queue = buildNeedQueue(state, 'EMPRESA-1', monetaryState);
saveNeedState(localStorage, state);
state = loadNeedState(localStorage);
```

En una creación vinculada los campos económicos se toman de la afectación.
Si el solicitante también los proporciona deben coincidir. No se crean saldos
ni afectaciones desde la capa de necesidades.

Para crear una necesidad sin vínculo se omite `affectation_id` o se usa `null`,
y se suministran `empresa`, `tipo_partida`, `naturaleza`, `amount_original`,
`currency_original` y opcionalmente `monto_vigente` (por defecto igual al original).
La clasificación y trazabilidad son obligatorias igual que en una vinculada.
El vínculo posterior requiere `need_id`, `affectation_id` y trazabilidad; verifica
que coincidan los campos económicos y que no haya otra necesidad ACTIVA vinculada.
No se cambia un vínculo existente a otra afectación.

## Decisiones funcionales confirmadas por el usuario

1. Las necesidades sin afectación son registros de decisión sin efecto económico;
   quedan en `necesidades_sin_vinculo` y no se suman por separado al total.
2. `total_necesidad_vigente` es compromisos pendientes de ejecutar más reservas
   activas, en VES, incluidos los UNCLASSIFIED_NEED. Ambos importes proceden de
   `calculateCompanyPosition`; no se recalcula disponibilidad.
3. Con pendiente cero, la necesidad se cierra salvo indicación explícita de
   `requiere_seguimiento_adicional: true`. Ese seguimiento se conserva en
   `necesidades_seguimiento`, fuera de la cola económica activa y de su total.
   Una afectación ANULADA siempre cierra la necesidad.

## Orden y salida de la cola

`buildNeedQueue` es una lectura pura en VES. La salida incluye:

- `empresa`, `currency`, `publicable`, `errors`.
- `saldo_disponible_gestion`, `deficit`, `brecha_consolidada` desde Posición.
- `total_necesidad_vigente` desde los agregados de Posición.
- `necesidades_activas`, ordenadas y sin duplicar afectaciones.
- `necesidades_sin_clasificar`, con tipo UNCLASSIFIED_NEED y prioridades nulas.
- `necesidades_cerradas`, `necesidades_sin_vinculo`, `necesidades_seguimiento`.
- `criterios_orden` y `criterio_orden` por necesidad económica clasificada.

Orden: R1, R2, R3, R4; instante objetivo ascendente; P1, P2, P3, P4; instante del
evento más antiguo; need_id por comparación ordinal estable. En rigideces que
permiten objetivo opcional, los objetivos ausentes van después de los presentes.
Los timestamps con distintos offsets se comparan por instante, no por texto.
El criterio expuesto usa índices base cero de rigidez/prioridad, milisegundos
del instante y el need_id. Las dimensiones originales permanecen en el registro.

UNCLASSIFIED_NEED se expone en un bloque aparte, ordenado por affectation_id;
no se le inventa prioridad. Las reservas se distinguen por `naturaleza`; la
rigidez por `necesidad_temporal_rigida`. No se generan alertas paralelas ni un
registro DEFICIT.

La cola obtiene importes vigentes de la afectación, incluso tras AJUSTE o
ANULACION de Posición. Proyecta CERRADA cuando corresponda sin mutar el estado
durante una lectura. `closeNeedIfResolved` materializa ese cierre y su trazabilidad;
no cierra una obligación pendiente. Permite indicar seguimiento explícito.

Si Posición no es publicable por falta de tasa, la cola conserva esa condición y
sus errores, y los agregados monetarios son `null`. No sustituye una tasa ni
publica un total parcial. La capa de necesidades no contiene conversiones BCV.

## Reclasificación y trazabilidad

`reclassifyAffectation` delega en el Motor de Posición. La afectación conserva su
ID, originales y monto vigente. COMPROMISO→RESERVA requiere confirmado cero;
RESERVA→COMPROMISO establece confirmado cero conforme al contrato. Se sincroniza
la naturaleza de la necesidad activa vinculada, sin cambiar su prioridad.

Se valida retroactividad contra el último evento de la afectación y de sus
necesidades vinculadas. La repriorización aplica la misma validación cruzada y
no modifica la afectación. Ambas requieren motivo no vacío.

Cada evento de necesidades registra operación, need_id, affectation_id, valores
anteriores/posteriores, motivo, origen, usuario opcional, timestamp y request_id.
Una reclasificación sin necesidad configurada registra need_id nulo; la
afectación permanece visible como UNCLASSIFIED_NEED.

Persistencia: adaptador síncrono `getItem`/`setItem`, clave
`kiri.liq-codex-003.state`, sobre con versión 1 y snapshot completo (incluidos
recibos y eventos). La ausencia devuelve `null`; errores de lectura/escritura,
JSON inválido o formato no soportado se propagan. No hay fallback silencioso.
El estado monetario sigue siendo administrado por CODEX-001.

## QA ejecutado

Comando: `node --test`.

| Suite | Resultado |
|---|---|
| CODEX-001 | 15/15 PASS |
| CODEX-002 | 20/20 PASS |
| CODEX-002A | 12/12 PASS |
| CODEX-003 | 25/25 PASS |
| Total | **72/72 PASS** |

| Caso | Verificación | Resultado |
|---|---|---|
| QA-N01 | Prioridad y rigidez independientes | PASS |
| QA-N02 | R1 exige objetivo | PASS |
| QA-N03 | R3 exige objetivo; timestamp válido con zona | PASS |
| QA-N04 | R1 10:00 antes de R1 12:00 | PASS |
| QA-N05 | Prioridad desempata; evento e ID estabilizan | PASS |
| QA-N06 | Déficit derivado sin crear necesidad | PASS |
| QA-N07 | Una afectación/una necesidad activa y vínculo sin duplicación | PASS |
| QA-N08 | Compromiso→Reserva conserva disponible y originales | PASS |
| QA-N09 | Ejecución confirmada impide Compromiso→Reserva | PASS |
| QA-N10 | Reserva→Compromiso sin duplicación | PASS |
| QA-N11 | Repriorización P3→P1 conserva economía | PASS |
| QA-N12 | Repriorización requiere motivo y valores válidos | PASS |
| QA-N13 | Reclasificación requiere motivo | PASS |
| QA-N14 | Retroactividad rechazada sin mutación | PASS |
| QA-N15 | Idempotencia y persistencia de trazabilidad | PASS |
| QA-N16 | Conflicto de request_id rechazado | PASS |
| QA-N17 | UNCLASSIFIED_NEED conserva efecto y no recibe prioridad implícita | PASS |
| QA-N18 | Cola sin campos de cobertura/fuente/movilización | PASS |
| QA-N19 | Orden explicable por componentes | PASS |
| QA-N20 | Anulación cierra/excluye necesidad | PASS |
| QA-N21 | Pendiente cero excluido; seguimiento separado | PASS |
| QA-N22 | Reserva vigente permanece activa | PASS |
| QA-N23 | P4→P1 no altera disponible; total usa Posición | PASS |
| QA-N24 | Reclasificación ida/vuelta conserva disponible 80 | PASS |
| QA-N25 | Originales intactos en todas las operaciones | PASS |

Runner: **72 tests, 72 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**.
Las suites anteriores se conservaron sin modificar sus expectativas.

## Bloqueos

Ningún `BLOCKED_BY_FUNCTIONAL_RULE` pendiente. Las tres aclaraciones necesarias
fueron confirmadas por el usuario y quedan registradas arriba.
