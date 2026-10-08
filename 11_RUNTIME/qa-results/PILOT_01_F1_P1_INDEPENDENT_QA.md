# QA independiente — PILOT-01/F1/P1 Integridad Monetaria

Fecha: 2026-10-08  
Solicitud: `11_RUNTIME/work-requests/PILOT_01_F1_P1_MONETARY_INTEGRITY.request.md`  
PR: https://github.com/scastellanost/kiri-gestion-liquidez-intradia/pull/2  
Ejecución: https://github.com/scastellanost/kiri-gestion-liquidez-intradia/actions/runs/37801087381

## Dictamen
**PASS_CON_EXCEPCIONES — P1 apto técnicamente para cierre condicionado a integrar la evidencia en la rama oficial y registrar estado.** No equivale a aprobación de producción.

## Evidencia objetiva
- GitHub Actions: 348 pruebas, 348 aprobadas, 0 fallidas; 333 de regresión y 15 escenarios P1.
- Escenarios: conversión VES/USD y USD/VES; invariancia de moneda e importe originales; tasa cero/nula; ausencia de EUR; no sumar directamente distintas monedas; vista VES; persistencia; coherencia fecha administrada; recálculo por BCV.
- Revisión independiente de código en `src/money.js`, `src/state.js`, `src/needs.js`, `src/position.js`, `src/posture.js`, `src/bank-restrictions.js`, `src/coverage.js`, `src/fx.js`, `src/reserves.js` y `src/mandates.js`: los módulos que necesitan conversiones llaman a funciones centrales de `money.js`. El caso 15 por sí solo NO bastaba para esta conclusión.
- Riesgos semánticos: el tipo de cambio 36,50 del test es **dato sintético**, no tasa BCV real del 8 de octubre de 2026. No se ha probado ingestión de fuente BCV externa ni conciliación bancaria (fuera de P1).
- Seguridad y gobierno: no se modificó código de los motores, credenciales, integraciones bancarias ni ramas de archivo; PR permanece en borrador.
- Advertencias técnicas no bloqueantes del run: deprecaciones de Node en acciones de GitHub.

## Excepciones y límites
1. AGGREGATE_APPROVED_MANDATE_LIMIT_PER_AFFECTATION_UNDECIDED: pendiente, ajeno a P1.
2. FX_RECOMPOSITION_RESERVATION_RULE_UNDECIDED: pendiente, ajeno a P1.
3. Se recomienda reforzar posteriormente una verificación automatizada para detectar nuevas implementaciones paralelas de conversión; la revisión actual cubre los módulos de `src/` inspeccionados.
4. La incorporación del PR y la actualización del estado son operaciones separadas, pendientes de evidenciar.

## Regla de avance
No marcar P1 como completamente archivado ni activar P2 mientras las evidencias y este dictamen no estén integrados en la rama piloto y el estado oficial no registre el cierre. No proceder con merge productivo ni promoción AUTOMATED.
