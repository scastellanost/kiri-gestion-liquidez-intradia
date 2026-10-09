# Liquidez — preparación de revisión independiente P2
Fecha: 2026-10-09
Estado: REQUEST_PREPARED / AUDITOR_POR_ASIGNAR_CON_INDEPENDENCIA / QA_INDEPENDIENTE_GLOBAL_NO_EJECUTADO
Alcance autorizado: PILOT-01 F1 P2 — necesidades y afectaciones (no P3).
Evidencia de implementación: 369/369 PASS en https://github.com/scastellanost/kiri-gestion-liquidez-intradia/actions/runs/37872413333; 21 oráculos económicos independientes de valores fijos. PR #3 permanece DRAFT.
## Regla transversal de independencia de funciones — aplicación específica a Liquidez
El Líder Funcional ratificó que Codex ejecutó la implementación del código de Liquidez. **Codex NO puede emitir ni firmar el QA independiente de ese mismo alcance P2**, aunque un workflow creado por Codex se denomine «Independent QA». La designación SIGRF (Claude Code implementa, Codex audita) es una asignación específica y NO se debe replicar mecánicamente. Para Liquidez se requiere auditor externo al trabajo de Codex (posible Claude Code u otro auditor técnicamente habilitado, tras verificar que no contribuyó al alcance auditado). La función de auditor queda **POR ASIGNAR**; no se afirma que haya aceptado o ejecutado.

## Contrato de revisión a exigir al auditor distinto del implementador
- Recuperar la matriz ORIGINAL de 13 escenarios y cotejar uno a uno con ejecución y resultado observado. NO atribuir nombres/resultados no vistos.
- Para cada caso: origen y versión; entradas; estados antes/después; importes en moneda original, VES y equivalente USD aplicable; obligación económica y efecto sobre pendiente; verificaciones de no duplicación, idempotencia y temporalidad; trazabilidad de identidad; evidencia del resultado; riesgo y excepción.
- Verificar permisos, persistencia, errores, simultaneidad aplicable y regresión de P1, y que no exista ejecución bancaria ni uso de datos productivos.
- Emitir PASS / PASS_CON_EXCEPCIONES / FAIL / NO_DEMOSTRADO justificando cada uno.
## Bloqueos que NO se deciden por el auditor
1. Límite agregado de mandatos aprobados por afectación: regla funcional no decidida.
2. Reserva de recomposición FX autorizada: alcance funcional no decidido.
No introducir supuestos técnicos como regla de negocio. Mantener fuera del motor cualquier implementación de esas decisiones no autorizadas.
## Salida
Dictamen independiente sobre los 13 casos, matriz de trazabilidad y evidencia de ausencia de regresión. Solo tras dictamen y cierre funcional se habilita P3. Este archivo no certifica P2 ni sustituye a un agente auditor.
