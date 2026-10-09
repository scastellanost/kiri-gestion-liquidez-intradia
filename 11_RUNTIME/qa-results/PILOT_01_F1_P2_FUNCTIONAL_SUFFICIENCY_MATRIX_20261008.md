# P2 — Matriz de suficiencia funcional consolidada
Fecha: 2026-10-08
Evidencia última ejecución: https://github.com/scastellanost/kiri-gestion-liquidez-intradia/actions/runs/37848679549
Base: 366/366 PASS; INDEP-01 a INDEP-18 con resultados aritméticos predeterminados, más casos originales QA-P/QA-2A/QA-N.

| Escenario contractual | Prueba independiente más cercana | Evaluación |
|---|---|---|
| 1 Alta/ajuste/anulación, identidad original | INDEP-04,14,15 | PARCIAL (identidad en conjunto cubierta por pruebas anteriores; falta oráculo único de secuencia integral) |
| 2 Anulación y exceso | INDEP-04,07,15 | CUBIERTO con casos sintéticos |
| 3 Saldo bancario como stock | INDEP-03 | CUBIERTO |
| 4 Stock retroactivo histórico | INDEP-06 | CUBIERTO |
| 5 Ajuste/anulación retroactiva | INDEP-09 | PARCIAL (anulación retroactiva solo en QA-2A10 existente) |
| 6 Confirmado no reduce | INDEP-18 | CUBIERTO |
| 7 Idempotencia batch/request | INDEP-08 | PARCIAL (request_id sí; batch_id pendiente oráculo independiente) |
| 8 Una necesidad por afectación | INDEP-10 | CUBIERTO |
| 9 Déficit no crea obligación | INDEP-02 | CUBIERTO |
| 10 Prioridad y rigidez | INDEP-11 | CUBIERTO en ejemplo, otros desempates por QA-N05 |
| 11 Reclasificación sin doble descuento | INDEP-05 | CUBIERTO |
| 12 Moneda heterogénea | INDEP-16,17 | CUBIERTO para USD/VES y ausencia BCV; sin EUR habilitado |
| 13 Regresión completa | Actions 37848679549 | PASS técnico (366/366) |

## Dictamen
El avance es sustancial, pero las celdas PARCIAL impiden declarar certificación funcional integral. Tampoco consta revisor formalmente distinto del autor de los nuevos tests. **FUNCTIONAL_CERTIFICATION_PENDING**. Próxima intervención: cerrar casos 1,5,7 con oráculos independientes y emitir acta de revisión separada; mantener P3 sin inicio automático.

Glosario: matriz de suficiencia = cruce de requisitos con comprobaciones y vacíos; batch = lote de cambios agrupados; cobertura parcial = hay evidencia relacionada pero no la prueba independiente completa exigida.
