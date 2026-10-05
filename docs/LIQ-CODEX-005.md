# LIQ-CODEX-005 — Restricciones Bancarias y Viabilidad de Ruta

## Objetivo
Implementar el motor de restricciones bancarias que gobierna la viabilidad real de una ruta de liquidez, apoyándose en:
- CODEX-001 Moneda
- CODEX-002/002A Posición
- CODEX-003 Necesidades/Prioridad
- CODEX-004 Postura Empresa→Banco→Cuenta

Las restricciones no crean necesidades ni afectaciones nuevas.
Evalúan si una ruta localizada puede ejecutarse y bajo qué condiciones.

## Alcance
Implementar:
- catálogo/configuración de restricciones por banco y opcionalmente cuenta/empresa;
- límites máximos por operación;
- límite diario acumulado;
- máximo número de operaciones;
- ventana horaria / cutoff;
- tiempo estimado de acreditación;
- reglas intrabanco/interbanco;
- T+0/T+1;
- moneda permitida;
- empresa/cuenta permitida;
- requisito de aprobación adicional;
- días hábiles/inhábiles;
- capacidad consumida por operaciones ya aprobadas/emitidas representadas como uso reservado técnico;
- evaluación de ruta con resultado:
  - VIABLE
  - VIABLE_CON_RESTRICCION
  - BLOQUEADA
- explicación trazable de cada restricción aplicada.

## No tocar
NO implementar:
- cobertura entre empresas;
- selección automática de fuente alternativa;
- FX T+1 como módulo funcional;
- What If;
- mandatos completos;
- conciliación;
- cierre;
- UI;
- SIGRF.

## Principio rector
La postura dice DÓNDE está localizada una necesidad.
CODEX-005 dice SI esa ruta puede ejecutarse y qué condición la gobierna.
No modificar el efecto económico ni la postura física.

## Regla 1 — Restricción como configuración
Permitir reglas por banco, con overrides opcionales por:
- empresa
- cuenta
- moneda

Campos posibles:
- max_por_operacion
- max_diario
- max_operaciones_dia
- hora_inicio
- cutoff
- minutos_acreditacion
- permite_intrabanco
- permite_interbanco
- settlement: T0 | T1 | BOTH
- monedas_permitidas
- empresas_permitidas
- cuentas_permitidas
- requiere_aprobacion_adicional
- dias_habiles_semana
- feriados
- estado_activo

No todos son obligatorios.

## Regla 2 — Precedencia de configuración
La restricción más específica prevalece:
1. cuenta
2. empresa+banco
3. banco
4. ausencia = sin restricción específica

No inventar valores por defecto restrictivos.

## Regla 3 — Máximo por operación
Si monto > max_por_operacion:
- no declarar la ruta totalmente bloqueada si puede dividirse;
- resultado VIABLE_CON_RESTRICCION;
- sugerir cantidad mínima de operaciones = ceil(monto/max_por_operacion);
- cada tramo debe respetar límite.

## Regla 4 — Máximo diario
Uso diario previo + monto propuesto > max_diario:
- BLOQUEADA por exceso diario.

## Regla 5 — Máximo número de operaciones
ops_previas + ops_requeridas > max_operaciones_dia:
- BLOQUEADA.

## Regla 6 — Ventana horaria
Si hora actual/fecha_hora_evaluacion está antes de hora_inicio:
- VIABLE_CON_RESTRICCION indicando “aún no disponible”.
Si está después de cutoff:
- BLOQUEADA para ejecución T0 en esa jornada.

No usar la hora del sistema silenciosamente; la evaluación recibe timestamp explícito.

## Regla 7 — Acreditación y deadline
Si necesidad tiene fecha_hora_objetivo:
- calcular ETA = fecha_hora_evaluacion + minutos_acreditacion
- si ETA > fecha_hora_objetivo:
  - BLOQUEADA por incumplimiento temporal.

## Regla 8 — Intrabanco/interbanco
La evaluación recibe tipo_ruta:
- INTRABANCO
- INTERBANCO

Si la configuración no permite el tipo:
- BLOQUEADA.

## Regla 9 — Settlement
Si ruta requiere T0 y banco solo permite T1:
- BLOQUEADA para esa necesidad si el objetivo exige T0.
Si T1 es aceptable:
- VIABLE_CON_RESTRICCION o VIABLE según resto de reglas.

## Regla 10 — Moneda
Si moneda de operación no está permitida:
- BLOQUEADA.

## Regla 11 — Empresa/cuenta
Si empresa o cuenta origen no está permitida:
- BLOQUEADA.

## Regla 12 — Aprobación adicional
Si requiere_aprobacion_adicional = true:
- VIABLE_CON_RESTRICCION;
- exponer accion_requerida = APROBACION_ADICIONAL.
No bloquear automáticamente.

## Regla 13 — Día hábil
Si la fecha cae fuera de dias_habiles_semana o en feriados:
- BLOQUEADA para T0.
Puede ser VIABLE_CON_RESTRICCION para siguiente hábil si settlement lo permite y el deadline también.

## Regla 14 — Uso acumulado técnico
Implementar estado de uso bancario:
- monto_usado_dia
- operaciones_usadas_dia
- monto_reservado_por_aprobadas
- operaciones_reservadas

CODEX-005 puede recibir/guardar reservas técnicas de capacidad.
No implementar Mandatos todavía.

## Regla 15 — No doble conteo de capacidad
Una operación reservada no puede volver a liberar capacidad hasta que se anule/libere explícitamente.

## Regla 16 — Evaluación por asignación de postura
Cada asignación de CODEX-004 puede evaluarse por separado.
La afectación completa es:
- VIABLE si todas sus asignaciones son VIABLE;
- VIABLE_CON_RESTRICCION si ninguna está bloqueada y al menos una tiene restricción;
- BLOQUEADA si al menos una asignación necesaria está bloqueada.

## Regla 17 — Residual no localizado
Si CODEX-004 dejó monto_no_localizado > 0:
- la afectación no puede declararse VIABLE_TOTAL.
- resultado global mínimo = BLOQUEADA_POR_LOCALIZACION_INCOMPLETA o equivalente estable.

## Regla 18 — Alertas derivadas
Exponer alertas solo como resultado de una restricción real:
- INFO
- RESTRICCION
- BLOQUEO

No generar alertas decorativas sin regla activada.

## Regla 19 — Explicabilidad
Cada evaluación debe indicar:
- rule_id
- dimensión
- valor configurado
- valor observado
- resultado
- impacto
- acción requerida si aplica.

## Regla 20 — Idempotencia configuración/uso
Cambios de restricciones y reservas técnicas:
- request_id obligatorio
- mismo payload = sin duplicación
- mismo id con payload distinto = IDEMPOTENCY_CONFLICT

## Regla 21 — Trazabilidad
Eventos:
- SET_BANK_RESTRICTION
- CLEAR_BANK_RESTRICTION
- RESERVE_BANK_CAPACITY
- RELEASE_BANK_CAPACITY

Con antes/después, banco, empresa/cuenta si aplica, origen, usuario, timestamp, request_id.

## APIs sugeridas
- setBankRestriction(...)
- clearBankRestriction(...)
- reserveBankCapacity(...)
- releaseBankCapacity(...)
- evaluateAssignmentRoute(...)
- evaluateAffectationRoute(...)
- buildBankRestrictionReport(...)

## QA obligatorio

QA-R01 — Sin restricciones
Ruta válida localizada => VIABLE.

QA-R02 — max_por_operacion
Monto 25, máximo 10 => VIABLE_CON_RESTRICCION, 3 operaciones.

QA-R03 — max_diario excedido
Usado 80, propuesto 30, máximo 100 => BLOQUEADA.

QA-R04 — max_operaciones excedido
2 usadas + 2 requeridas, máximo 3 => BLOQUEADA.

QA-R05 — antes de apertura
08:00, inicio 09:00 => VIABLE_CON_RESTRICCION.

QA-R06 — después de cutoff
17:01, cutoff 17:00, T0 => BLOQUEADA.

QA-R07 — ETA cumple
10:00 + 30 min, objetivo 11:00 => no bloquea.

QA-R08 — ETA incumple
10:00 + 90 min, objetivo 11:00 => BLOQUEADA.

QA-R09 — intrabanco permitido
VIABLE.

QA-R10 — intrabanco no permitido
BLOQUEADA.

QA-R11 — interbanco no permitido
BLOQUEADA.

QA-R12 — T0 permitido
VIABLE.

QA-R13 — solo T1 ante necesidad T0
BLOQUEADA.

QA-R14 — moneda no permitida
BLOQUEADA.

QA-R15 — empresa no permitida
BLOQUEADA.

QA-R16 — cuenta no permitida
BLOQUEADA.

QA-R17 — aprobación adicional
VIABLE_CON_RESTRICCION + APROBACION_ADICIONAL.

QA-R18 — día inhábil
T0 => BLOQUEADA.

QA-R19 — feriado
T0 => BLOQUEADA.

QA-R20 — reserva técnica consume máximo diario
Capacidad reservada cuenta para max_diario.

QA-R21 — reserva técnica consume número de ops
Cuenta para max_operaciones.

QA-R22 — release restaura capacidad
Liberación explícita reduce reservado.

QA-R23 — idempotencia reserva
Mismo request_id no duplica.

QA-R24 — conflicto idempotencia
Mismo request_id distinto payload => IDEMPOTENCY_CONFLICT.

QA-R25 — precedencia cuenta sobre banco
Override de cuenta prevalece.

QA-R26 — precedencia empresa+banco sobre banco
Prevalece regla más específica.

QA-R27 — postura parcial
Residual > 0 => no VIABLE_TOTAL.

QA-R28 — dos asignaciones, una bloqueada
Afectación global BLOQUEADA.

QA-R29 — dos asignaciones, una restringida
Global VIABLE_CON_RESTRICCION.

QA-R30 — todas viables
Global VIABLE.

QA-R31 — alerta informativa
No bloqueante, severidad INFO.

QA-R32 — alerta restricción
Severidad RESTRICCION.

QA-R33 — alerta bloqueo
Severidad BLOQUEO.

QA-R34 — explicabilidad
Cada regla activada expone rule_id/observado/configurado.

QA-R35 — evaluación no muta postura
build/evaluate no cambia asignaciones ni posición.

QA-R36 — originales intactos
No modifica amount_original/currency_original.

QA-R37 — timestamp explícito
Sin fecha_hora_evaluacion => ERROR; no usar reloj del sistema.

QA-R38 — configuración inválida cutoff
Formato/hora inválida => ERROR.

QA-R39 — feriados inválidos
Fecha inválida => ERROR.

QA-R40 — no cobertura
No aparecen campos de fuente alternativa/intercompany.

## Regresión
Conservar:
- CODEX-001: 15
- CODEX-002: 20
- CODEX-002A: 12
- CODEX-003: 25
- CODEX-004: 30

CODEX-005:
- 40 QA

Total esperado:
142/142 PASS

## Criterio de cierre
PASS si:
- 142/142;
- restricciones gobiernan viabilidad real;
- postura permanece intacta;
- no se implementa cobertura;
- no se implementa mandato completo;
- no UI;
- no SIGRF.

## Entrega Codex
1. archivos modificados;
2. APIs públicas;
3. tests;
4. resultado exacto 142/142;
5. decisiones técnicas;
6. bloqueos;
7. commit en liq-codex-005;
8. no merge a main.

## Estado
LISTA PARA EJECUCIÓN.
