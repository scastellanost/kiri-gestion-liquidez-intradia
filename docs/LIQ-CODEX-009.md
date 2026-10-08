# LIQ-CODEX-009 — Mandatos de Liquidez

## Gobierno obligatorio
Antes de implementar, leer y aplicar:
- README.md
- docs/PROTOCOLO_CODEX.md
- todos los contratos LIQ-CODEX-001 a LIQ-CODEX-008.

Hereda GOV-01 y GOV-01.1.

## Objetivo
Implementar el motor de Mandatos como capa formal de decisión entre una propuesta de cobertura/FX/What If aprobada y una futura ejecución bancaria.

## Principio rector
Cobertura propone.
Tesorería decide.
Mandato formaliza la decisión.
Este módulo NO ejecuta movimientos bancarios.

Un mandato tampoco crea una segunda obligación económica.

## Alcance
Implementar:
- creación de mandato a partir de una necesidad/afectación existente;
- una o varias instrucciones/tramos;
- fuente y destino explícitos;
- importe;
- moneda;
- motivo y origen;
- vínculo a plan de cobertura o FX cuando corresponda;
- validación de capacidad y restricciones al momento de creación/aprobación;
- flujo de estado;
- aprobación/rechazo/cancelación/expiración;
- trazabilidad;
- idempotencia;
- reporte de mandatos;
- reserva conceptual de capacidad bancaria sólo si el mandato queda APROBADO, reutilizando CODEX-005;
- no ejecución bancaria.

## Fuera de alcance
NO implementar:
- transferencia real;
- compra FX real;
- conciliación bancaria;
- confirmación de ejecución;
- cierre D+1;
- UI;
- SIGRF.

## Regla 1 — Naturaleza del mandato
El mandato es una instrucción operativa autorizable sobre una obligación ya existente.
Debe referenciar:
- mandate_id;
- affectation_id;
- empresa_destino;
- motivo;
- origen;
- fecha_hora_evento.

No crea afectación ni necesidad nueva.

## Regla 2 — Fuente de origen del mandato
Puede originarse en:
- COVERAGE_PLAN;
- FX_PLAN;
- MANUAL.

Si viene de COVERAGE_PLAN o FX_PLAN debe conservar referencias suficientes para trazabilidad.

MANUAL no puede inventar economía: debe apuntar igualmente a una affectation_id existente.

## Regla 3 — Estados
Estados mínimos:
- BORRADOR
- PENDIENTE_APROBACION
- APROBADO
- RECHAZADO
- CANCELADO
- EXPIRADO

No existe EJECUTADO en CODEX-009.

## Regla 4 — Transiciones
Permitidas:
- BORRADOR → PENDIENTE_APROBACION
- PENDIENTE_APROBACION → APROBADO
- PENDIENTE_APROBACION → RECHAZADO
- BORRADOR → CANCELADO
- PENDIENTE_APROBACION → CANCELADO
- APROBADO → CANCELADO sólo antes de ejecución futura y liberando reservas conceptuales
- BORRADOR/PENDIENTE/APROBADO → EXPIRADO cuando vence su fecha límite sin ejecución futura

No reabrir RECHAZADO/CANCELADO/EXPIRADO.
Una nueva decisión requiere un nuevo mandate_id.

## Regla 5 — Tramos
Cada mandato contiene 1..N tramos:
- empresa_fuente;
- banco_fuente;
- cuenta_fuente;
- empresa_destino;
- banco_destino;
- cuenta_destino opcional pero explícita cuando sea necesaria;
- monto_ves;
- moneda_operacion;
- monto_operacion;
- settlement;
- fecha_hora_objetivo;
- restricciones;
- acciones_requeridas.

No permitir monto <= 0.

## Regla 6 — Correspondencia económica
La suma de tramos del mandato no puede superar el pendiente económico vigente de la afectación.
No volver a descontar la obligación en Posición.

## Regla 7 — Cobertura/FX como evidencia, no ejecución
Un plan previo puede alimentar el mandato, pero:
- el mandato debe copiar/guardar una instantánea suficiente de los tramos aprobados;
- no depender de que el plan pueda reconstruirse idéntico en el futuro;
- debe revalidarse contra estado vigente antes de aprobación.

## Regla 8 — Revalidación
Al pasar a APROBADO:
- afectación debe seguir activa;
- pendiente debe seguir siendo suficiente;
- fuente debe conservar capacidad;
- buffer intercompany debe seguir protegido;
- restricciones bancarias deben seguir permitiendo la ruta;
- ETA debe cumplir deadline;
- cuenta/banco deben seguir válidos.

Si algo cambió: no aprobar y devolver motivo estable.

## Regla 9 — Capacidad física
No duplicar capacidad física entre mandatos APROBADOS.

Un mandato BORRADOR/PENDIENTE no consume capacidad oficial.
Un mandato APROBADO sí debe reservar conceptualmente la capacidad necesaria para evitar que otro mandato aprobado use el mismo saldo.

## Regla 10 — Capacidad bancaria
Al aprobar:
- reservar capacidad bancaria usando el mecanismo de CODEX-005;
- no registrar uso ejecutado;
- no inventar confirmación bancaria.

Al cancelar/expirar un APROBADO:
- liberar la reserva bancaria asociada.

## Regla 11 — Reserva conceptual de liquidez
Además de la reserva bancaria, el motor debe impedir doble asignación de la misma capacidad física entre mandatos aprobados.

Esto es control de decisión, no movimiento económico.
No altera saldo bancario ni Posición.

## Regla 12 — Intercompany
Un mandato intercompany sólo es aprobable si la empresa fuente conserva su buffer y no entra en déficit.
Reutilizar CODEX-006/006A; no duplicar fórmula.

## Regla 13 — FX
Un mandato derivado de FX:
- conserva fx_id;
- banco_negociador;
- fecha_valor;
- hora crítica;
- no crea otra obligación;
- no ejecuta compra FX.

Si el plan FX está PENDIENTE_APROBACION_EXCEPCION, el mandato no puede aprobarse hasta que la excepción esté expresamente autorizada en el contexto permitido.

## Regla 14 — Aprobación adicional bancaria
Si CODEX-005 exige aprobación adicional:
- el mandato puede quedar PENDIENTE_APROBACION;
- no puede marcarse APROBADO sin evidencia/flag explícito de esa aprobación.

No inventar aprobadores ni jerarquías corporativas.

## Regla 15 — Fecha límite y expiración
Todo mandato debe tener fecha_hora_limite.
Si el momento de evaluación es posterior:
- no puede aprobarse;
- si estaba BORRADOR/PENDIENTE/APROBADO, puede derivarse/registrarse EXPIRADO conforme a una operación explícita o evaluación de estado.

No usar reloj del sistema; timestamp siempre explícito.

## Regla 16 — Aprobación funcional
La aprobación del mandato requiere:
- usuario/aprobador explícito;
- fecha_hora_aprobacion;
- origen;
- request_id.

No definir cargos ni niveles de autorización en esta fase.

## Regla 17 — Rechazo/cancelación
Requiere motivo explícito.
Conservar before/after.
No borrar mandato.

## Regla 18 — Idempotencia
Operaciones manuales requieren request_id.
Mismo payload => idempotente.
Mismo request_id distinto payload => IDEMPOTENCY_CONFLICT.

## Regla 19 — Trazabilidad
Eventos:
- CREATE_MANDATE
- SUBMIT_MANDATE
- APPROVE_MANDATE
- REJECT_MANDATE
- CANCEL_MANDATE
- EXPIRE_MANDATE

Con:
- mandate_id;
- affectation_id;
- before/after;
- usuario;
- origen;
- timestamp;
- motivo cuando aplique;
- request_id.

## Regla 20 — Inmutabilidad de aprobado
Una vez APROBADO:
- no editar tramos, importe, fuente, destino, moneda, deadline;
- cualquier cambio requiere cancelar y crear nuevo mandato.

## Regla 21 — Reporte
Exponer:
- mandate_id;
- affectation_id;
- fx_id si aplica;
- empresa destino;
- origen funcional;
- estado;
- importe total VES;
- tramos;
- restricciones;
- acciones requeridas;
- fecha límite;
- aprobador;
- fecha aprobación;
- reservas bancarias asociadas;
- capacidad física reservada;
- explicación.

## Regla 22 — No ejecución
APPROVED significa “autorizado para ejecutar”, no “ejecutado”.
No cambiar:
- balances;
- monto_reflejado_confirmado;
- pendiente económico;
- afectaciones;
- necesidades.

## APIs sugeridas
- createMandate(...)
- submitMandate(...)
- approveMandate(...)
- rejectMandate(...)
- cancelMandate(...)
- expireMandate(...)
- buildMandateView(...)
- buildMandateReport(...)
- MandateError

## QA obligatorio
QA-MND01 — Crear mandato manual con afectación válida.
QA-MND02 — Afectación inexistente rechazada.
QA-MND03 — No crea nueva afectación/necesidad.
QA-MND04 — 1..N tramos válidos.
QA-MND05 — Monto total no supera pendiente.
QA-MND06 — BORRADOR no reserva capacidad.
QA-MND07 — Submit cambia a PENDIENTE.
QA-MND08 — Aprobar revalida afectación activa.
QA-MND09 — Aprobar revalida pendiente.
QA-MND10 — Aprobar revalida capacidad física.
QA-MND11 — Aprobar revalida buffer intercompany.
QA-MND12 — Aprobar revalida restricciones.
QA-MND13 — ETA posterior a deadline bloquea.
QA-MND14 — Aprobación adicional bancaria requerida.
QA-MND15 — Aprobación adicional explícita permite continuar.
QA-MND16 — APROBADO reserva capacidad bancaria.
QA-MND17 — APROBADO reserva capacidad física conceptual.
QA-MND18 — Segundo mandato no duplica capacidad física.
QA-MND19 — Segundo mandato respeta capacidad bancaria reservada.
QA-MND20 — Cancelar APROBADO libera reservas.
QA-MND21 — Expirar APROBADO libera reservas.
QA-MND22 — Rechazar no reserva capacidad.
QA-MND23 — Rechazado no reabrible.
QA-MND24 — Cancelado no reabrible.
QA-MND25 — Expirado no reabrible.
QA-MND26 — Aprobado inmutable.
QA-MND27 — Cambio exige nuevo mandate_id.
QA-MND28 — Derivado de coverage conserva trazabilidad.
QA-MND29 — Derivado de FX conserva fx_id/valor/hora crítica.
QA-MND30 — FX con excepción no autorizada no aprobable.
QA-MND31 — No doble descuento económico.
QA-MND32 — Posición oficial intacta.
QA-MND33 — Postura oficial intacta salvo reserva conceptual separada.
QA-MND34 — Balances intactos.
QA-MND35 — Confirmado/reflejado intacto.
QA-MND36 — Idempotencia CREATE/APPROVE.
QA-MND37 — Conflicto de request_id.
QA-MND38 — Reporte determinístico.
QA-MND39 — Snapshot compatible.
QA-MND40 — Sin ejecución bancaria/UI/SIGRF.

## Regresión
Conservar 293/293 anteriores.
CODEX-009: 40.
Total esperado: **333/333 PASS**.

## Criterio de cierre
PASS si:
- 333/333;
- Mandato no crea economía nueva;
- aprobación revalida estado actual;
- APROBADO reserva capacidad sin ejecutar;
- no doble uso físico/bancario;
- cancelación/expiración libera reservas;
- aprobado es inmutable;
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
8. commit en liq-codex-009;
9. sin merge a main.

## Estado
LISTA PARA EJECUCIÓN.
