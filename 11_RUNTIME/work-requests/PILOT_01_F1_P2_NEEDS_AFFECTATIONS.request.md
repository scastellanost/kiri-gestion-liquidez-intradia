# WORK_REQUEST — PILOT-01/F1/P2 Necesidades y Afectaciones

Fecha: 2026-10-08
Estado: READY_FOR_EXECUTION
Proyecto: KIRI_GESTION_LIQUIDEZ_INTRADIA
Rama: pilot/liquidez-001
Baseline inmutable: archive/liquidez-baseline-liq-codex-009-20261008

## Fuentes autorizadas
- 08_ORQUESTADOR/PROJECT_STATE.json
- 02_ORDENES/activas/PILOT_01_F1.md
- docs/LIQ-CODEX-002.md y docs/LIQ-CODEX-002A.md (stock y afectaciones)
- docs/LIQ-CODEX-003.md (necesidades, prioridad, reclasificación)
- src/position.js, src/needs.js y pruebas existentes.
- Evidencia P1: 11_RUNTIME/qa-results/PILOT_01_F1_P1.result.json.

## Objetivo
Validar con casos sintéticos reproducibles: (a) creación, ajuste, anulación parcial/completa, trazabilidad y persistencia de compromisos/reservas; (b) saldo bancario como stock reemplazable; (c) temporalidad y tratamiento retroactivo; (d) idempotencia; (e) una necesidad activa por afectación, sin duplicación económica; (f) correspondencia entre necesidades y posición.

## INPUT → PROCESS → OUTPUT
INPUT: saldos por empresa/banco/cuenta/moneda/marca temporal; afectaciones con identificador, importe/moneda originales, vigente, confirmado, estado y eventos; necesidades con prioridad, rigidez temporal y fecha/hora objetivo.
PROCESS: validar antes de mutar, aplicar eventos gobernados, conservar stock más reciente, calcular pendiente, vincular y ordenar necesidades sin descontar por segunda vez.
OUTPUT: posición y lista de necesidades coherentes y trazables, eventos rechazados con error explicable y sin mutación, resultados de pruebas por cada regla.

## Pruebas mínimas dirigidas
1. Alta y cambios controlados conservando identificador y originales.
2. Anulación parcial y total; no exceder pendiente.
3. Saldos actualizados sustituyen stock, nunca se agregan como flujos.
4. Marca temporal retroactiva de stock se preserva históricamente sin reemplazar vigente.
5. Ajuste/anulación retroactiva: rechazo sin mutación.
6. Cantidad confirmada no puede disminuir mediante ajuste genérico.
7. Repetir batch_id y request_id no produce efectos duplicados.
8. Un affectation_id no genera dos necesidades activas.
9. Déficit es resultado derivado, no otra obligación.
10. Prioridad y rigidez temporal independientes; orden determinístico y explicable.
11. Reclasificación COMPROMISO/RESERVA sin doble impacto.
12. Monedas heterogéneas usan motor central o generan excepción.
13. Prueba de regresión íntegra con `node --test`.

## QA y salida exigida
QA técnico, funcional, semántico, datos/cálculos, regresión y trazabilidad. Registrar conteos completos, enlaces a GitHub Actions, análisis de excepciones y dictamen por revisor distinto del implementador. No marcar PASS si sólo se prueba un subconjunto; no simular ejecución bancaria.

## Exclusiones y bloqueos
Sin producción, secretos, interfaz definitiva, integración SIGRF o ejecución bancaria. Conservar sin decisión los bloqueos: límite agregado de mandatos aprobados y reserva de recomposición FX.

## Criterio de avance
P2 pasa a VALIDATED_FOR_PILOT sólo si la revisión independiente acredita todos los escenarios definidos y no aparecen regresiones; registrar informe, estado y evidencias en GitHub antes de iniciar P3.
