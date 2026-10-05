# LIQ-CODEX-006A — Estabilización de Cobertura Intraempresa

## Gobierno obligatorio
Antes de implementar, leer y aplicar íntegramente:
- README.md
- docs/PROTOCOLO_CODEX.md
- docs/LIQ-CODEX-006.md

Este trabajo hereda GOV-01 y GOV-01.1.

## Motivo
La auditoría funcional posterior a CODEX-006 detectó una brecha no cubierta por los 40 QA originales:

El motor simula toda cobertura restando `company.available` de la empresa fuente, incluso cuando la fuente y el destino pertenecen a la misma empresa (niveles 1 y 2).

Eso es incorrecto porque `saldo_disponible_gestion` consolidado ya descuenta la obligación económica. Una movilización interna entre cuentas/bancos de la misma empresa solo relocaliza liquidez; no debe volver a reducir la disponibilidad consolidada.

## Principio rector
Cobertura intraempresa = relocalización de liquidez ya perteneciente a la misma empresa.

Por tanto:
- niveles 1 y 2 NO reducen `saldo_disponible_gestion` simulado de la empresa;
- niveles 3 y 4 SÍ reducen la capacidad cedible de la empresa fuente intercompany;
- en todos los niveles sí se consume capacidad física de la cuenta;
- en todos los niveles sí se consume capacidad bancaria simulada de la ruta;
- nunca se modifica el estado oficial.

## Regla 1 — Niveles 1 y 2
Para:
1. misma empresa / mismo banco;
2. misma empresa / otro banco;

el tramo:
- consume `capacidad_restante_postura` de la cuenta fuente;
- consume capacidad bancaria simulada;
- NO resta `company.available`;
- NO aplica buffer como restricción adicional sobre el mismo saldo consolidado;
- debe mantener `saldo_fuente_antes` y `saldo_fuente_despues` iguales al `saldo_disponible_gestion` consolidado de la empresa, o exponer campos equivalentes sin simular una salida económica.

## Regla 2 — Niveles 3 y 4
Para:
3. otra empresa / mismo banco;
4. otra empresa / otro banco;

se conserva la regla CODEX-006:
- capacidad cedible = max(0, saldo_disponible_gestion - buffer);
- cada tramo reduce capacidad simulada de la empresa fuente;
- saldo_post_fuente >= buffer.

## Regla 3 — No doble descuento
Una obligación de E por 50 ya redujo la posición consolidada de E en 50.
Mover 30 desde otra cuenta de E para cubrirla:
- no reduce nuevamente la posición de E en 30;
- solo cambia la localización física y la capacidad restante de esa cuenta.

## Regla 4 — Múltiples necesidades de la misma empresa
En un `buildCoverageReport` con varias necesidades de la misma empresa:
- los niveles 1 y 2 comparten capacidad física de cuentas y límites bancarios;
- NO comparten un “saldo consolidado decreciente” ficticio;
- por tanto, la suma de movilizaciones intraempresa puede ser mayor que el `saldo_disponible_gestion` si representa relocalizaciones de saldos ya descontados por obligaciones, siempre que:
  - no se duplique capacidad física;
  - no se violen restricciones bancarias;
  - no se use saldo ya asignado por postura.

## Regla 5 — Buffer intraempresa
El buffer operativo protege cesiones intercompany.
No debe bloquear una movilización entre cuentas de la misma empresa si la capacidad física ya está libre y la obligación está reconocida en Posición.

## Alcance técnico permitido
Modificar únicamente:
- src/coverage.js
- test/liq-codex-006.test.js si hace falta ajustar expectativa
- nuevo test/liq-codex-006a.test.js
- docs/LIQ-CODEX-006A-IMPLEMENTACION.md

No modificar:
- money.js
- state.js
- position.js
- needs.js
- posture.js
- bank-restrictions.js

No implementar:
- FX T+1 específico
- mandatos
- What If
- conciliación
- cierre
- UI
- SIGRF

## QA obligatorio

### QA-6A01 — Nivel 1 no reduce disponibilidad consolidada
E:
- saldo_disponible_gestion = 40
- capacidad física libre misma empresa/mismo banco = 30
- residual = 30
Resultado:
- cobertura 30;
- saldo consolidado simulado de E sigue 40.

### QA-6A02 — Nivel 2 no reduce disponibilidad consolidada
Misma empresa / otro banco.
Cobertura 20.
Saldo consolidado simulado no cambia.

### QA-6A03 — Buffer no bloquea nivel 1
E disponible 20, buffer 20, capacidad física libre 15, residual 15.
Debe poder movilizar 15 intraempresa.

### QA-6A04 — Buffer no bloquea nivel 2
Mismo principio en otro banco.

### QA-6A05 — Nivel 3 sí reduce fuente
F disponible 50, buffer 10, aporta 30.
Saldo simulado fuente = 20.

### QA-6A06 — Nivel 4 sí reduce fuente
Igual en otro banco.

### QA-6A07 — Dos necesidades intraempresa comparten cuenta física
Cuenta libre 30.
Dos necesidades 20 + 20.
Resultado total máximo 30; nunca 40.

### QA-6A08 — Dos necesidades intraempresa no comparten saldo consolidado ficticio
E saldo_disponible_gestion 10, pero existen 30 de capacidad física libre relocalizable asociada a obligaciones ya descontadas.
Dos necesidades pueden consumir esos 30 físicos sin que el motor las corte por `available=10`, siempre que no haya doble uso físico.

### QA-6A09 — Restricciones bancarias siguen gobernando
Nivel 1/2 no cambia economía, pero cutoff/max_diario/ops siguen aplicando.

### QA-6A10 — Capacidad bancaria compartida sigue sin doble uso
Dos necesidades compiten por max_diario; el límite se respeta.

### QA-6A11 — Saldo fuente antes/después intraempresa explicable
El resultado no debe mostrar falsamente que la empresa perdió liquidez consolidada por una movilización interna.

### QA-6A12 — Intercompany conserva buffer
No regresión de QA-C08/C09/C32/C33.

### QA-6A13 — Posición oficial intacta
Antes/después del plan idénticos.

### QA-6A14 — Postura oficial intacta
Sin mutación.

### QA-6A15 — Determinismo
Mismos inputs => mismo plan.

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

Nuevo:
- CODEX-006A 15

Total esperado:
213/213 PASS

## Criterio de cierre
PASS si:
- 213/213;
- niveles 1 y 2 no reducen disponibilidad consolidada;
- niveles 3 y 4 sí protegen fuente y buffer;
- no doble uso físico;
- restricciones bancarias siguen gobernando;
- no muta estado oficial;
- no módulos futuros.

## Entrega
1. archivos modificados;
2. funciones afectadas;
3. QA exacto;
4. decisiones técnicas;
5. términos técnicos nuevos explicados;
6. bloqueos;
7. deuda técnica;
8. commit en liq-codex-006a;
9. sin merge a main.

## Estado
LISTA PARA EJECUCIÓN.
