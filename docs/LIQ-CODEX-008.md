# LIQ-CODEX-008 — Reservas y What If

## Gobierno obligatorio
Leer antes de implementar:
- README.md
- docs/PROTOCOLO_CODEX.md
- todos los contratos LIQ-CODEX-001 a LIQ-CODEX-007.

Hereda GOV-01 y GOV-01.1.

## Objetivo
Implementar la gestión de reservas no comprometidas y un motor What If que permita simular liberación, reasignación, conversión a compromiso y uso alternativo sin mutar el estado oficial.

## Principio rector
Una reserva es una afectación económica real ya reconocida por Posición.
Liberarla o reclasificarla cambia su tratamiento, pero nunca debe duplicar ni borrar la historia económica.

## Alcance
Implementar:
- detalle de reserva vinculada a afectación naturaleza RESERVA;
- monto_original;
- monto_bloqueado;
- monto_liberado;
- monto_reasignado;
- estado;
- liberación parcial/total;
- reasignación/reactivación;
- conversión reserva→compromiso;
- mantenimiento como libre;
- anulación;
- What If de escenarios;
- comparación antes/después;
- impacto en saldo_disponible_gestion;
- impacto en cobertura/postura/restricciones cuando corresponda;
- trazabilidad e idempotencia.

## No tocar
NO implementar:
- ejecución bancaria;
- mandatos;
- conciliación;
- cierre;
- UI;
- SIGRF.

## Regla 1 — Persistencia histórica
Una reserva liberada no se elimina.
Debe conservar:
- original;
- bloqueado vigente;
- liberado acumulado;
- reasignado acumulado;
- estado;
- trazabilidad.

## Regla 2 — Estados mínimos
- ACTIVA
- PARCIALMENTE_LIBERADA
- LIBERADA
- REASIGNADA
- CONVERTIDA_A_COMPROMISO
- ANULADA

No inferir EJECUTADA.

## Regla 3 — Liberación
Liberar reserva:
- reduce monto bloqueado;
- aumenta monto liberado acumulado;
- aumenta saldo_disponible_gestion en igual importe;
- no modifica amount_original/currency_original;
- no crea nueva afectación.

## Regla 4 — Liberación parcial
0 < monto_liberar <= monto_bloqueado.
No permitir liberar más de lo bloqueado.

## Regla 5 — Mantener libre
Monto liberado permanece libre y disponible.
No se asigna automáticamente a otra necesidad.

## Regla 6 — Reasignar/reactivar
Un monto previamente liberado puede reasignarse a la misma reserva:
- reduce liberado disponible;
- aumenta bloqueado;
- resta disponibilidad en igual importe;
- deja trazabilidad.

No puede reasignarse más de lo liberado acumulado disponible.

## Regla 7 — Convertir reserva a compromiso
Usar la misma afectación económica:
- naturaleza pasa RESERVA→COMPROMISO;
- no se crea segunda afectación;
- no cambia disponibilidad si monto vigente es el mismo;
- confirmed/reflejado debe ser 0;
- usa la lógica de reclasificación aprobada en CODEX-003.

## Regla 8 — Compromiso a reserva
Fuera de este módulo salvo la reclasificación ya permitida por CODEX-003.
No duplicar lógica.

## Regla 9 — Anulación
Solo sobre monto bloqueado vigente no confirmado.
Anulación reduce afectación según reglas existentes y conserva historia.

## Regla 10 — What If
Un escenario debe operar sobre una copia privada del estado.
Nunca modifica:
- balances;
- afectaciones oficiales;
- reservas oficiales;
- postura;
- restricciones;
- cobertura oficial;
- FX oficial.

## Regla 11 — Acciones What If
Permitir simular:
- RELEASE_RESERVE
- REASSIGN_RESERVE
- CONVERT_RESERVE_TO_COMMITMENT
- CANCEL_RESERVE
- KEEP_RELEASED_FREE

## Regla 12 — Secuencia de acciones
Un escenario puede contener varias acciones ordenadas.
Cada acción usa el resultado simulado de la anterior.
Si una falla, el escenario debe marcarse inválido y no continuar silenciosamente.

## Regla 13 — Impacto
Exponer antes/después:
- saldo_bancario;
- compromisos_por_ejecutar;
- reservas_bloqueadas;
- saldo_disponible_gestion;
- deficit;
- capacidad_cobertura;
- postura relevante.

## Regla 14 — Cobertura
El What If puede pedir recalcular cobertura con CODEX-006/006A después de liberar o reasignar.
No copiar lógica de cobertura.

## Regla 15 — FX
Si una reserva liberada mejora un plan FX:
- puede mostrarse el nuevo resultado;
- no se ejecuta ni se altera el FX oficial.

## Regla 16 — Restricciones
Si el escenario incluye una movilización hipotética:
- reutilizar CODEX-005/005A;
- no ignorar límites/cutoff/calendario.

## Regla 17 — Trazabilidad de operaciones reales de reserva
Eventos:
- RELEASE_RESERVE
- REASSIGN_RESERVE
- KEEP_RELEASED_FREE
- CONVERT_RESERVE_TO_COMMITMENT
- CANCEL_RESERVE

Con before/after, affectation_id, motivo, origen, usuario, timestamp, request_id.

## Regla 18 — Trazabilidad What If
Los escenarios no generan eventos oficiales.
Deben devolver un log simulado de acciones y resultados.

## Regla 19 — Idempotencia
Operaciones reales manuales requieren request_id.
Mismo payload => idempotente.
Mismo request_id distinto payload => IDEMPOTENCY_CONFLICT.

## Regla 20 — No doble descuento
Convertir reserva a compromiso por el mismo monto no altera saldo_disponible_gestion.
Liberar sí lo aumenta.
Reasignar sí lo reduce.
Nunca aplicar ambos efectos dos veces.

## APIs sugeridas
- releaseReserve(...)
- reassignReserve(...)
- keepReleasedFree(...)
- convertReserveToCommitment(...)
- cancelReserve(...)
- buildReserveView(...)
- simulateReserveScenario(...)
- ReserveError

## QA obligatorio

QA-RSV01 — Reserva activa visible.
QA-RSV02 — Originales intactos.
QA-RSV03 — Liberación parcial correcta.
QA-RSV04 — Liberación total correcta.
QA-RSV05 — No liberar más de bloqueado.
QA-RSV06 — Saldo gestión aumenta al liberar.
QA-RSV07 — Liberada persiste en historia.
QA-RSV08 — Mantener libre no reasigna automáticamente.
QA-RSV09 — Reasignación parcial.
QA-RSV10 — Reasignación total.
QA-RSV11 — No reasignar más de liberado.
QA-RSV12 — Saldo gestión baja al reasignar.
QA-RSV13 — Reserva→compromiso misma afectación.
QA-RSV14 — Conversión no cambia saldo gestión.
QA-RSV15 — Conversión con confirmado >0 rechazada.
QA-RSV16 — Anulación parcial.
QA-RSV17 — Anulación total.
QA-RSV18 — Estado correcto tras cada acción.
QA-RSV19 — Idempotencia release.
QA-RSV20 — Conflicto idempotencia.
QA-RSV21 — What If no muta estado.
QA-RSV22 — Secuencia release→reassign.
QA-RSV23 — Secuencia inválida se detiene.
QA-RSV24 — Comparación antes/después completa.
QA-RSV25 — Déficit cambia correctamente.
QA-RSV26 — Cobertura recalculada tras liberar.
QA-RSV27 — Cobertura recalculada tras reasignar.
QA-RSV28 — Postura recalculada sin mutación oficial.
QA-RSV29 — Restricciones siguen aplicando en escenario.
QA-RSV30 — FX puede mejorar en escenario sin mutar FX.
QA-RSV31 — Múltiples reservas independientes.
QA-RSV32 — No doble uso de monto liberado.
QA-RSV33 — Reasignación conserva trazabilidad.
QA-RSV34 — Conversión conserva need/affectation link.
QA-RSV35 — KEEP_RELEASED_FREE explicable.
QA-RSV36 — CANCEL no borra historia.
QA-RSV37 — Escenario determinístico.
QA-RSV38 — Snapshot persistente compatible.
QA-RSV39 — Sin ejecución bancaria/mandato.
QA-RSV40 — Sin UI/SIGRF.

## Regresión
Conservar 253/253 anteriores.
CODEX-008: 40.
Total esperado: **293/293 PASS**.

## Criterio de cierre
PASS si:
- 293/293;
- reservas liberadas persisten;
- no doble descuento;
- reserva→compromiso usa misma afectación;
- What If no muta estado;
- cobertura/FX/restricciones se reutilizan;
- no ejecución;
- no UI;
- no SIGRF.

## Entrega
1. archivos modificados;
2. APIs públicas;
3. QA exacto;
4. decisiones técnicas;
5. términos técnicos nuevos explicados;
6. bloqueos;
7. deuda técnica;
8. commit en liq-codex-008;
9. sin merge a main.

## Estado
LISTA PARA EJECUCIÓN.
