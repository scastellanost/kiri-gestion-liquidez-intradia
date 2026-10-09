# LIQ-CODEX-003 — Necesidades, Prioridad y Reclasificación

## Objetivo
Construir el motor canónico de necesidades operativas, prioridad y reclasificación sobre el bloque aprobado:
- CODEX-001 — Estado y Moneda
- CODEX-002 — Motor de Posición
- CODEX-002A — Continuidad y Correcciones Operativas

Esta orden NO implementa UI. Implementa lógica pura y tests.

## Principio rector
Complejidad en el motor; claridad en pantalla.

El motor debe producir una cola lógica y explicable de necesidades. La interfaz futura decidirá cómo mostrarla, pero no debe existir duplicación económica ni duplicación de alertas.

## Alcance funcional
Implementar:
- entidad lógica de necesidad;
- prioridad económica;
- rigidez temporal;
- hora/fecha objetivo;
- orden de atención;
- déficit como resultado derivado;
- vinculación entre afectación y necesidad;
- reclasificación COMPROMISO ↔ RESERVA;
- repriorización;
- persistencia de trazabilidad;
- exposición de una cola ordenada por empresa;
- consistencia con Posición;
- no doble descuento durante reclasificación.

## No tocar
NO implementar todavía:
- postura bancaria;
- restricciones bancarias;
- cobertura;
- FX T+1 específico como módulo;
- What If de liberación de reservas;
- mandatos;
- conciliación avanzada;
- cierre;
- UI;
- SIGRF.

## Regla 1 — Necesidad lógica
Toda obligación o reserva que requiera atención debe poder representarse como una necesidad.

Campos mínimos:
- need_id
- affectation_id vinculado cuando aplique
- empresa
- tipo_partida
- naturaleza: COMPROMISO | RESERVA
- currency_original
- amount_original
- monto_vigente
- prioridad_economica
- rigidez_temporal
- fecha_hora_objetivo opcional
- estado
- origen
- usuario opcional
- fecha_hora_evento
- motivo_prioridad opcional
- motivo_reclasificacion opcional

No crear una necesidad económica duplicada si ya existe una afectación vinculada.

## Regla 2 — Prioridad económica
Valores permitidos:
- P1_CRITICA
- P2_ALTA
- P3_NORMAL
- P4_DISCRECIONAL

La prioridad económica NO cambia la naturaleza de la afectación.

## Regla 3 — Rigidez temporal
Valores permitidos:
- R1_HORA_RIGIDA
- R2_VENTANA_DIA
- R3_FECHA_RIGIDA
- R4_FLEXIBLE

La rigidez temporal es independiente de la prioridad económica.

**Jerarquía contractual ratificada por el Líder Funcional el 2026-10-09:** R1_HORA_RIGIDA → R2_VENTANA_DIA → R3_FECHA_RIGIDA → R4_FLEXIBLE, en ese orden de mayor a menor exigencia. Al ordenar una cola, esta jerarquía prevalece sobre la fecha objetivo y sobre la prioridad económica; entre elementos con igual rigidez, se aplican sucesivamente fecha/hora objetivo existente (ausente al final), prioridad económica, fecha/hora del evento y need_id. No completar automáticamente una fecha objetivo ausente. La jerarquía expresa una precedencia de atención, no una reclasificación de la necesidad.


## Regla 4 — Fecha/hora objetivo
Si rigidez = R1_HORA_RIGIDA o R3_FECHA_RIGIDA:
- fecha_hora_objetivo es obligatoria.

Si rigidez = R2_VENTANA_DIA o R4_FLEXIBLE:
- puede ser opcional.

La fecha/hora debe ser válida y con zona horaria.

## Regla 5 — Orden de atención
El motor debe producir un ranking determinístico de necesidades activas por empresa.

Orden base:
1. rigidez temporal más exigente;
2. fecha/hora objetivo más próxima cuando exista;
3. prioridad económica más alta;
4. fecha_hora_evento más antigua;
5. need_id como desempate estable.

No inferir que P1 siempre está antes que una R1 con hora crítica más próxima si la combinación objetiva indica otra prioridad temporal.
La salida debe conservar componentes del criterio para explicar el orden.

## Regla 6 — Déficit
Déficit NO es una necesidad.

Déficit = max(0, -saldo_disponible_gestion)

El motor puede producir:
- brecha_consolidada_empresa
- necesidades_causantes

Pero no crear un need adicional llamado DEFICIT.

## Regla 7 — Vinculación con afectaciones
Cada necesidad económica vinculada a una afectación debe referenciar affectation_id.

Para una afectación ACTIVA:
- debe existir máximo una necesidad ACTIVA vinculada que represente esa misma afectación.

No duplicar:
- compromiso como afectación
- y otra obligación paralela que descuente nuevamente.

La necesidad es una capa de decisión; el efecto económico sigue viniendo del Motor de Posición.

## Regla 8 — Reclasificación COMPROMISO → RESERVA
Permitida solo de forma explícita y trazable.

Requiere:
- affectation_id
- motivo_reclasificacion no vacío
- fecha_hora_evento
- origen
- usuario opcional

Efecto:
- misma afectación lógica/económica;
- naturaleza cambia de COMPROMISO a RESERVA;
- no cambia amount_original;
- no cambia currency_original;
- no crea una segunda afectación activa;
- monto_vigente se conserva;
- monto_reflejado_confirmado debe ser 0 para permitir COMPROMISO → RESERVA.

Si monto_reflejado_confirmado > 0:
- ERROR RECLASSIFICATION_AFTER_CONFIRMED_EXECUTION_NOT_ALLOWED.

## Regla 9 — Reclasificación RESERVA → COMPROMISO
Permitida de forma explícita y trazable.

Efecto:
- misma afectación;
- naturaleza cambia a COMPROMISO;
- amount_original/currency_original intactos;
- monto_vigente intacto;
- monto_reflejado_confirmado = 0 al momento de la conversión;
- no crea doble afectación.

## Regla 10 — Repriorización
Cambiar prioridad económica o rigidez temporal:
- NO cambia naturaleza;
- NO cambia monto;
- NO cambia moneda;
- NO cambia efecto económico;
- conserva trazabilidad.

Requiere:
- motivo_prioridad no vacío
- nuevo valor válido
- timestamp no retroactivo

## Regla 11 — Retroactividad
Una repriorización o reclasificación con fecha_hora_evento anterior al último evento de la necesidad/afectación:
- ERROR RETROACTIVE_NEED_EVENT
- sin mutación

## Regla 12 — Estado mínimo
Para esta orden:
- ACTIVA
- CERRADA

Una necesidad se considera CERRADA cuando:
- su afectación vinculada está ANULADA;
- o su pendiente económico llega a 0 y no requiere seguimiento adicional.

No crear estados adicionales todavía.

## Regla 13 — Sin impacto económico duplicado
Reclasificar COMPROMISO ↔ RESERVA no debe cambiar por sí solo el Saldo Disponible para Gestión si monto_vigente se conserva.

Ejemplo:
Saldo 100
Compromiso 20
Disponible 80

Reclasificar ese 20 a RESERVA:
Disponible sigue 80.

Reserva 20 → Compromiso:
Disponible sigue 80.

## Regla 14 — Cola por empresa
Exponer función lógica:
buildNeedQueue(state, empresa, monetaryState)

Debe devolver como mínimo:
- empresa
- saldo_disponible_gestion
- deficit
- necesidades_activas ordenadas
- total_necesidad_vigente
- brecha_consolidada
- criterios_orden

No implementar aún cobertura.

## Regla 15 — Necesidades causantes
La cola debe distinguir:
- necesidades económicas activas;
- afectaciones sin prioridad configurada;
- necesidad temporal rígida;
- reservas.

No inventar alertas paralelas.

## Regla 16 — Sin prioridad configurada
Si una afectación ACTIVA aún no tiene necesidad/prioridad definida:
- no desaparece;
- debe aparecer como UNCLASSIFIED_NEED;
- conserva efecto económico desde Posición;
- la cola debe poder exponerla al final o en bloque pendiente de clasificación.

No asignar prioridad silenciosamente.

## Regla 17 — Creación de necesidad
API lógica sugerida:
createNeed(...)
linkNeedToAffectation(...)
reprioritizeNeed(...)
reclassifyAffectation(...)
buildNeedQueue(...)
closeNeedIfResolved(...)

Codex puede usar otra nomenclatura si preserva exactamente el contrato.

## Regla 18 — Idempotencia
Toda operación manual:
- request_id obligatorio

Repetir exactamente request_id:
- no duplica eventos ni efectos

Mismo request_id con payload distinto:
- IDEMPOTENCY_CONFLICT

## Regla 19 — Trazabilidad
Registrar:
- operación
- need_id
- affectation_id
- valores anteriores
- valores posteriores
- motivo
- origen
- usuario
- timestamp
- request_id

## Regla 20 — Separación de responsabilidades
Motor de Necesidades:
- clasifica
- prioriza
- reclasifica
- ordena
- explica

Motor de Posición:
- calcula efecto económico

No duplicar fórmulas de disponibilidad.

## Casos QA obligatorios

### QA-N01 — Prioridad y rigidez independientes
Necesidad P1/R4 y necesidad P2/R1.
Ambas conservan sus dimensiones; no se convierten una en otra.

### QA-N02 — R1 requiere hora
Crear R1 sin fecha_hora_objetivo:
ERROR.

### QA-N03 — R3 requiere fecha
Crear R3 sin fecha_hora_objetivo:
ERROR.

### QA-N04 — Orden por rigidez/hora
R1 10:00 debe ir antes que R1 12:00.

### QA-N05 — Prioridad como desempate
Dos necesidades misma rigidez/misma hora:
P1 antes que P2.

### QA-N06 — Déficit no crea need
Saldo gestión -30:
deficit = 30
número de necesidades no aumenta por el déficit.

### QA-N07 — Una afectación, una necesidad activa
Intentar crear segunda necesidad activa para mismo affectation_id:
ERROR DUPLICATE_ACTIVE_NEED.

### QA-N08 — Compromiso→Reserva sin ejecución
Compromiso 20, reflejado 0:
reclasifica a RESERVA.
Disponible Gestión permanece 80.
Originales intactos.

### QA-N09 — Compromiso→Reserva con reflejado
Compromiso 20, reflejado 10:
RECLASSIFICATION_AFTER_CONFIRMED_EXECUTION_NOT_ALLOWED.

### QA-N10 — Reserva→Compromiso
Reserva 20:
pasa a COMPROMISO.
Disponible Gestión permanece igual.
No duplica afectación.

### QA-N11 — Repriorización
P3→P1:
naturaleza, monto, moneda y efecto económico intactos.

### QA-N12 — Repriorización requiere motivo
Sin motivo:
ERROR.

### QA-N13 — Reclasificación requiere motivo
Sin motivo:
ERROR.

### QA-N14 — Evento retroactivo
Repriorización/reclasificación con timestamp anterior:
RETROACTIVE_NEED_EVENT.

### QA-N15 — Idempotencia
Repetir request_id idéntico:
sin duplicación.

### QA-N16 — Conflicto idempotencia
Mismo request_id, payload distinto:
IDEMPOTENCY_CONFLICT.

### QA-N17 — UNCLASSIFIED_NEED
Afectación activa sin necesidad vinculada:
aparece como UNCLASSIFIED_NEED y sigue afectando posición.

### QA-N18 — Cola no calcula cobertura
No deben existir campos o funciones de fuente/cobertura/movilización.

### QA-N19 — Cola explica criterio
Cada necesidad ordenada expone criterio suficiente para justificar posición relativa.

### QA-N20 — Necesidad cerrada por afectación anulada
Afectación ANULADA:
necesidad pasa a CERRADA/no aparece como activa.

### QA-N21 — Pendiente cero
Compromiso con monto_vigente = monto_reflejado_confirmado:
necesidad no debe contarse como necesidad económica activa.

### QA-N22 — Reserva activa permanece
Reserva vigente > 0:
aparece en cola como necesidad activa de naturaleza RESERVA.

### QA-N23 — Prioridad no modifica posición
Cambiar P4→P1 no cambia Saldo Disponible para Gestión.

### QA-N24 — Reclasificación no modifica posición
COMPROMISO 20 ↔ RESERVA 20 mantiene mismo disponible.

### QA-N25 — Originales intactos
Ninguna operación altera amount_original/currency_original.

## Regresión
Debe conservar:
- CODEX-001: 15/15
- CODEX-002: 20/20
- CODEX-002A: 12/12

Más CODEX-003:
- 25/25

Total esperado:
72/72 PASS

## Criterio de aceptación
PASS si:
- 72/72 tests;
- déficit no se duplica como necesidad;
- reclasificación no duplica efecto económico;
- prioridad y naturaleza permanecen separadas;
- no se implementa cobertura;
- no se implementa postura bancaria;
- no se implementa FX específico;
- no hay UI;
- no se toca SIGRF.

## Entrega Codex
Entregar:
1. archivos modificados;
2. APIs públicas creadas;
3. tests;
4. resultado exacto 72/72;
5. decisiones técnicas;
6. cualquier BLOCKED_BY_FUNCTIONAL_RULE;
7. commit en liq-codex-003;
8. no merge a main.

## Estado
LISTA PARA EJECUCIÓN.
