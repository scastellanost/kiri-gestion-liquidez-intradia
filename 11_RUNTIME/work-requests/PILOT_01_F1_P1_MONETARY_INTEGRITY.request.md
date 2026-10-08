# WORK_REQUEST — PILOT-01/F1/P1 — Integridad Monetaria

- Fecha: 2026-10-08
- Proyecto: KIRI_GESTION_LIQUIDEZ_INTRADIA
- Estado de solicitud: PREPARED_NOT_EXECUTED
- Rama operativa autorizada: `pilot/liquidez-001`
- Baseline inmutable: `archive/liquidez-baseline-liq-codex-009-20261008`
- Fuente de estado: `08_ORQUESTADOR/PROJECT_STATE.json`
- Acción autorizada en estado oficial: `EXECUTE_P1_MONETARY_INTEGRITY`
- Certificación P1: PENDING_INDEPENDENT_QA
- Human Gate adicional: no requerido para pruebas reversibles.

## Fuentes obligatorias
Leer antes de la ejecución:
1. `08_ORQUESTADOR/PROJECT_STATE.json`
2. `02_ORDENES/activas/PILOT_01_F1.md`
3. `04_INVENTARIO/BASELINE_INVENTORY_20261008.md`
4. `docs/LIQ-CODEX-001.md`
5. `src/money.js` y sus pruebas existentes.
6. Gobierno y protocolo Codex vigentes.

## Objetivo y límites
Validar **sin redefinir reglas** la preservación de monto/moneda originales, presentación VES, equivalencia USD según BCV explícita de la jornada administrada, control de tasas faltantes y prohibición de sumar monedas heterogéneas directamente.

## Contrato INPUT → PROCESS → OUTPUT
- INPUT: registros `amount_original`, `currency_original`; estado `managedDate`, `displayCurrency`, `rates.VES_USD_BCV` con valor, fuente y marca temporal.
- PROCESS: validación, conversión explícita, consolidación y formateo mediante librería monetaria central; sin tasas implícitas ni modificación del original.
- OUTPUT: importes de visualización VES/USD equivalentes reproducibles, originales intactos, excepciones verificables y resultados de prueba.

## Casos mínimos contractuales
Ejecutar todos los 15 escenarios QA de `docs/LIQ-CODEX-001.md`, incluyendo:
- 36.500.000 VES con BCV 36,50 = 1.000.000 USD.
- 1.000.000 USD con BCV 36,50 = 36.500.000 VES.
- Originales invariantes después de conversión y cambio BCV.
- BCV cero/nulo bloquea equivalencia USD; EUR sin tasa genera `MISSING_EXCHANGE_RATE`.
- No suma directa VES+USD; valor original persiste y fecha administrada vincula BCV.
- Vista inicial/persistente y único motor monetario central.

## QA independiente requerido
QA técnico, funcional, semántico, datos/cálculos, regresión, gobierno/trazabilidad. El implementador sólo puede reportar SELF_TEST, nunca autocertificación definitiva. Verificar también ausencia de integración bancaria real, compra FX, SIGRF o cambios productivos.

## Invariantes y excepciones
- El original nunca se sobrescribe.
- Ausencia de tasa no equivale a tipo de cambio cero ni autoriza suposición.
- Preservar las dos excepciones de mandatos agregados y recomposición FX como BLOCKED_BY_FUNCTIONAL_RULE; no son alcance P1.

## Evidencia de salida exigida
Registrar referencia de commit, rama, ejecución de pruebas, detalle de casos PASS/FAIL, regresión, hallazgos, excepciones, dictamen independiente, enlaces recuperables en GitHub y actualización de estado oficial **sólo tras** obtener evidencia suficiente.

No crear una aprobación de producción, no hacer merge productivo y no promover a AUTOMATED.

## Criterio de cierre
`VALIDATED_FOR_PILOT` únicamente con evidencia de pruebas y QA independiente; si no existe ejecución, mantener `READY_FOR_EXECUTION` o consignar `EXECUTION_PENDING` sin afirmar PASS.
