# Liquidez — P2 plan final de QA funcional independiente
Fecha: 2026-10-08
Estado: READY_FOR_INDEPENDENT_FUNCTIONAL_VALIDATION (no es certificado PASS).
Alcance: orden 11_RUNTIME/work-requests/PILOT_01_F1_P2_NEEDS_AFFECTATIONS.request.md; matriz PILOT_01_F1_P2_TRACEABILITY_MATRIX_20261008.md.
Regresión reproducible disponible: https://github.com/scastellanost/kiri-gestion-liquidez-intradia/actions/runs/37821146273 (348/348 PASS).

## Protocolo obligatorio para revisor independiente de implementación
Recrear, con entradas sintéticas declaradas y resultados económicos esperados calculados de forma independiente, los 13 escenarios de la orden; por cada uno registrar entrada, saldo inicial, evento, saldo final esperado/obtenido, moneda, fecha, identificación de afectación/necesidad, excepción y correspondencia al contrato. No usar exclusivamente el valor esperado que contiene el mismo test del implementador. Comparar las cantidades con cálculo manual explícito o script de QA desarrollado separadamente.

1. Alta, ajuste, anulación: identificadores y monto original inmutables.
2. Anulación parcial/total y rechazo al exceder pendiente: comprobar cantidad exacta.
3. Stock bancario posterior reemplaza anterior, nunca acumulación de saldos.
4. Observación histórica no desplaza stock vigente.
5. Operación retroactiva inválida preserva estado exacto.
6. Confirmado no disminuye con ajuste genérico.
7. Reintentos batch_id/request_id no duplican afectaciones ni diferencias económicas.
8. Una necesidad activa por afectación; duplicada rechazada.
9. Déficit solo vista derivada, no segunda obligación.
10. Orden por prioridad/rigidez con resultado determinista documentado.
11. Cambiar COMPROMISO→RESERVA no descuenta dos veces.
12. Monedas distintas: centralizar FX solo bajo regla autorizada o devolver excepción.
13. Volver a ejecutar el total de pruebas y analizar cada fallo o salto.

## Cierre y condiciones
Entregar matriz de 13 resultados con evidencia de cálculos y responsable independiente; QA técnico/funcional/semántico/datos-seguridad/regresión; excepciones y dictamen. No promover P2 por mera aprobación de GitHub Actions. Si todo resulta PASS, proponer VALIDATED_FOR_PILOT (no producir integración bancaria). Mantener sin resolver límites agregados de mandato y reserva FX. No modificar baseline congelado.

Glosario: expectativa independiente = cifra o comportamiento obtenido sin copiar la respuesta que presupone el código sometido a revisión; idempotencia = repetir una solicitud sin duplicar efectos; regresión = comprobar que cambios no invalidan funcionalidades anteriores.
