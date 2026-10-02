# LIQ-CODEX-002A — Estabilización de Continuidad y Correcciones Operativas

## Objetivo
Cerrar los cuatro BLOCKED_BY_FUNCTIONAL_RULE identificados en LIQ-CODEX-002 sin invadir CODEX-003 ni CODEX-010.

## Decisiones funcionales

### R-002A-01 — Anulación parcial
Se permite anulación parcial de una afectación ACTIVA.

Compromiso:
- pendiente = monto_vigente - monto_reflejado_confirmado
- monto_anulado debe ser > 0 y <= pendiente
- nuevo monto_vigente = monto_vigente - monto_anulado
- si nuevo pendiente > 0: estado = ACTIVA
- si nuevo pendiente = 0: estado = ANULADA
- nunca disminuir monto_reflejado_confirmado
- amount_original/currency_original permanecen intactos

Reserva:
- monto_anulado debe ser > 0 y <= monto_vigente
- nuevo monto_vigente = monto_vigente - monto_anulado
- si monto_vigente > 0: estado = ACTIVA
- si monto_vigente = 0: estado = ANULADA

La anulación parcial no crea otra afectación.

### R-002A-02 — Saldo bancario retroactivo
Una observación de saldo con fecha_hora_saldo anterior a la vigente:
- NO reemplaza el stock vigente;
- NO altera la posición actual;
- se conserva únicamente como evento/histórico técnico;
- debe quedar marcada como HISTORICAL_ONLY o equivalente técnico;
- la carga puede aceptarse si es válida e idempotente.

Una observación con el mismo timestamp y distinto monto continúa siendo ERROR por conflicto.

### R-002A-03 — Cambios retroactivos de afectaciones
No se permite que AJUSTE o ANULACION con fecha_hora_evento anterior al último evento de esa afectación modifique el estado operativo vigente.

Regla:
- rechazar con error estable RETROACTIVE_AFFECTATION_EVENT;
- no usar BLOCKED_BY_FUNCTIONAL_RULE;
- no mutar estado.

Las correcciones operativas deben registrarse como un nuevo evento con timestamp actual o posterior.

### R-002A-04 — Disminución de monto_reflejado_confirmado
Un AJUSTE genérico no puede disminuir monto_reflejado_confirmado.

Regla:
- rechazar con error estable CONFIRMED_AMOUNT_REVERSAL_NOT_ALLOWED;
- no usar BLOCKED_BY_FUNCTIONAL_RULE;
- no mutar estado.

La reversa de una conciliación pertenecerá a LIQ-CODEX-010 mediante una operación explícita de conciliación/reversa.

## Alcance
Modificar solo lo estrictamente necesario en:
- src/position.js
- test/liq-codex-002.test.js o nuevo test específico 002A
- docs/LIQ-CODEX-002A-IMPLEMENTACION.md

No modificar:
- money.js
- state.js
- UI
- prioridad
- reclasificación
- postura
- cobertura
- FX
- mandatos
- conciliación avanzada
- SIGRF

## QA obligatorio

QA-2A01 — Anulación parcial compromiso 20, reflejado 0, anula 5:
vigente 15, pendiente 15, ACTIVA.

QA-2A02 — Compromiso 20, reflejado 10, anula 5:
vigente 15, reflejado 10, pendiente 5, ACTIVA.

QA-2A03 — Compromiso 20, reflejado 10, anula 10:
vigente 10, reflejado 10, pendiente 0, ANULADA.

QA-2A04 — Reserva 15, anula 5:
vigente 10, ACTIVA.

QA-2A05 — Reserva 15, anula 15:
vigente 0, ANULADA.

QA-2A06 — Anulación mayor al pendiente:
ERROR, sin mutación.

QA-2A07 — Saldo vigente 100 a las 12:00; llega saldo 90 de las 10:00:
stock vigente sigue 100; posición actual sigue 100; histórico conserva 90.

QA-2A08 — Saldo mismo timestamp con monto distinto:
ERROR.

QA-2A09 — AJUSTE retroactivo:
RETROACTIVE_AFFECTATION_EVENT y sin mutación.

QA-2A10 — ANULACION retroactiva:
RETROACTIVE_AFFECTATION_EVENT y sin mutación.

QA-2A11 — Disminuir monto_reflejado_confirmado:
CONFIRMED_AMOUNT_REVERSAL_NOT_ALLOWED y sin mutación.

QA-2A12 — Aumentar monto_reflejado_confirmado sigue permitido.

## Regresión
Debe mantener:
- CODEX-001: 15/15 PASS
- CODEX-002: 20/20 PASS, ajustando expectativas previas donde ahora existe regla explícita
- CODEX-002A: 12/12 PASS

## Criterio de cierre
No debe quedar ningún BLOCKED_BY_FUNCTIONAL_RULE de los cuatro casos anteriores.

## Entrega
- archivos modificados
- funciones afectadas
- 47/47 PASS esperados (15 + 20 + 12)
- decisiones técnicas
- commit en liq-codex-002a
- sin merge a main
