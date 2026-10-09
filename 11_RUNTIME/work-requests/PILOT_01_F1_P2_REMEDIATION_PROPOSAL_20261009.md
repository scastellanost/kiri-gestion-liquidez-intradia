# PILOT-01/F1/P2 — Propuesta de resolución tras QA independiente
Fecha: 2026-10-09
Estado: PROPOSED / FUNCTIONAL_GATE_REQUIRED / NOT_EXECUTION_AUTHORIZED
Versión auditada: 851bb5845708bc3b280fc2eeab11006f8cb1745c
Auditor independiente: Claude Code. Dictamen FAIL, rama claude/gallant-lovelace-i6t14b.

## Hallazgos
- EXC-P2-01 CRITICAL: cancelación parcial→total con importes de dos decimales puede rechazarse o dejar saldo/need fantasma.
- EXC-P2-02: carga de estado admite afectaciones inválidas y dos necesidades activas.
- EXC-P2-03: jerarquía R2 frente a R3 no definida.

## Diseño propuesto, sin autoridad de ejecución
1. EXC-P2-01: precisar política de unidad mínima por moneda y aritmética monetaria exacta; primero estudiar compatibilidad de moneda, escalas, convertidor money.js, importes fuente e interfaces P1/P2. Prohibido redondear, truncar o modificar originales silenciosamente. Probar 1250,30-250,10-1000,20; 1,10-1,00-0,10; frontera/exceso, FX, idempotencia, P1 y regresiones. Selección definitiva requiere aprobación funcional.
2. EXC-P2-02: en carga de estado verificar invariantes de afectaciones, saldos, vinculación y máximo una necesidad ACTIVA por afectación; rechazo atómico con error estable, sin mutación ni reparación tácita. Preservar persistencia válida y trazabilidad.
3. EXC-P2-03: candidato de orden R1_HORA_RIGIDA, R2_VENTANA_DIA, R3_FECHA_RIGIDA, R4_FLEXIBLE. Requiere ratificación del Líder Funcional; registrar rigidez frente a fecha y prioridad. Sin cambio silencioso.

## Segregación y puertas
Implementador: ChatGPT/Codex, no Claude Code. Re-QA independiente: Claude Code sobre nuevo commit congelado, escenarios S02/S08/S10 y 13 completos, 43 oráculos y 369 regresiones más nuevos casos, evidencia y trazabilidad.
NO implementar política monetaria ni aplicar jerarquía hasta aprobación funcional. No merge, no producción, no P3; permisos/concurrencia NO_DEMOSTRADO fuera de contrato, sin aceptación tácita.
