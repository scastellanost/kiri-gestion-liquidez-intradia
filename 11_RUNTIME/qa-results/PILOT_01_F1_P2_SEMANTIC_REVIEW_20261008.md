# Gestión de Liquidez — P2 revisión semántica focalizada
Fecha: 2026-10-08
Rama revisión: qa/pilot-01-f1-p2-restart
Fuentes: docs/LIQ-CODEX-002.md; docs/LIQ-CODEX-003.md; test/liq-codex-002.test.js, test/liq-codex-002a.test.js, test/liq-codex-003.test.js (rama piloto).
Ejecución completa: https://github.com/scastellanost/kiri-gestion-liquidez-intradia/actions/runs/37812243549 ; 348/348 PASS.

## Inspección de aserciones concretas
- QA-N07 comprueba error DUPLICATE_ACTIVE_NEED, enlace por affectation_id y que el saldo disponible permanezca en 80 aun después de vincular necesidad: PASS de regresión observada.
- QA-N08 valida compromiso→reserva con mismo saldo 80, una sola afectación, importe y moneda originales conservados y evento anterior/posterior: PASS de regresión observada.
- QA-N15 comprueba repetición idempotente y persistencia de estado en almacenamiento simulado (Map): PASS de regresión observada; no equivale a persistencia de base productiva.
- QA-2A07 conserva saldo vigente 100 aunque se recibe observación histórica 90, registra HISTORICAL_ONLY: PASS de regresión observada.
- QA-2A09 rechaza ajuste retroactivo con código explícito sin mutar estado: PASS de regresión observada.

## Dictamen delimitado
El contrato conceptual queda respaldado por aserciones técnicas específicas en los mecanismos críticos examinados; regresión global 348/348. No se ha ejecutado certificación funcional independiente exhaustiva de cada transición ni integración con bancos o base productiva. Estado propuesto: P2 SEMANTIC_SPOT_CHECK_PASS / FORMAL_QA_PENDING. No se modifica estado oficial ni se cierra P2. Dos reglas abiertas sobre mandatos agregados y recomposición FX permanecen sin decisión.

Glosario: aserción = condición exacta que comprueba una prueba; simulación de almacenamiento = sustituto controlado de un sistema real que sirve para verificar reglas, sin probar la instalación productiva.
