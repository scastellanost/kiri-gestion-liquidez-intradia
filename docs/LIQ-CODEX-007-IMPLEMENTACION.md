# LIQ-CODEX-007 — Implementación y evidencia

Fecha: 2026-10-07. Rama exclusiva: liq-codex-007.
Contrato aprobado: 391ec26e728b61ef1c91a75d37752c52afc637d1.

## Objetivo y alcance

Administrar FX T+1 como atributos de una obligación existente, sin nueva afectación ni segundo descuento. Incluye temporalidad, calendario, cobertura, restricciones, excepción temporal y recomposición. Excluye ejecución, mandatos, conciliación, cierre, UI e integración SIGRF. No hay cambios de dependencias ni migraciones destructivas.

Se reutilizan moneda (001), pendiente económico (002/002A), prioridad y rigidez (003), postura (004), restricciones y calendario (005/005A), cobertura (006/006A). No se duplican fórmulas de disponibilidad ni conversión.

## Archivos y APIs

- src/fx.js: nuevo motor; FxError, setFxObligation(state, row, request_id, monetaryState), clearFxObligation(state, row, request_id), buildFxPlan(state, fx_id, context, monetaryState), buildFxReport(state, context, monetaryState).
- src/bank-restrictions.js: getBankValueDate(state, selectors, negotiatedAt, zone) reutiliza precedencia por campo, calendario y ventanas temporales existentes.
- src/coverage.js: plan admite una solicitud explícita; createCoverageSimulation(state, monetaryState), releaseCoverageAllocation(simulation, affectation_id, amount), buildCoverageRequest(state, request, context, monetaryState, simulation). Estas funciones operan sobre una simulación privada; no alteran el estado oficial. Las APIs anteriores mantienen su comportamiento.
- test/liq-codex-007.test.js: 40 casos obligatorios, con comprobaciones complementarias dentro de sus casos correspondientes.
- docs/LIQ-CODEX-007-IMPLEMENTACION.md: esta evidencia y glosario.

setFxObligation también actualiza el mismo registro lógico. El estado añade fxObligations; los estados anteriores sin esa colección siguen siendo legibles. Se reutilizan events, receipts y la persistencia de snapshot existente.

El contexto de evaluación exige fecha_hora_evaluacion y settlement; la configuración exige zona_horaria. La cuenta destino FX puede informarse en configuración o contexto (cuenta_destino_fx); por_fx permite contextos particulares en un reporte. No se deduce una cuenta desde el banco negociador.

## Decisiones y trazabilidad

Las decisiones funcionales pendientes fueron resueltas por el propietario funcional en el contrato citado. No se conservan aquellos bloqueos.

1. Un FX activo por afectación y equivalente exactamente igual al pendiente completo. Se rechazan duplicados e importes contradictorios; se revalida al planificar si cambió el pendiente. Impacto: evita obligaciones duplicadas o importes desactualizados. Pruebas FX01, FX03 y FX05.
2. Fecha valor según calendario efectivo del negociador, cuenta > empresa+banco > banco. Sin calendario no se inventan exclusiones. Se reutilizan las reglas temporales y se valida settlement T1. Impacto: fecha valor explicable; se rechaza una fecha manual contradictoria. Pruebas FX08–FX10.
3. Recomposición del 100% mediante cobertura sobre capacidad restante, con restricciones y plazo, sin liberar capacidad de una tercera necesidad. Sólo una recomposición viable deja la excepción pendiente de aprobación. Impacto: la excepción no oculta un déficit ni cambia prioridades. Pruebas FX28–FX33.

Fecha de aplicación: 2026-10-07. Estado: decisiones aprobadas en el contrato indicado. Las alternativas de permitir varios FX, elegir un calendario independiente o aceptar una promesa de recomposición sin validación fueron descartadas por ese contrato.

Decisiones técnicas: la simulación comparte capacidad física y bancaria entre planes; libera una sola vez la localización de la misma obligación para evaluar su cobertura FX. En una excepción se ensaya sobre una copia y sólo se conserva el resultado viable. La cobertura intraempresa no descuenta disponibilidad consolidada; la interempresa conserva buffer y protección existentes. No se cambia el estado oficial durante la planificación. La localización en la cuenta destino explícita se identifica como LOCALIZACION_SIN_TRANSFERENCIA y pasa por las restricciones existentes.

## QA exacto

Comando ejecutado: node --test (Node.js v24.21.0).
Resultado: tests 253; pass 253; fail 0; cancelled 0; skipped 0; todo 0.
Regresión anterior: 213/213 PASS. CODEX-007: 40/40 PASS. Total: 253/253 PASS.

| Caso | Resultado | Comprobación |
|---|---|---|
| QA-FX01 | PASS | Vínculo, unicidad e importe completo |
| QA-FX02 | PASS | Afectación inexistente |
| QA-FX03 | PASS | Sin segunda afectación |
| QA-FX04 | PASS | Sin doble descuento |
| QA-FX05 | PASS | Conversión central y revalidación |
| QA-FX06 | PASS | Falta tasa |
| QA-FX07 | PASS | Banco válido |
| QA-FX08 | PASS | T+1 hábil y fecha contradictoria |
| QA-FX09 | PASS | Feriados y precedencia de calendario |
| QA-FX10 | PASS | Fin de semana y settlement negociador |
| QA-FX11 | PASS | ETA dentro del límite |
| QA-FX12 | PASS | ETA posterior bloqueada |
| QA-FX13 | PASS | Prioridad y rigidez separadas |
| QA-FX14 | PASS | Mismo banco primero |
| QA-FX15 | PASS | Otro banco propio |
| QA-FX16 | PASS | Intercompany mismo banco |
| QA-FX17 | PASS | Intercompany otro banco |
| QA-FX18 | PASS | Sin doble uso físico |
| QA-FX19 | PASS | Gap derivado |
| QA-FX20 | PASS | Sin cuentas configuradas |
| QA-FX21 | PASS | Cuenta destino explícita |
| QA-FX22 | PASS | Cutoff |
| QA-FX23 | PASS | Máximo diario |
| QA-FX24 | PASS | Aprobación adicional |
| QA-FX25 | PASS | Cobertura parcial |
| QA-FX26 | PASS | Sin cobertura |
| QA-FX27 | PASS | Cobertura completa |
| QA-FX28 | PASS | Excepción pendiente de aprobación |
| QA-FX29 | PASS | Prioridad preservada |
| QA-FX30 | PASS | Necesidad desplazada identificada |
| QA-FX31 | PASS | Recomposición no viable rechazada |
| QA-FX32 | PASS | Recomposición completa con ruta y plazo |
| QA-FX33 | PASS | Estado y postura intactos |
| QA-FX34 | PASS | Orden de múltiples FX |
| QA-FX35 | PASS | Capacidad compartida |
| QA-FX36 | PASS | Idempotencia y persistencia |
| QA-FX37 | PASS | Conflicto de solicitud |
| QA-FX38 | PASS | Eliminación trazable |
| QA-FX39 | PASS | Originales intactos |
| QA-FX40 | PASS | Sin ejecución ni módulos futuros |

## Glosario GOV-01.1

- API: función pública mediante la cual otro módulo usa el motor.
- FX: operación de cambio de moneda; aquí sólo se configura y propone su cobertura.
- T+1: siguiente jornada aplicable según el calendario efectivo.
- Settlement: plazo permitido de liquidación, T0 o T1.
- ETA: momento estimado de acreditación de una ruta.
- Cutoff: hora límite bancaria para operar.
- Gap FX: parte del importe requerido aún sin cobertura viable; no es otra obligación.
- Buffer: mínimo operativo protegido de la empresa que aporta fondos a otra.
- Intercompany: cobertura entre empresas diferentes.
- Simulación: cálculo sobre una copia de capacidades; no mueve dinero ni altera saldos oficiales.
- Recomposición: plan para restituir íntegramente la capacidad desplazada antes de su límite.
- Snapshot: copia completa del estado utilizada por la persistencia existente.
- Idempotencia: repetir una solicitud idéntica no duplica sus efectos.
- Regresión: ejecutar pruebas anteriores para comprobar que siguen funcionando.
- Commit: versión identificable de los archivos en Git.

## Bloqueos y deuda técnica

BLOCKED_BY_FUNCTIONAL_RULE: ninguno pendiente. Las tres decisiones anteriores están implementadas.
Deuda técnica nueva conocida: ninguna diferida para cumplir este contrato. Se conserva la representación numérica aprobada por CODEX-001, sin introducir otra política de redondeo. La validación se limita a los escenarios contractuales y complementarios; no constituye una prueba de carga a escala productiva.
No se hizo merge a main. Esta orden no autoriza avanzar a módulos futuros.
