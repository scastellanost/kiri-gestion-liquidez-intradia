# PILOT-01 / F1 — Estructura del Piloto de Gestión de Liquidez Intradía

## Objetivo
Validar en condiciones controladas que los motores congelados operan de forma coherente, trazable y reproducible antes de cualquier integración productiva o interfaz definitiva.

## Baseline
`archive/liquidez-baseline-liq-codex-009-20261008`

QA independiente de entrada:
- workflow run `37793543807`;
- estructura PASS;
- regresión completa PASS;
- verificación de ausencia de integración productiva PASS.

## Inventario de bloques a validar

### P1 — Integridad monetaria
Validar moneda original, VES operativo, equivalencia USD BCV y no pérdida de importe/moneda original.

### P2 — Necesidades y afectaciones
Validar creación, persistencia, pendiente económico, no duplicación de obligación y temporalidad.

### P3 — Posición
Validar que saldos, reflejado/confirmado y afectaciones se combinen sin doble descuento.

### P4 — Postura
Validar clasificación de disponibilidad y conservación de trazabilidad hacia banco/cuenta/empresa.

### P5 — Restricciones y capacidad bancaria
Validar límites, reservas, aprobación adicional y liberación sin inventar capacidad.

### P6 — Cobertura e intercompany
Validar rutas de cobertura, capacidad física, protección de buffer y no financiación dañina entre empresas.

### P7 — FX
Validar propuesta FX, fecha valor, hora crítica y tratamiento explícito de excepciones.

### P8 — Reservas
Validar persistencia y liberación de reservas sin modificar economía subyacente.

### P9 — Mandatos
Validar estados, revalidación, idempotencia, inmutabilidad y no ejecución bancaria.

### P10 — Regresión integral
Ejecutar todos los motores conjuntamente y demostrar que una mejora o prueba no rompe contratos previos.

## Bloqueos que el piloto NO resolverá automáticamente
1. límite agregado de varios mandatos aprobados sobre una misma afectación;
2. alcance de reserva de recomposición ante excepción FX autorizada.

Estos puntos deben aislarse como escenarios bloqueados y llevarse al Líder Funcional cuando su resolución sea necesaria para continuar.

## QA requerido en cada bloque
- QA técnico;
- QA funcional;
- QA semántico;
- QA de datos/cálculos;
- QA de regresión;
- QA de trazabilidad/gobierno.

## Criterio de avance
Un bloque puede pasar a VALIDATED_FOR_PILOT cuando:
- sus pruebas pasan;
- el contrato se cumple;
- no introduce reglas nuevas;
- no rompe regresión;
- excepciones quedan explícitas.

## Fuera de alcance
- ejecución bancaria real;
- producción;
- secretos/credenciales;
- UI definitiva;
- integración SIGRF;
- decisión automática sobre los dos bloqueos funcionales.

## Estado
**AUTHORIZED_AND_READY_FOR_PILOT_EXECUTION**
