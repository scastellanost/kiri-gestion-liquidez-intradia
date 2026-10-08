# Gestión de Liquidez Intradía — Inventario de Baseline para Piloto

Fecha de inventario: 2026-10-08
Baseline fuente congelado: `archive/liquidez-baseline-liq-codex-009-20261008`
Rama fuente de construcción: `liq-codex-009`
Rama de trabajo piloto: `pilot/liquidez-001`

## Objetivo
Inventariar el estado real recibido de ChatGPT + Codex antes de iniciar piloto gobernado. Este documento no redefine reglas funcionales; identifica qué existe, qué está probado, qué está bloqueado y qué debe validarse independientemente.

## Artefactos funcionales / contratos presentes
- LIQ-CODEX-001 — núcleo monetario
- LIQ-CODEX-002 — necesidades
- LIQ-CODEX-002A — ajuste/complemento de necesidades
- LIQ-CODEX-003 — posición
- LIQ-CODEX-004 — postura
- LIQ-CODEX-005 — restricciones/capacidad bancaria
- LIQ-CODEX-005A — complemento de restricciones/capacidad
- LIQ-CODEX-006 — cobertura/capacidad
- LIQ-CODEX-006A — complemento intercompany/buffer
- LIQ-CODEX-007 — FX
- LIQ-CODEX-008 — reservas/persistencia asociada
- LIQ-CODEX-009 — mandatos de liquidez

Cada orden conserva:
- contrato funcional en `docs/LIQ-CODEX-*.md`;
- evidencia de implementación en `docs/LIQ-CODEX-*-IMPLEMENTACION.md` cuando aplica;
- pruebas automatizadas en `test/`.

## Motores presentes
- `src/money.js`
- `src/needs.js`
- `src/position.js`
- `src/posture.js`
- `src/bank-restrictions.js`
- `src/coverage.js`
- `src/fx.js`
- `src/reserves.js`
- `src/mandates.js`
- `src/state.js`

## QA heredado reportado por Codex
La implementación LIQ-CODEX-009 declara:
- 333 pruebas totales;
- 333 PASS;
- 0 FAIL;
- 293 pruebas de regresión previas;
- 40 pruebas nuevas de Mandatos.

Este resultado es **evidencia del implementador**, no certificación independiente del piloto.

## Dos bloqueos funcionales abiertos en LIQ-CODEX-009
1. **Límite agregado por afectación:** no está congelada la regla de si varios mandatos APROBADOS sobre una misma afectación deben limitarse conjuntamente al pendiente económico total.
2. **Reserva de recomposición FX:** no está congelada la regla de si una excepción FX autorizada debe reservar también las rutas necesarias para recomponer la capacidad desplazada.

Estos puntos permanecen `BLOCKED_BY_FUNCTIONAL_RULE`. El piloto no puede convertirlos en reglas implícitas.

## Alcance excluido del baseline
Según LIQ-CODEX-009:
- ejecución bancaria real;
- compra FX real;
- conciliación bancaria;
- confirmación de ejecución;
- cierre D+1;
- UI;
- integración con SIGRF.

## Estado de inventario
**BASELINE_INVENTORIED_WITH_FUNCTIONAL_BLOCKS**

El baseline es apto para iniciar piloto controlado de validación de motores y trazabilidad, pero no para declarar operación productiva ni cierre funcional total.
