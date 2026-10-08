# Gestión de Liquidez P2 — Matriz trazable de cobertura

Fecha: 2026-10-08
Alcance: 13 escenarios mínimos de 11_RUNTIME/work-requests/PILOT_01_F1_P2_NEEDS_AFFECTATIONS.request.md.
Evidencia técnica: Actions 37807782801; 348/348 PASS.
Inspección independiente: lectura de nombres y contenidos de tres archivos de prueba en rama pilot/liquidez-001.

| Escenario de aceptación | Pruebas que lo cubren (código del caso) | Estado |
|---|---|---|
| 1. Alta, ajuste y anulación conserva identidad/originales | QA-P07, P08, QA-2A01–05, QA-N25 | Evidencia técnica |
| 2. Anulación parcial/total y exceso | QA-2A01–06, QA-P15 | Evidencia técnica |
| 3. Stock reemplaza, no suma | QA-P01, QA-2A07 | Evidencia técnica |
| 4. Stock retroactivo preservado sin reemplazo | QA-2A07, QA-P01 | Evidencia técnica |
| 5. Ajuste/anulación retroactivos rechazados | QA-2A09, QA-2A10, QA-N14 | Evidencia técnica |
| 6. Confirmado no disminuye por ajuste genérico | QA-2A11, QA-2A12 | Evidencia técnica |
| 7. Idempotencia batch_id/request_id | QA-P09, P10, QA-N15, N16 | Evidencia técnica |
| 8. Una necesidad activa por afectación | QA-N07, QA-N20 | Evidencia técnica |
| 9. Déficit derivado, no obligación nueva | QA-N06, QA-P16 | Evidencia técnica |
| 10. Prioridad/rigidez independientes y orden determinista | QA-N01, N04, N05, N19 | Evidencia técnica |
| 11. Reclasificación compromiso/reserva sin doble efecto | QA-N08–N10, N24 | Evidencia técnica |
| 12. Moneda heterogénea y control de agregación | QA-P11, P20, QA-N25 | Evidencia técnica |
| 13. Regresión completa | GitHub Actions 37807782801, node --test, 348/348 PASS | PASS técnico |

## Dictamen limitado
Se verificó correspondencia nominal/directa entre todos los escenarios exigidos y casos existentes. NO se ejecutó un examen manual exhaustivo de resultados intermediarios ni QA funcional independiente integral. Por tanto P2 mantiene **TECHNICAL_PASS / FUNCTIONAL_CERTIFICATION_PENDING** y no debe darse como VALIDATED_FOR_PILOT todavía.

Bloqueos excluidos: mandatos agregados y reserva durante recomposición FX. No se modificó producción, ni contrato ni baseline. Ninguna operación bancaria se ejecutó.
