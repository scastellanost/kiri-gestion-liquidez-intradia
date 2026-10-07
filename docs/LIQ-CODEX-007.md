# LIQ-CODEX-007 — Motor FX T+1

## Gobierno obligatorio
Antes de implementar, leer y aplicar íntegramente:
- README.md
- docs/PROTOCOLO_CODEX.md
- docs/LIQ-CODEX-001.md
- docs/LIQ-CODEX-002.md
- docs/LIQ-CODEX-002A.md
- docs/LIQ-CODEX-003.md
- docs/LIQ-CODEX-004.md
- docs/LIQ-CODEX-005.md
- docs/LIQ-CODEX-005A.md
- docs/LIQ-CODEX-006.md
- docs/LIQ-CODEX-006A.md

Este trabajo hereda GOV-01 y GOV-01.1.

## Objetivo
Implementar el motor específico de obligaciones FX T+1 para:
- identificar y administrar una obligación de compra de divisas;
- asociarla a una necesidad económica existente;
- definir banco negociador, fecha valor y hora crítica;
- evaluar cobertura propia y alternativas;
- respetar restricciones bancarias y calendario;
- exponer gap y recomposición;
- evitar doble descuento económico.

## Principio rector
FX T+1 NO crea una segunda obligación económica.

La obligación FX es la misma necesidad ya reconocida en Posición/Necesidades.
El motor FX agrega atributos, temporalidad, ruta, negociación y cobertura; no vuelve a descontar el importe.

## Alcance
Implementar:
- entidad/configuración FX ligada a una afectación/necesidad existente;
- banco negociador;
- moneda comprada;
- importe de divisa;
- equivalente económico en VES;
- fecha de negociación;
- fecha valor;
- hora crítica;
- prioridad/rigidez heredada;
- evaluación de cobertura localizada;
- alternativas de misma empresa;
- uso de CODEX-006 para cobertura externa cuando corresponda;
- evaluación de restricciones CODEX-005/005A;
- gap FX;
- excepción temporal gobernada;
- recomposición de necesidades desplazadas;
- trazabilidad e idempotencia;
- salida ejecutiva explicable.

## No tocar
NO implementar:
- ejecución real de compra FX;
- integración con banco;
- órdenes/mandatos reales;
- conciliación posterior;
- cierre D+1;
- UI;
- SIGRF.

## Regla 1 — Vínculo económico único
Todo registro FX debe referenciar:
- affectation_id obligatorio;
- need_id activo vinculado cuando exista.

La afectación debe existir y pertenecer a una empresa válida.

No crear otra afectación para “COMPRA_FX”.
No descontar el monto FX nuevamente en Posición.

### Decisión funcional 1A — Unicidad FX por afectación
Se permite **un solo registro FX ACTIVO por affectation_id**.

- Una misma afectación no puede tener dos FX activos simultáneos.
- Si se necesita modificar monto, banco, fecha o atributos del FX, se actualiza el mismo registro lógico o se reemplaza de forma trazable; no se crea un segundo FX activo.
- Si existe otro FX activo para la misma afectación: `DUPLICATE_ACTIVE_FX_FOR_AFFECTATION`.
- Tramos parciales de negociación o cobertura pertenecen al plan/rutas del mismo FX; no crean nuevas obligaciones FX económicas.

## Regla 2 — Importe FX
Registrar:
- moneda_objetivo
- monto_divisa
- equivalente_ves

El equivalente_ves debe derivarse del motor monetario aprobado.
No aceptar equivalentes manuales contradictorios.

Originales se preservan.

### Decisión funcional 1B — Correspondencia con pendiente económico
El FX representa **el pendiente económico completo de la afectación en ese momento**.

Por tanto:
- `equivalente_ves` derivado de `monto_divisa` debe coincidir con el pendiente económico vigente de la afectación expresado en VES;
- no se permite que el registro FX represente un importe mayor o menor que ese pendiente;
- si no coincide: `FX_AMOUNT_PENDING_MISMATCH`;
- una cobertura parcial es válida como resultado del plan FX, pero no convierte al registro FX en una obligación parcial distinta;
- si el pendiente de la afectación cambia posteriormente, el FX debe actualizarse/revalidarse antes de publicarse como vigente.

No se introduce una nueva política de redondeo; se usa la representación monetaria ya aprobada por CODEX-001.

## Regla 3 — Banco negociador
Campo obligatorio:
- banco_negociador

Debe existir en catálogo.

Banco negociador no significa necesariamente que toda la cobertura propia ya esté localizada allí.
El motor debe mostrar cuánto existe en ese banco y cuánto falta llevar.

## Regla 4 — Fecha negociación / valor
Campos:
- fecha_hora_negociacion
- fecha_valor

T+1 significa que la liquidación/valor ocurre en la siguiente jornada hábil aplicable al contrato de restricción/calendario.

No interpretar T+1 como “mañana calendario” si es inhábil.

### Decisión funcional 2 — Calendario aplicable a T+1
La fecha valor se calcula con el **calendario efectivo del banco negociador**.

Precedencia:
1. regla específica de cuenta destino FX, si `cuenta_destino_fx` fue informada;
2. regla empresa+banco;
3. regla banco;
4. ausencia de calendario configurado = no existen exclusiones adicionales conocidas; el siguiente día calendario es el siguiente día aplicable.

Se reutiliza la precedencia por campo de CODEX-005/005A.

La evaluación debe usar:
- zona horaria explícita;
- `dias_habiles_semana`;
- `feriados`;
- ventanas nocturnas/DST ya resueltos;
- settlement T1 efectivo del banco negociador.

La `fecha_valor` suministrada debe coincidir con la fecha calculada por estas reglas. Si contradice el calendario efectivo: `FX_VALUE_DATE_MISMATCH`.

## Regla 5 — Hora crítica
Campo:
- hora_critica o fecha_hora_critica

Representa el último instante operativo para tener la cobertura lista.

Debe compararse con:
- ETA de rutas;
- cutoff;
- apertura;
- settlement;
- calendario.

## Regla 6 — Rigidez temporal
Una obligación FX T+1 puede ser temporalmente rígida.

No cambiar silenciosamente prioridad económica.
Distinguir:
- prioridad económica;
- rigidez temporal;
- criticidad horaria FX.

## Regla 7 — Cobertura propia localizada
Primero determinar:
- monto ya localizado en banco negociador;
- monto localizado en otros bancos de la misma empresa;
- capacidad física libre propia;
- residual.

No volver a descontar disponibilidad consolidada de la empresa.

## Regla 8 — Jerarquía de cobertura FX
Aplicar, en esencia:
1. misma empresa / banco negociador;
2. misma empresa / otros bancos;
3. otra empresa / banco negociador;
4. otra empresa / otros bancos.

Reutilizar CODEX-006, no duplicar su lógica.

## Regla 9 — Restricciones
Toda ruta propuesta debe pasar por CODEX-005/005A.

No ignorar:
- cutoff;
- apertura;
- max diario;
- max operaciones;
- settlement;
- días hábiles;
- feriados;
- aprobación adicional;
- ETA.

## Regla 10 — Gap FX
Definir:
gap_fx = monto_requerido_ves - monto_cubierto_viable_ves

Nunca crear una necesidad “DEFICIT_FX” adicional.

## Regla 11 — Excepción temporal
Si una obligación FX tiene una hora crítica anterior a otra necesidad económicamente más prioritaria pero flexible/posterior, puede proponerse una excepción temporal.

La excepción:
- NO cambia automáticamente la prioridad económica;
- debe quedar explícita;
- debe indicar necesidad desplazada;
- debe indicar motivo;
- debe incluir plan de recomposición;
- requiere aprobación explícita de Tesorería/Líder Funcional en una fase posterior.

## Regla 12 — Recomposición
Si para cubrir FX se usa capacidad que estaba potencialmente disponible para otra necesidad:
- identificar la necesidad desplazada;
- cuantificar monto afectado;
- indicar cuándo/cómo se recompone;
- si no existe recomposición viable, no declarar la excepción aceptable.

No crear movimientos reales.

### Decisión funcional 3 — Datos y validación del plan de recomposición
Por cada necesidad desplazada, la excepción temporal debe registrar como mínimo:
- `need_id_desplazada`;
- `monto_desplazado_ves`;
- `fecha_hora_limite_recomposicion`.

Reglas:
- si la necesidad desplazada ya tiene `fecha_hora_objetivo`, esa fecha es el límite máximo y no puede ser ampliada por el FX;
- si no tiene fecha objetivo, `fecha_hora_limite_recomposicion` debe venir explícita; el motor no la inventa;
- el `monto_desplazado_ves` no puede exceder el pendiente económico de la necesidad desplazada;
- el “cómo” se obtiene ejecutando una **simulación de cobertura CODEX-006/006A sobre la capacidad remanente después de reservar conceptualmente la capacidad usada por FX**;
- la recomposición es `VIABLE` únicamente si esa simulación cubre el 100% del monto desplazado, respeta restricciones bancarias, llega antes o en el límite de recomposición y no crea déficit ni desplaza otra necesidad;
- una recomposición parcial, bloqueada, sin ruta o que dependa de otra excepción no resuelta se considera `NO_VIABLE`;
- la excepción FX solo puede quedar en `PENDIENTE_APROBACION_EXCEPCION` si la recomposición es viable;
- sin recomposición viable, el estado debe permanecer bloqueado/no aceptable y no presentarse como excepción lista para aprobación.

La salida de recomposición debe incluir:
- need_id_desplazada;
- monto_desplazado_ves;
- fecha_hora_limite_recomposicion;
- estado_recomposicion;
- monto_recompuesto;
- residual_recomposicion;
- rutas_recomposicion;
- restricciones;
- ETA máxima;
- explicación.

## Regla 13 — Estado FX
Estados mínimos:
- CONFIGURADA
- COBERTURA_COMPLETA
- COBERTURA_PARCIAL
- SIN_COBERTURA
- BLOQUEADA_POR_RESTRICCION
- PENDIENTE_APROBACION_EXCEPCION

No inferir EJECUTADA en este módulo.

## Regla 14 — Salida
Exponer como mínimo:
- fx_id
- affectation_id
- need_id
- empresa
- moneda_objetivo
- monto_divisa
- equivalente_ves
- banco_negociador
- fecha_hora_negociacion
- fecha_valor
- fecha_hora_critica
- prioridad_economica
- rigidez_temporal
- monto_localizado_banco_negociador
- monto_localizado_otros_bancos_propios
- monto_cobertura_intercompany
- monto_cubierto_total
- gap_fx
- estado
- rutas
- restricciones
- excepcion_temporal
- recomposicion
- explicacion

## Regla 15 — Fuente de tasas
Usar exclusivamente CODEX-001.

Si falta tasa:
- FX no publicable;
- no asumir tasa;
- no usar equivalente parcial.

## Regla 16 — Banco negociador sin cuentas configuradas
Si no existe orden de cuentas para el banco negociador:
- mostrar cobertura localizada = 0;
- no inventar cuenta destino;
- puede seguir evaluándose cobertura desde otros bancos si existe contexto suficiente.

## Regla 17 — Cuenta destino FX
Si la operación requiere una cuenta concreta en banco negociador:
- debe venir explícita en el contexto/configuración;
- no inventarla desde postura.

## Regla 18 — No doble uso
Capacidad usada en el plan FX:
- no puede aparecer duplicada en dos rutas del mismo plan;
- en reporte multi-FX, debe compartirse simulación como en CODEX-006.

## Regla 19 — Múltiples FX
Ordenar por:
1. rigidez temporal;
2. fecha_hora_critica;
3. prioridad económica;
4. fecha_hora_evento;
5. fx_id.

No inventar una prioridad FX distinta.

## Regla 20 — Idempotencia
Operaciones manuales:
- setFxObligation
- clearFxObligation
- updateFxObligation (si se decide API separada)

requieren request_id.

Mismo payload => idempotente.
Mismo request_id distinto payload => IDEMPOTENCY_CONFLICT.

## Regla 21 — Trazabilidad
Eventos:
- SET_FX_OBLIGATION
- CLEAR_FX_OBLIGATION

Con:
- before/after
- fx_id
- affectation_id
- empresa
- origen
- usuario
- timestamp
- request_id

## Regla 22 — Persistencia
Reutilizar snapshot existente.
No crear almacenamiento paralelo.

## APIs sugeridas
- setFxObligation(...)
- clearFxObligation(...)
- buildFxPlan(...)
- buildFxReport(...)
- FxError

Codex puede renombrar si preserva contrato.

## QA obligatorio

### QA-FX01 — Vínculo obligatorio
FX sin affectation_id => ERROR.

Validación complementaria obligatoria:
- segundo FX activo para la misma afectación => DUPLICATE_ACTIVE_FX_FOR_AFFECTATION;
- equivalente_ves distinto del pendiente económico => FX_AMOUNT_PENDING_MISMATCH.

### QA-FX02 — Afectación inexistente
=> ERROR.

### QA-FX03 — No crea segunda afectación
Configurar FX no aumenta state.affectations.

### QA-FX04 — No doble descuento
Posición empresa antes/después de configurar FX idéntica.

### QA-FX05 — Conversión
Monto USD convertido a VES por CODEX-001.

### QA-FX06 — Falta tasa
No publicable / MISSING_EXCHANGE_RATE.

### QA-FX07 — Banco negociador válido
Banco inexistente => ERROR.

### QA-FX08 — T+1 hábil
Negociación lunes, siguiente hábil martes según calendario efectivo del banco negociador.

Validación complementaria:
- fecha_valor manual contradictoria => FX_VALUE_DATE_MISMATCH.

### QA-FX09 — T+1 con feriado
Salta feriado correctamente.

### QA-FX10 — T+1 fin de semana
Salta a siguiente hábil.

### QA-FX11 — Hora crítica
ETA antes de hora crítica => viable temporalmente.

### QA-FX12 — ETA posterior
=> bloqueada temporalmente.

### QA-FX13 — Prioridad vs rigidez
P1 flexible no se confunde con R1 rígida.

### QA-FX14 — Cobertura mismo banco
Usa primero banco negociador de misma empresa.

### QA-FX15 — Cobertura otro banco propio
Solo después del mismo banco.

### QA-FX16 — Intercompany mismo banco
Solo después de agotar propia empresa.

### QA-FX17 — Intercompany otro banco
Último nivel.

### QA-FX18 — No doble uso de cuenta
Dos rutas no consumen misma capacidad dos veces.

### QA-FX19 — Gap derivado
gap_fx correcto y sin crear nueva necesidad.

### QA-FX20 — Banco negociador sin cuentas
No inventa cuenta; cobertura localizada 0.

### QA-FX21 — Cuenta destino explícita
Valida pertenencia a empresa/banco.

### QA-FX22 — Restricción cutoff
Ruta bloqueada si llega fuera de ventana.

### QA-FX23 — Max diario
Respeta límite.

### QA-FX24 — Aprobación adicional
Conserva acción requerida.

### QA-FX25 — Cobertura parcial
Estado COBERTURA_PARCIAL y gap > 0.

### QA-FX26 — Sin cobertura
Estado SIN_COBERTURA.

### QA-FX27 — Cobertura completa
Estado COBERTURA_COMPLETA.

### QA-FX28 — Excepción temporal propuesta
FX rígido puede proponerse antes que necesidad más prioritaria pero flexible.

### QA-FX29 — Excepción no altera prioridad
La prioridad económica original permanece intacta.

### QA-FX30 — Excepción identifica desplazada
Expone need_id y monto desplazado.

### QA-FX31 — Recomposición obligatoria
Si no existe plan de recomposición validado sobre capacidad remanente, excepción no queda aceptable.

### QA-FX32 — Recomposición viable
Debe cubrir 100% del monto desplazado, respetar deadline/restricciones, no crear otro desplazamiento y exponer fecha/ruta/monto de recomposición.

### QA-FX33 — No ejecución
No modifica balances, afectaciones, postura ni reservas oficiales.

### QA-FX34 — Múltiples FX ordenados
Rigidez→hora crítica→prioridad→evento→ID.

### QA-FX35 — Reporte comparte capacidades
Dos FX no duplican capacidad física/bancaria.

### QA-FX36 — Idempotencia SET
Mismo request_id/payload no duplica.

### QA-FX37 — Conflicto idempotencia
Mismo request_id distinto payload => error.

### QA-FX38 — CLEAR
Elimina configuración FX sin alterar Posición.

### QA-FX39 — Originales intactos
No cambia amount_original/currency_original.

### QA-FX40 — Sin módulos futuros
No crea mandato, conciliación, ejecución bancaria ni UI.

## Regresión
Conservar:
- CODEX-001 15
- CODEX-002 20
- CODEX-002A 12
- CODEX-003 25
- CODEX-004 30
- CODEX-005 40
- CODEX-005A 16
- CODEX-006 40
- CODEX-006A 15

CODEX-007:
- 40

Total esperado:
253/253 PASS

## Criterio de cierre
PASS si:
- 253/253;
- FX no crea segunda afectación;
- no doble descuento;
- T+1 usa calendario hábil;
- hora crítica gobierna viabilidad;
- cobertura reutiliza 006;
- restricciones reutilizan 005/005A;
- excepción temporal no cambia prioridad;
- recomposición obligatoria si desplaza necesidad;
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
8. commit en liq-codex-007;
9. sin merge a main.

## Decisiones funcionales resueltas antes de implementación
Quedan cerrados los tres BLOCKED_BY_FUNCTIONAL_RULE reportados por Codex:
1. un solo FX activo por afectación y correspondencia exacta con el pendiente económico completo;
2. fecha valor T+1 según calendario efectivo del banco negociador con precedencia de cuenta/empresa+banco/banco;
3. recomposición validada por CODEX-006/006A sobre capacidad remanente y por el 100% del monto desplazado.

No quedan pendientes estas tres decisiones.

## Estado
LISTA PARA EJECUCIÓN.
