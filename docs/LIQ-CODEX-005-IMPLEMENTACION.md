# LIQ-CODEX-005 — Restricciones Bancarias y Viabilidad de Ruta

## Archivos

- `src/bank-restrictions.js`: configuración, uso técnico, evaluación y reportes.
- `test/liq-codex-005.test.js`: 40 QA y comprobaciones complementarias.
- `docs/LIQ-CODEX-005-IMPLEMENTACION.md`: contrato técnico y resultados.

Los motores y tests de CODEX-001 a CODEX-004 permanecen intactos. No se agregan
cobertura, fuentes alternativas, FX específico, What If, mandatos, conciliación,
cierre, UI ni SIGRF.

## APIs públicas

- `BankRestrictionError(code)`.
- `setBankRestriction(state, row, request_id)`.
- `clearBankRestriction(state, row, request_id)`.
- `setBankUsage(state, row, request_id)`.
- `reserveBankCapacity(state, row, request_id)`.
- `releaseBankCapacity(state, row, request_id)`.
- `getBankUsage(state, query)`.
- `evaluateAssignmentRoute(state, assignment, context, monetaryState)`.
- `evaluateAffectationRoute(state, localizedAffectation, context, monetaryState)`.
- `buildBankRestrictionReport(state, posture, context, monetaryState)`.

Las operaciones manuales requieren request_id, origen, fecha_hora_evento con zona
horaria y usuario opcional. Devuelven un snapshot nuevo congelado. El registro
global `receipts` gobierna idempotencia, incluidos conflictos con otras capas.
Los errores no mutan el estado ni consumen identificadores.

## Configuración y precedencia

```js
state = setBankRestriction(state, {
  banco: 'A', empresa: 'E', cuenta: 'A1', moneda: 'VES',
  reglas: {
    max_por_operacion: 10, max_diario: 100, max_operaciones_dia: 20,
    hora_inicio: '09:00', cutoff: '17:00', minutos_acreditacion: 30,
    permite_intrabanco: true, permite_interbanco: false, settlement: 'BOTH',
    monedas_permitidas: ['VES'], empresas_permitidas: ['E'], cuentas_permitidas: ['A1'],
    requiere_aprobacion_adicional: true, dias_habiles_semana: [1, 2, 3, 4, 5],
    feriados: ['2026-12-25'], estado_activo: true
  },
  origen: 'MANUAL', fecha_hora_evento: '2026-10-05T09:00:00-04:00'
}, 'restriction-1');
```

Solo banco es obligatorio entre los selectores. Empresa, cuenta y moneda son
opcionales. La cuenta se valida contra el banco y su empresa se normaliza desde
catálogo. Un SET reemplaza la configuración del mismo selector; CLEAR elimina
ese selector concreto. Reglas omitidas no crean restricciones. Una configuración
con estado_activo false no participa; las reglas de menor especificidad siguen
disponibles.

**Confirmado por el usuario:** precedencia por campo, cuenta > empresa+banco >
banco. Dentro del mismo nivel, la regla específica de moneda prevalece sobre la
regla sin moneda. Las configuraciones menos específicas aportan los campos no
sobrescritos. Cada campo efectivo conserva su selector de procedencia.

Límites y uso se expresan en la moneda explícita de operación. Una regla sin
selector de moneda aplica su importe a esa moneda; no se mezclan importes de
monedas diferentes para medir uso diario.

Validaciones: importes finitos no negativos; contadores enteros no negativos;
HH:mm válido; weekdays ISO 1=lunes a 7=domingo; feriados YYYY-MM-DD reales;
booleanos, settlement y referencias de catálogo válidos. No hay valores
restrictivos por defecto para ventanas, weekdays o límites ausentes.

## Uso consumido y reservas técnicas

`setBankUsage` recibe banco, empresa, cuenta, moneda, fecha, monto_usado_dia y
operaciones_usadas_dia. Es una observación acumulada que reemplaza la anterior
para esa clave; no se suma de nuevo al repetir la carga. Este dato representa
uso previo recibido, no la emisión de operaciones por este motor.

`reserveBankCapacity` recibe los mismos selectores/fecha más reservation_id,
monto positivo y operaciones enteras positivas. Conserva una reserva ACTIVA.
`releaseBankCapacity` recibe reservation_id y trazabilidad, y la marca LIBERADA.
No hay liberación automática ni reutilización del mismo reservation_id con otro
request_id. Una segunda liberación diferente se rechaza. Repetir exactamente la
solicitud ya aplicada es idempotente.

**Confirmado por el usuario:** monto_usado_dia excluye reservas activas. Para
cada límite se suman usado, reservado y propuestas evaluadas. El alcance es
banco/día/moneda; se filtra por empresa o cuenta cuando el campo del límite tenga
ese selector. `getBankUsage` expone los cuatro componentes del contrato:

- monto_usado_dia;
- operaciones_usadas_dia;
- monto_reservado_por_aprobadas;
- operaciones_reservadas.

El día del límite es la fecha local de evaluación, no la fecha de acreditación.
Las reservas conservan explícitamente su fecha; no se trasladan entre jornadas.
Registrar uso/reservas no autoriza la operación ni genera un mandato.

## Evaluación de rutas

```js
const result = evaluateAssignmentRoute(state, {
  banco: 'A', cuenta: 'A1', monto_asignado: 25, moneda: 'VES'
}, {
  empresa: 'E', tipo_ruta: 'INTRABANCO', settlement: 'T0',
  fecha_hora_evaluacion: '2026-10-05T10:00:00-04:00',
  zona_horaria: 'America/Caracas',
  fecha_hora_objetivo: '2026-10-05T11:00:00-04:00'
}, monetaryState);
```

Se usa una asignación de Postura, sin alterar su importe ni ubicación. El contexto
exige timestamp, zona horaria IANA, tipo_ruta INTRABANCO/INTERBANCO y settlement
T0/T1. No se consulta el reloj del sistema ni se infiere el tipo de ruta.

La moneda explícita de la asignación se usa como moneda de operación, salvo que
el contexto declare `moneda_operacion`. En ese caso la equivalencia se obtiene
exclusivamente de CODEX-001 mediante monetaryState; no se ejecuta FX ni se
modifican originales.

Máximo por operación: se calcula el mínimo número de operaciones. `tramos` usa
representación compacta `{ monto, operaciones }`, con un grupo de tramos iguales
y el último residual, evitando arrays enormes. El conteo completo se aplica al
límite diario de operaciones. Exceder el monto diario o número diario bloquea.

El evaluador compara listas permitidas, tipo de ruta, settlement y calendario.
Aprobación adicional produce restricción y APROBACION_ADICIONAL, no bloqueo.
Una regla configurada y satisfecha puede producir INFO con evidencia; sin reglas
no se generan alertas decorativas.

Cada regla evaluada expone rule_id, dimension, valor_configurado,
valor_observado, resultado, impacto y acción cuando corresponde. Las reglas
efectivas incluyen sus selectores para explicar de dónde procede cada valor.

## Tiempo y calendario

**Confirmado por el usuario:** zona horaria explícita; T1 significa siguiente día
hábil a la misma hora local más minutos_acreditacion, verificando el objetivo.
T0 después de cutoff, en día inhábil o feriado queda bloqueado. T1 debe ser
solicitado explícitamente; el motor no sustituye silenciosamente T0 por T1.

Los días hábiles y feriados ausentes no añaden exclusiones. Cuando sí se configuran,
T1 salta las fechas excluidas; una semana sin ningún día hábil no tiene siguiente
fecha disponible. Los instantes se comparan en UTC, con calendario/horas en la zona
recibida. Cutoff es inclusivo en su instante exacto.

**Confirmado por el usuario:** si hay deadline y falta minutos_acreditacion,
se bloquea con ACCREDITATION_TIME_REQUIRED, sin asumir acreditación instantánea.
Antes de apertura, la ETA parte de la apertura efectiva más minutos_acreditacion.
En T1 se respeta también la apertura de la fecha hábil resultante. Sin deadline
ni tiempo de acreditación configurado, ETA permanece null sin introducir una
restricción no configurada.

## Afectaciones y reporte

`evaluateAffectationRoute` evalúa todas las asignaciones de una afectación de
Postura. El deadline se toma de su necesidad activa vinculada cuando existe.
`context.por_cuenta` permite suministrar contexto explícito distinto por cuenta.
Una asignación bloqueada bloquea la afectación; sin bloqueos, una restringida
produce VIABLE_CON_RESTRICCION; todas viables producen VIABLE.

Residual no localizado o postura de afectación no publicable agrega
BLOQUEADA_POR_LOCALIZACION_INCOMPLETA. Nunca se declara completa una ruta parcial.

`buildBankRestrictionReport` recorre las afectaciones en el orden recibido de
Postura. **Confirmado por el usuario:** se acumulan temporalmente las propuestas
del conjunto para no exceder límites compartidos. Se evalúa el conjunto propuesto,
sin seleccionar fuentes ni optimizarlo eliminando rutas bloqueadas. El acumulador
es local a la llamada y nunca crea reservas oficiales.

Las lecturas y reportes no modifican Posición, Postura, afectaciones, necesidades,
balances ni uso técnico oficial. La viabilidad es un resultado derivado.

## Trazabilidad y persistencia

Eventos SET_BANK_RESTRICTION, CLEAR_BANK_RESTRICTION, RESERVE_BANK_CAPACITY,
RELEASE_BANK_CAPACITY y SET_BANK_USAGE contienen antes/después, selectores,
origen, usuario opcional, timestamp y request_id. Se reutiliza el snapshot y el
adaptador existente `saveNeedState`/`loadNeedState`, que conserva también las
colecciones bankRestrictions, bankUsage y bankCapacityReservations.

## QA

Comando: `node --test`.

| Suite | Resultado |
|---|---|
| CODEX-001 | 15/15 PASS |
| CODEX-002 | 20/20 PASS |
| CODEX-002A | 12/12 PASS |
| CODEX-003 | 25/25 PASS |
| CODEX-004 | 30/30 PASS |
| CODEX-005 | 40/40 PASS |
| Total | **142/142 PASS** |

| Caso | Verificación | Resultado |
|---|---|---|
| QA-R01 | Sin restricciones, ruta viable | PASS |
| QA-R02 | Máximo 10 sobre 25: tres operaciones | PASS |
| QA-R03 | Uso 80 + 30 excede diario 100 | PASS |
| QA-R04 | Dos usadas + dos requeridas excede tres | PASS |
| QA-R05 | Antes de apertura restringe | PASS |
| QA-R06 | Después de cutoff T0 bloquea | PASS |
| QA-R07 | ETA 10:30 cumple deadline 11:00 | PASS |
| QA-R08 | ETA 11:30 incumple deadline 11:00 | PASS |
| QA-R09 | Intrabanco permitido | PASS |
| QA-R10 | Intrabanco no permitido | PASS |
| QA-R11 | Interbanco no permitido | PASS |
| QA-R12 | T0 permitido | PASS |
| QA-R13 | T1 exclusivo bloquea T0; calendario T1 explícito | PASS |
| QA-R14 | Moneda no permitida | PASS |
| QA-R15 | Empresa no permitida | PASS |
| QA-R16 | Cuenta no permitida | PASS |
| QA-R17 | Aprobación adicional restringe | PASS |
| QA-R18 | Día inhábil T0 y siguiente hábil T1 | PASS |
| QA-R19 | Feriado según zona explícita | PASS |
| QA-R20 | Reserva consume máximo diario | PASS |
| QA-R21 | Reserva consume número de operaciones | PASS |
| QA-R22 | Release explícito restaura capacidad | PASS |
| QA-R23 | Reserva idempotente, incluso tras recarga | PASS |
| QA-R24 | Conflicto de idempotencia | PASS |
| QA-R25 | Precedencia cuenta y moneda por campo | PASS |
| QA-R26 | Precedencia empresa y uso según alcance | PASS |
| QA-R27 | Postura parcial bloquea resultado global | PASS |
| QA-R28 | Una asignación bloqueada; acumulación temporal | PASS |
| QA-R29 | Una asignación restringida | PASS |
| QA-R30 | Todas las asignaciones viables | PASS |
| QA-R31 | INFO no bloqueante | PASS |
| QA-R32 | Severidad RESTRICCION | PASS |
| QA-R33 | Severidad BLOQUEO | PASS |
| QA-R34 | Explicabilidad completa | PASS |
| QA-R35 | Postura y posición sin mutación | PASS |
| QA-R36 | Originales intactos y conversión central | PASS |
| QA-R37 | Timestamp explícito obligatorio | PASS |
| QA-R38 | Cutoff inválido rechazado | PASS |
| QA-R39 | Feriados inválidos rechazados | PASS |
| QA-R40 | Sin cobertura ni alternativas | PASS |

Runner: **142 tests, 142 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**.

## BLOCKED_BY_FUNCTIONAL_RULE

Las aclaraciones de precedencia, uso, moneda, T1 y ETA fueron resueltas por el
usuario. Se bloquean sin inventar reglas dos casos fuera de la definición temporal
del contrato:

- Ventanas que cruzan medianoche (hora_inicio posterior a cutoff), incluidas las
  que resulten de combinar overrides. Falta definir a qué jornada pertenece cada
  tramo y cómo aplica el cutoff.
- Una hora local T1/apertura ambigua o inexistente por cambio de horario de verano.
  Falta definir qué ocurrencia elegir o cómo desplazar una hora inexistente.

Ambos caminos devuelven BLOCKED_BY_FUNCTIONAL_RULE y no alteran estado. Están
verificados dentro de QA-R38 y QA-R13, respectivamente; 142/142 no significa que
esas decisiones funcionales pendientes hayan sido inventadas o resueltas.
