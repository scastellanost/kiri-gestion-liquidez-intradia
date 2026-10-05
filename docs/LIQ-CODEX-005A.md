# LIQ-CODEX-005A — Estabilización Temporal de Restricciones Bancarias

## Gobierno obligatorio
Antes de ejecutar, leer y aplicar íntegramente:
- README.md
- docs/PROTOCOLO_CODEX.md
- docs/LIQ-CODEX-005.md

Este trabajo hereda GOV-01 y GOV-01.1 del protocolo Codex.

## Objetivo
Cerrar los dos BLOCKED_BY_FUNCTIONAL_RULE pendientes de CODEX-005:
1. ventanas bancarias que cruzan medianoche;
2. horas locales ambiguas o inexistentes por cambio de horario de verano.

No ampliar alcance funcional.

## Decisión funcional 1 — Ventanas que cruzan medianoche
Si hora_inicio > cutoff, la ventana se interpreta como una ventana nocturna que cruza de una jornada calendario a la siguiente.

Ejemplo:
- hora_inicio = 22:00
- cutoff = 02:00

La ventana operativa válida es:
- desde 22:00 del día D
- hasta 02:00 del día D+1

Reglas:
- entre 22:00 y 23:59:59... => dentro de ventana;
- entre 00:00 y 02:00 inclusive => dentro de la continuación de la ventana iniciada el día anterior;
- entre 02:00 y 21:59:59... => fuera de ventana;
- cutoff sigue siendo inclusivo en el instante exacto;
- para T0, después del cutoff efectivo => BLOQUEADA;
- antes del inicio efectivo => VIABLE_CON_RESTRICCION con acción ESPERAR_APERTURA;
- el día hábil aplicable a una ventana nocturna es el día de inicio de la ventana, no el día calendario posterior de la continuación.

No dividir una misma ventana nocturna en dos jornadas de uso diario.

## Decisión funcional 2 — DST: hora local inexistente
Si una hora local configurada no existe por salto de horario de verano:
- desplazar al primer instante local válido posterior;
- registrar explicación:
  - rule_id = DST_NONEXISTENT_LOCAL_TIME_SHIFTED
  - impacto = RESTRICCION
  - acción = USAR_PRIMER_INSTANTE_VALIDO
- no bloquear si el desplazamiento sigue cumpliendo deadline/cutoff;
- si el desplazamiento causa incumplimiento temporal, aplicar el bloqueo temporal correspondiente.

## Decisión funcional 3 — DST: hora local ambigua
Si una hora local ocurre dos veces por retroceso horario:
- usar la PRIMERA ocurrencia cronológica;
- registrar explicación:
  - rule_id = DST_AMBIGUOUS_LOCAL_TIME_FIRST_OCCURRENCE
  - impacto = INFO
- no pedir selección manual en esta fase.

## Regla de seguridad temporal
Nunca usar el reloj del sistema.
Toda evaluación debe seguir usando:
- fecha_hora_evaluacion explícita;
- zona_horaria IANA explícita.

## Alcance técnico permitido
Modificar únicamente:
- src/bank-restrictions.js
- tests de CODEX-005 si necesitan actualizar una expectativa previamente bloqueada
- nuevo test/liq-codex-005a.test.js
- docs/LIQ-CODEX-005A-IMPLEMENTACION.md

No modificar:
- money.js
- state.js
- position.js
- needs.js
- posture.js

No implementar:
- cobertura
- fuentes alternativas
- FX específico
- mandatos completos
- conciliación
- cierre
- UI
- SIGRF

## QA obligatorio

### QA-5A01 — Ventana nocturna antes de apertura
Ventana 22:00–02:00.
Evaluación 21:00.
=> VIABLE_CON_RESTRICCION / ESPERAR_APERTURA.

### QA-5A02 — Ventana nocturna dentro del tramo inicial
22:30.
=> dentro de ventana.

### QA-5A03 — Ventana nocturna antes de medianoche
23:59.
=> dentro de ventana.

### QA-5A04 — Ventana nocturna continuación
00:30 del día siguiente.
=> dentro de misma ventana operativa iniciada el día anterior.

### QA-5A05 — Cutoff nocturno exacto
02:00 exacto.
=> todavía válido.

### QA-5A06 — Después de cutoff nocturno
02:01 T0.
=> BLOQUEADA.

### QA-5A07 — Día hábil de ventana nocturna
Viernes 22:00–02:00 sábado.
Si viernes es hábil y sábado no:
00:30 del sábado sigue perteneciendo a ventana hábil iniciada el viernes.

### QA-5A08 — Ventana nocturna iniciada en inhábil
Si sábado no hábil y ventana comienza sábado 22:00:
=> T0 bloqueada aunque termine domingo.

### QA-5A09 — Límite diario no se parte en medianoche
Uso iniciado en ventana viernes 22:00 continúa hasta sábado 02:00 bajo la misma jornada operativa para max_diario/max_operaciones.

### QA-5A10 — DST hora inexistente
Hora configurada cae en salto horario.
=> se desplaza al primer instante válido posterior y genera RESTRICCION explicable.

### QA-5A11 — DST inexistente + deadline
Si el desplazamiento hace que ETA supere deadline:
=> BLOQUEADA por incumplimiento temporal.

### QA-5A12 — DST hora ambigua
Se usa primera ocurrencia cronológica y genera INFO explicable.

### QA-5A13 — Sin cambio DST
Zonas sin DST mantienen comportamiento previo.

### QA-5A14 — Idempotencia intacta
No se altera comportamiento de configuraciones/reservas.

### QA-5A15 — Evaluación pura
No muta restricciones, uso, postura ni posición.

## Regresión
Conservar íntegramente:
- CODEX-001 15
- CODEX-002 20
- CODEX-002A 12
- CODEX-003 25
- CODEX-004 30
- CODEX-005 40

Nuevo:
- CODEX-005A 15

Total esperado:
157/157 PASS

## Criterio de cierre
PASS si:
- 157/157;
- no quedan los dos BLOCKED_BY_FUNCTIONAL_RULE temporales;
- ventanas nocturnas son determinísticas;
- DST ambiguo/inexistente es determinístico y explicable;
- no se implementa cobertura ni lógica futura;
- no UI;
- no SIGRF.

## Entrega
1. archivos modificados;
2. funciones afectadas;
3. QA exacto;
4. términos técnicos nuevos explicados;
5. decisiones técnicas;
6. bloqueos restantes;
7. deuda técnica;
8. commit en liq-codex-005a;
9. sin merge a main.

## Estado
LISTA PARA EJECUCIÓN.
