# PILOT-01 / F1 / P2 — Comprobaciones económicas independientes
Fecha: 2026-10-08
Estado: PARTIAL_INDEPENDENT_ECONOMIC_QA_PASS / FORMAL_13_SCENARIO_CERTIFICATION_PENDING
Rama: qa/pilot-01-f1-p2-restart
Código de QA agregado: test/p2-independent-economic-oracles.test.js
Evidencia: https://github.com/scastellanost/kiri-gestion-liquidez-intradia/actions/runs/37831020005

## Resultados comprobados
Workflow success: **353 tests; 353 pass; 0 fail**. Cinco oráculos económicos nuevos con números esperados declarados independientemente:

| Caso | Ecuación económica independiente | Resultado |
|---|---|---|
| INDEP-01 | 100 - (20 - 10 confirmado) - 15 = 75 VES disponibles | PASS |
| INDEP-02 | 100 - 130 = -30 VES; déficit 30, necesidad activa única por afectación | PASS |
| INDEP-03 | 150 reemplaza stock 100; 150 - 20 = 130 VES disponibles | PASS |
| INDEP-04 | Compromiso 20 con 10 confirmado, se anulan 5; pendiente 5; 100-5 = 95 VES | PASS |
| INDEP-05 | Compromiso 20 pasa a reserva 20; disponible 100-20 = 80 VES | PASS |

## Interpretación
Se añade evidencia independiente cuantitativa para escenarios 2, 3, 9 y 11 y combinaciones de altas y afectaciones. Las comprobaciones son datos sintéticos, sin banca real ni persistencia de producción. No se declara cerrada la revisión funcional independiente de los trece escenarios: restan pruebas independientes específicas de temporalidad, idempotencia, prioridad, monedas heterogéneas, errores y trazabilidad completas, además del dictamen por revisor metodológicamente independiente.

Glosario: oráculo económico = resultado calculado de forma separada que se compara con el sistema; saldo disponible = saldo del banco menos compromisos pendientes y reservas bloqueadas; déficit = parte negativa del disponible expresada como necesidad de cobertura.
