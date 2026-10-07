# LIQ-CODEX-008 — Implementación y evidencia

Fecha: 2026-10-07. Rama: liq-codex-008.
Contrato actualizado: f01320ca3f45811261955b7e90ec7477f50af9d1.

## Contrato de construcción

Objetivo: conservar el historial de las reservas y permitir escenarios What If sobre copias privadas, sin duplicar afectaciones ni descuentos.
Incluido: liberación, reasignación, mantenimiento libre, conversión, anulación, vista histórica y comparación de escenarios. Excluido: ejecución bancaria, mandatos, conciliación, cierre, UI y SIGRF.

Archivos creados: src/reserves.js, test/liq-codex-008.test.js y este documento. APIs públicas: ReserveError, releaseReserve, reassignReserve, keepReleasedFree, convertReserveToCommitment, cancelReserve, buildReserveView y simulateReserveScenario. Los cinco comandos reciben (state, row, request_id); la vista recibe (state, affectation_id); el escenario recibe (state, scenario, monetaryState).

Se reutilizan Posición para los efectos económicos, CODEX-003 para reclasificación, CODEX-004 para postura, CODEX-006/006A para cobertura y CODEX-005/005A para restricciones. FX se recalcula usando CODEX-007. No hay dependencias nuevas, otro almacenamiento ni migraciones destructivas.

No se alteran originales ni balances. El criterio de cierre es 40/40 casos nuevos y 253/253 anteriores: 293/293 PASS.

## Decisiones técnicas ya implementadas

- El detalle de reserva se deriva de la afectación y sus eventos. Los acumulados de liberación y reasignación no son otro saldo económico.
- Los importes de las operaciones se expresan en currency_original. Las comparaciones económicas usan VES desde Posición.
- Liberación y reasignación llaman AJUSTE de Posición. Una liberación total deja vigente cero sin anular la afectación, lo que permite su reactivación posterior.
- Se conserva la misma affectation_id y los originales. La vista puede mostrar LIBERADA mientras la afectación tiene ACTIVA con importe cero; no produce descuento ni localización activa.
- La reserva expone monto_liberado_disponible como liberado acumulado menos reasignado acumulado. Repetir ciclos no permite reutilizar dos veces ese importe.
- Las operaciones oficiales exigen motivo, origen, fecha_hora_evento y request_id; usuario sigue siendo opcional según la convención del repositorio. Se rechaza retroactividad.
- El escenario recibe scenario_id, empresa y acciones ordenadas. Cada acción se aplica a una copia privada y a una reserva de esa empresa. La primera acción inválida detiene la secuencia; no se publica una comparación posterior parcial.
- contexto_cobertura solicita el reporte existente de cobertura; capacidad_cobertura muestra su monto_cubierto. Sin esa solicitud se muestra null, no una estimación inventada. contexto_fx solicita el reporte FX existente. Son evaluaciones comparativas independientes, no órdenes conjuntas de ejecución.
- Las vistas antes/después incluyen Posición y postura. Los cálculos no cambian los eventos, restricciones, reservas bancarias ni FX oficiales.
- La conversión llama la reclasificación aprobada de CODEX-003 sobre el bloqueado vigente, conserva el vínculo need/affectation y no suma el liberado anterior al compromiso.
- La anulación llama ANULACION de Posición. monto_anulado_acumulado se reconstruye separadamente de las liberaciones y nunca aumenta el importe reasignable.
- Los estados terminales conservan sus acumulados, pero exponen monto_liberado_disponible = 0. Se rechazan operaciones con RESERVE_ALREADY_CONVERTED_TO_COMMITMENT o RESERVE_ALREADY_CANCELLED.
- Se aplica la precedencia explícita del contrato: una liberación histórica con bloqueado positivo produce PARCIALMENTE_LIBERADA, incluso tras reasignar todo; una anulación histórica con bloqueado positivo prevalece como PARCIALMENTE_ANULADA. La operación de reasignación permanece identificable en el historial aunque no sea la etiqueta visible.

## Decisiones funcionales resueltas

Las decisiones 7A, 9A y 9B del contrato citado resuelven los dos bloqueos anteriores. Aplicadas el 2026-10-07, con aprobación del propietario funcional mediante actualización del contrato:

- Conversión terminal sólo por el bloqueado actual; el liberado anterior queda histórico y no reactivable. Se descarta sumar ese libre al compromiso porque duplicaría decisiones económicas. Evidencia: QA-RSV13–15 y QA-RSV34.
- Anulación separada de liberación; parcial muestra PARCIALMENTE_ANULADA y total es terminal ANULADA. Se descarta usar lo anulado como liberado reasignable porque el contrato lo extingue. Evidencia: QA-RSV16–18 y QA-RSV36.

No se conservan aquellos dos BLOCKED_BY_FUNCTIONAL_RULE.

## BLOCKED_BY_FUNCTIONAL_RULE

Una consulta nueva, distinta de las anteriores: reserva 20 → anular 5 → liberar los 15 restantes. Queda bloqueado cero con anulación histórica. La precedencia define ANULADA si llega a cero por anulación y LIBERADA si llega a cero exclusivamente por liberación sin anulación; no define este recorrido mixto. Falta decidir si es terminal ANULADA o LIBERADA con sólo los 15 liberados reactivables.

Hasta resolución, ese recorrido falla con BLOCKED_BY_FUNCTIONAL_RULE de forma atómica, sin modificar el estado. La comprobación complementaria está en QA-RSV18. No se inventa la transición ni se declara cierre funcional completo.

## Evidencia de QA

Comando: node --test. Node.js v24.21.0.
Resultado: 293/293 PASS; fail 0; cancelled 0; skipped 0; todo 0.
Desglose: regresión anterior 253/253 y CODEX-008 40/40. Los 40 casos QA-RSV01 a QA-RSV40 pasan individualmente. Se verifican adicionalmente moneda USD sin alterar originales, retroactividad, entrada nula, ciclos de liberación/reasignación, persistencia terminal y rechazo no mutante del recorrido mixto pendiente.

| Orden | Resultado |
|---|---|
| CODEX-001 | 15/15 PASS |
| CODEX-002 | 20/20 PASS |
| CODEX-002A | 12/12 PASS |
| CODEX-003 | 25/25 PASS |
| CODEX-004 | 30/30 PASS |
| CODEX-005 | 40/40 PASS |
| CODEX-005A | 16/16 PASS |
| CODEX-006 | 40/40 PASS |
| CODEX-006A | 15/15 PASS |
| CODEX-007 | 40/40 PASS |
| CODEX-008 | 40/40 PASS |

## Glosario GOV-01.1

- What If: simulación de qué cambiaría si se aplicaran unas decisiones, sin aplicarlas oficialmente.
- API: función pública que permite usar el motor desde otro módulo.
- Copia privada: estado independiente que puede cambiar durante la simulación sin alterar el original.
- Acumulado: suma histórica de importes de una operación, aunque luego exista una operación de sentido contrario.
- Idempotencia: repetir una solicitud idéntica no duplica efectos ni eventos.
- Snapshot: copia completa del estado guardada por la persistencia existente.
- Regresión: pruebas de módulos anteriores para comprobar que siguen funcionando.
- Determinismo: los mismos datos de entrada producen el mismo resultado.
- Estado terminal: la reserva conserva su historia pero ya no permite operaciones de reactivación.
- Precedencia: orden explícito para elegir un único estado visible cuando coinciden varios antecedentes.
- Operación atómica: si falla, no se aplica ninguna modificación al estado recibido.

## Deuda y publicación

No hay deuda técnica nueva diferida identificada; queda la decisión funcional nueva indicada. La reconstrucción recorre los eventos existentes y no introduce índices persistidos; no se ha validado rendimiento con historiales de escala productiva. Se conserva la política monetaria anterior.
La publicación se limita a liq-codex-008. No se hace merge a main. El PASS de las pruebas no sustituye la resolución de la transición mixta pendiente ni autoriza avanzar a otro módulo.
