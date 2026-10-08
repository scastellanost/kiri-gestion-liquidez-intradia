# LIQ-CODEX-009 — Mandatos de Liquidez

Fecha: 2026-10-08. Rama exclusiva: liq-codex-009.
Contrato base: b284746ec8378677922f968aa9260542c0aa7c72.

## Contrato de construcción

Objetivo: formalizar decisiones sobre obligaciones existentes sin ejecutar movimientos ni crear otra economía. Incluye tramos explícitos, estados, aprobación con revalidación, reservas conceptuales, cancelación, expiración, rechazo, trazabilidad e idempotencia. Excluye ejecución bancaria, compra FX, conciliación, confirmaciones, cierre, UI y SIGRF.

Dependencias: moneda CODEX-001, pendiente CODEX-002/002A, vínculos CODEX-003, postura CODEX-004, restricciones y reservas bancarias CODEX-005/005A, capacidad y buffer CODEX-006/006A, contexto FX CODEX-007 y persistencia compartida con CODEX-008. Los contratos anteriores se mantienen; la rama base añade únicamente el contrato 009 frente a la implementación aprobada anterior.

El criterio técnico es 40 casos nuevos más 293 anteriores: 333/333 PASS. Permanecen dos decisiones funcionales detalladas más abajo; el PASS no las resuelve.

## Archivos y APIs

- src/mandates.js: createMandate, submitMandate, approveMandate, rejectMandate, cancelMandate, expireMandate, buildMandateView, buildMandateReport y MandateError.
- src/coverage.js: validateCoverageInstructions reutiliza capacidad, protección del buffer y evaluación bancaria para instrucciones explícitas, sin seleccionar fuentes alternativas.
- test/liq-codex-009.test.js: 40 QA con comprobaciones adicionales de no mutación y capacidad compartida.
- docs/LIQ-CODEX-009-IMPLEMENTACION.md: decisiones, evidencia y glosario.

createMandate/approveMandate reciben (state, row, request_id, monetaryState). Las demás operaciones reciben (state, row, request_id). buildMandateView recibe (state, mandate_id), y buildMandateReport recibe (state).

Se añade state.mandates sólo al crear el primer mandato. Estados anteriores sin esa colección siguen siendo compatibles. Los eventos y comprobantes de idempotencia usan las colecciones existentes. Se reutiliza el snapshot completo existente, sin nuevas dependencias ni migraciones destructivas.

## Decisiones técnicas

1. La creación valida fuentes, destinos, importes, moneda y reglas vigentes; conserva BORRADOR sin reservar. Submit sólo cambia a PENDIENTE_APROBACION.
2. La aprobación vuelve a comprobar el pendiente, cuentas, capacidad física, buffer, restricciones y ETA con fecha_hora_aprobacion explícita. Requiere usuario y aprobador explícitos. El contexto aporta zona_horaria y, si corresponde, aprobacion_bancaria_adicional = true. Esa autorización queda registrada.
3. Las reservas bancarias se crean con reserveBankCapacity de CODEX-005; nunca se incrementa uso ejecutado. Cada reserva tiene una identidad estable asociada al mandato y al tramo.
4. La capacidad física se conserva separadamente dentro del mandato. Sólo los APROBADOS la consumen en validaciones futuras. La simulación evita descontar dos veces el soporte que ya está localizado por postura para otra obligación.
5. Las cesiones entre empresas consumen capacidad cedible simulada mediante CODEX-006/006A. Las movilizaciones internas no vuelven a reducir disponibilidad consolidada.
6. Cancelar o expirar usa releaseBankCapacity. La capacidad física deja de estar activa por el estado del mandato; el historial anterior permanece. La expiración es explícita, con timestamp posterior al límite; el reporte no usa el reloj ni cambia estados automáticamente.
7. Los tramos se conservan como instantánea. La revalidación de aprobación se registra aparte; no reescribe las instrucciones. No hay API de edición: cancelar y crear otro ID es la vía de cambio.
8. Los planes de Cobertura/FX se copian como evidencia y sus tramos deben corresponder con las instrucciones. FX conserva identidad, negociador, fecha valor y hora crítica. Una fecha crítica o configuración FX cambiada exige una nueva decisión.
9. La excepción FX no autorizada devuelve FX_EXCEPTION_AUTHORIZATION_REQUIRED. Su recomposición se revalida con el motor FX existente; autorizar la excepción sigue sujeto al bloqueo funcional indicado abajo.
10. Ningún camino cambia balances, afectaciones, necesidades, pendiente, confirmado/reflejado ni configuración de postura. No existen estados EJECUTADO ni integración bancaria.

## BLOCKED_BY_FUNCTIONAL_RULE

Consultados al propietario funcional el 2026-10-08, sin respuesta al preparar esta entrega:

1. **Total aprobado por afectación.** La regla 6 limita la suma de tramos de cada mandato, pero no fija expresamente la suma de varios mandatos aprobados sobre la misma obligación. Si aprobar otro superaría el pendiente conjunto, se detiene con BLOCKED_BY_FUNCTIONAL_RULE. Falta decidir si el límite debe aplicarse conjuntamente o sólo por mandato. No se aprueba silenciosamente el exceso.
2. **Reserva de recomposición FX.** El contrato exige autorización explícita de una excepción, pero no determina si esa aprobación debe reservar también las rutas que reponen la capacidad de las necesidades desplazadas. Con excepción autorizada se devuelve BLOCKED_BY_FUNCTIONAL_RULE antes de reservar. Falta decidir entre reservar FX y recomposición o sólo las instrucciones FX.

No se inventan estas reglas. Los escenarios ordinarios están implementados; no se declara cierre funcional completo mientras persistan estos dos puntos. Las comprobaciones complementarias en QA-MND18 y QA-MND30 verifican que se detienen sin aprobación.

## QA exacto

Comando: node --test, Node.js v24.21.0.
tests 333; pass 333; fail 0; cancelled 0; skipped 0; todo 0.
Regresión anterior: 293/293 PASS. CODEX-009: 40/40 PASS.

| Caso | Resultado | Evidencia |
|---|---|---|
| QA-MND01 | PASS | Alta manual válida |
| QA-MND02 | PASS | Afectación inexistente |
| QA-MND03 | PASS | Sin nueva obligación |
| QA-MND04 | PASS | Uno o varios tramos, importes positivos |
| QA-MND05 | PASS | Total frente al pendiente |
| QA-MND06 | PASS | Borrador sin reservas |
| QA-MND07 | PASS | Envío a aprobación |
| QA-MND08 | PASS | Revalidación de estado activo |
| QA-MND09 | PASS | Revalidación del pendiente |
| QA-MND10 | PASS | Revalidación física |
| QA-MND11 | PASS | Protección de buffer |
| QA-MND12 | PASS | Restricciones actuales |
| QA-MND13 | PASS | ETA fuera de plazo |
| QA-MND14 | PASS | Aprobación adicional requerida |
| QA-MND15 | PASS | Evidencia explícita adicional |
| QA-MND16 | PASS | Reserva bancaria sin uso ejecutado |
| QA-MND17 | PASS | Reserva física conceptual |
| QA-MND18 | PASS | Sin doble capacidad física |
| QA-MND19 | PASS | Reserva bancaria compartida |
| QA-MND20 | PASS | Cancelación libera capacidad |
| QA-MND21 | PASS | Expiración libera capacidad |
| QA-MND22 | PASS | Rechazo sin reservas |
| QA-MND23 | PASS | Rechazado no reabrible |
| QA-MND24 | PASS | Cancelado no reabrible |
| QA-MND25 | PASS | Expirado no reabrible |
| QA-MND26 | PASS | Inmutabilidad de aprobado |
| QA-MND27 | PASS | Nuevo ID para nueva decisión |
| QA-MND28 | PASS | Evidencia de Cobertura |
| QA-MND29 | PASS | Datos FX preservados |
| QA-MND30 | PASS | Excepción FX sin autorización |
| QA-MND31 | PASS | Sin segundo descuento |
| QA-MND32 | PASS | Posición intacta |
| QA-MND33 | PASS | Postura intacta |
| QA-MND34 | PASS | Balances intactos |
| QA-MND35 | PASS | Confirmado y pendiente intactos |
| QA-MND36 | PASS | Idempotencia de alta/aprobación |
| QA-MND37 | PASS | Conflicto de solicitud |
| QA-MND38 | PASS | Reporte determinístico |
| QA-MND39 | PASS | Persistencia compatible |
| QA-MND40 | PASS | Sin ejecución, UI ni SIGRF |

## Glosario GOV-01.1

- Mandato: decisión formal autorizable sobre una obligación existente.
- Reserva conceptual física: capacidad de una cuenta apartada para evitar aprobarla dos veces; no mueve dinero ni reduce Posición.
- Reserva bancaria: importe y número de operaciones apartados contra los límites bancarios, sin registrar ejecución.
- Instantánea: copia de la propuesta tal como se decidió, conservada aunque cambien los datos posteriores.
- Revalidación: comprobar nuevamente con la información vigente antes de aprobar.
- Buffer: mínimo operativo protegido de la empresa que aporta fondos a otra.
- ETA: momento estimado de acreditación.
- Deadline: fecha y hora límite de una instrucción.
- API: función pública mediante la cual otros módulos usan el motor.
- Idempotencia: repetir una solicitud idéntica no duplica sus efectos.
- Snapshot: copia completa del estado usada para guardar y recargar.
- Regresión: ejecución de pruebas anteriores para detectar cambios no deseados.

## Deuda y publicación

No se difiere deuda técnica nueva identificada para los recorridos implementados. Persisten los bloqueos funcionales indicados. Las validaciones reconstruyen postura y revisan reservas aprobadas; no se han realizado pruebas de rendimiento a escala productiva. La política monetaria sigue siendo la de CODEX-001.

Publicación exclusiva en liq-codex-009, sin merge a main. No se avanza a conciliación ni a órdenes posteriores.
