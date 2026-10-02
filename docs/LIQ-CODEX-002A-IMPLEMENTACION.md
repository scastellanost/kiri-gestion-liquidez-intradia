# LIQ-CODEX-002A — Estabilización de continuidad

## Cambios

- `src/position.js`: modifica únicamente `applyBalances` y `applyAffectations`.
- `test/liq-codex-002.test.js`: actualiza las expectativas previas de bloqueo
  en QA-P01 y QA-P15 conforme al nuevo contrato.
- `test/liq-codex-002a.test.js`: añade los 12 QA obligatorios.
- `docs/LIQ-CODEX-002A-IMPLEMENTACION.md`: documenta reglas y resultados.

## Decisiones técnicas

1. La anulación reduce `monto_vigente` en la misma afectación. Un compromiso
   permanece ACTIVA mientras su pendiente sea positivo; una reserva mientras
   su vigente sea positivo. Al agotarse, queda ANULADA. Se preservan originales
   y `monto_reflejado_confirmado`, sin crear otra obligación.
2. Una observación de saldo anterior a la vigente se agrega a `events` con
   `treatment: 'HISTORICAL_ONLY'`; no se incorpora a `balances` ni altera posición.
   Conserva trazabilidad y usa los recibos de idempotencia existentes. El preview
   la acepta sin modificar estado. Timestamp igual con otro importe sigue siendo
   `CONFLICTING_STOCK_TIMESTAMP`.
3. AJUSTE y ANULACION anteriores al último evento de su afectación se rechazan
   con `RETROACTIVE_AFFECTATION_EVENT`.
4. Un AJUSTE que reduzca lo confirmado se rechaza con
   `CONFIRMED_AMOUNT_REVERSAL_NOT_ALLOWED`. Los aumentos válidos siguen permitidos.
   No se implementa una operación de reversa ni conciliación.

No se crean nuevas APIs públicas. Los cambios internos alcanzan los previews,
cargas masivas y registros manuales mediante el flujo compartido existente.
Se conservan atomicidad, snapshots inmutables, idempotencia y trazabilidad.
`money.js` y `state.js` permanecen intactos. No se añaden funcionalidades de otras órdenes.

Las cuatro reglas sustituyen los bloqueos documentados históricamente en
`LIQ-CODEX-002-IMPLEMENTACION.md`. No queda `BLOCKED_BY_FUNCTIONAL_RULE` en el
motor para estos casos; los rechazos operativos tienen los códigos arriba definidos.

## QA ejecutado

Comando: `node --test`.

| Suite | Resultado |
|---|---|
| CODEX-001, QA 01–15 | 15/15 PASS |
| CODEX-002, QA-P01–QA-P20 | 20/20 PASS |
| CODEX-002A, QA-2A01–QA-2A12 | 12/12 PASS |
| Total | **47/47 PASS** |

| Caso | Evidencia | Resultado |
|---|---|---|
| QA-2A01 | Compromiso 20, anula 5: vigente/pendiente 15, ACTIVA | PASS |
| QA-2A02 | Compromiso 20, reflejado 10, anula 5: vigente 15, pendiente 5, ACTIVA | PASS |
| QA-2A03 | Compromiso 20, reflejado 10, anula 10: vigente 10, pendiente 0, ANULADA | PASS |
| QA-2A04 | Reserva 15, anula 5: vigente 10, ACTIVA | PASS |
| QA-2A05 | Reserva 15, anula 15: vigente 0, ANULADA | PASS |
| QA-2A06 | Anulación excesiva rechazada sin mutación | PASS |
| QA-2A07 | Saldo 90 de 10:00 histórico; vigente 100 de 12:00 y posición intactos | PASS |
| QA-2A08 | Timestamp igual con importe distinto rechazado | PASS |
| QA-2A09 | AJUSTE retroactivo: RETROACTIVE_AFFECTATION_EVENT, sin mutación | PASS |
| QA-2A10 | ANULACION retroactiva: RETROACTIVE_AFFECTATION_EVENT, sin mutación | PASS |
| QA-2A11 | Reducción confirmada: CONFIRMED_AMOUNT_REVERSAL_NOT_ALLOWED, sin mutación | PASS |
| QA-2A12 | Aumento confirmado permitido, originales intactos | PASS |

La suite también comprueba preview sin mutación, idempotencia manual/masiva de
históricos, idempotencia de anulaciones, trazabilidad y conservación de originales.
Resultado del runner: **47 tests, 47 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**.
