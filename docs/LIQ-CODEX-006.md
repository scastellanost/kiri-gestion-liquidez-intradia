# LIQ-CODEX-006 — Motor de Cobertura

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

Este trabajo hereda GOV-01 y GOV-01.1.

## Objetivo
Construir el motor de cobertura que propone cómo cubrir una necesidad no localizada o insuficientemente localizada, sin ejecutar movimientos ni crear mandatos.

Debe respetar:
- posición consolidada;
- prioridad;
- postura;
- restricciones bancarias;
- protección de la empresa fuente;
- jerarquía de cobertura aprobada.

## Principio rector
El motor PROPONE rutas de cobertura.
Tesorería decide.
Una solución no es válida si resuelve un déficit creando otro.

## Jerarquía obligatoria de cobertura
Evaluar en este orden:
1. misma empresa / mismo banco;
2. misma empresa / otro banco;
3. otra empresa / mismo banco;
4. otra empresa / otro banco.

No saltar de nivel mientras exista capacidad viable suficiente en un nivel anterior.

## Alcance
Implementar:
- detección de necesidad de cobertura a partir de residual/no localización;
- identificación de fuentes candidatas;
- capacidad cedible por empresa/banco/cuenta;
- jerarquía de cobertura;
- simulación post-movimiento;
- protección de necesidades propias de la fuente;
- buffer operativo opcional;
- evaluación de restricciones bancarias para la ruta propuesta;
- cobertura parcial;
- combinación de múltiples fuentes;
- explicación de por qué una fuente fue usada o descartada;
- resultado determinístico y no mutante;
- trazabilidad de configuración del buffer/política;
- idempotencia de configuración.

## No tocar
NO implementar:
- ejecución de transferencias;
- mandatos;
- FX T+1 específico;
- What If de reservas;
- conciliación;
- cierre D+1;
- UI;
- SIGRF.

## Regla 1 — Necesidad a cubrir
La necesidad de cobertura deriva de:
- monto_no_localizado de CODEX-004;
- o ruta BLOQUEADA por CODEX-005 cuando la localización existe pero no es ejecutable.

No crear una nueva afectación económica.
No crear un “déficit” adicional como necesidad.

## Regla 2 — Protección de la fuente
Una empresa fuente solo puede ceder liquidez hasta:
capacidad_cedible = max(0, saldo_disponible_gestion - buffer_operativo)

El saldo_disponible_gestion ya protege compromisos y reservas activas.
No volver a descontarlas.

Si capacidad_cedible <= 0:
- empresa no es fuente.

## Regla 3 — Buffer operativo
Configuración opcional por empresa:
- buffer_operativo_ves >= 0

Si no existe configuración:
- buffer = 0

El buffer:
- no altera Posición;
- solo limita cuánto puede proponerse como cobertura;
- no es una reserva económica;
- no descuenta saldo por sí mismo.

## Regla 4 — Simulación post-movimiento
Para toda propuesta de fuente:
saldo_post_fuente = saldo_disponible_gestion_fuente - monto_cedido

Debe cumplirse:
saldo_post_fuente >= buffer_operativo

Si no:
- fuente inválida para ese monto.

## Regla 5 — Capacidad física
La capacidad económica cedible no basta.
La fuente debe tener capacidad física/localizable en cuentas.

Usar CODEX-004 para identificar:
- cuentas;
- banco;
- capacidad_restante_postura.

No usar saldo ya asignado a necesidades activas.

## Regla 6 — Misma empresa / mismo banco
Primera preferencia:
- buscar capacidad restante en el mismo banco de la necesidad destino;
- recorrer cuentas elegibles según postura;
- no duplicar asignaciones existentes.

## Regla 7 — Misma empresa / otro banco
Solo si nivel 1 no cubre completamente:
- usar bancos alternos de la misma empresa según postura;
- respetar restricciones bancarias CODEX-005.

## Regla 8 — Otra empresa / mismo banco
Solo después de agotar niveles 1 y 2.
La empresa fuente:
- debe tener saldo_disponible_gestion positivo;
- debe conservar buffer;
- debe tener capacidad física;
- no puede quedar en déficit.

## Regla 9 — Otra empresa / otro banco
Último nivel ordinario.
Mismas protecciones de fuente + restricciones.

## Regla 10 — Orden entre empresas fuente
Si varias empresas son elegibles:
1. mayor capacidad_cedible;
2. misma banca del destino antes que banca distinta;
3. orden alfabético/ID estable como desempate.

No inventar preferencias corporativas no configuradas.

## Regla 11 — Orden entre cuentas
Dentro de una empresa/banco:
- respetar orden de postura CODEX-004;
- consumir capacidad de una cuenta antes de avanzar a la siguiente.

## Regla 12 — Restricciones bancarias
Toda ruta propuesta debe evaluarse con CODEX-005.

Una fuente/ruta:
- VIABLE => puede usarse;
- VIABLE_CON_RESTRICCION => puede proponerse con condición explícita;
- BLOQUEADA => no usar en cobertura ordinaria.

No ignorar cutoff, límites, settlement, moneda, calendario ni aprobaciones.

## Regla 13 — Restricciones con split
Si CODEX-005 exige dividir operación:
- conservar esa condición en la propuesta;
- no presentar la ruta como una única operación ejecutable.

## Regla 14 — Cobertura parcial
Si ninguna combinación cubre 100%:
- devolver cobertura parcial;
- exponer residual_no_cubierto;
- no inventar fuente.

## Regla 15 — Múltiples fuentes
Puede combinar fuentes manteniendo jerarquía.
Ejemplo:
Necesidad 25
nivel 1 aporta 10
nivel 2 aporta 8
nivel 3 aporta 7
=> cobertura total 25

No saltar a nivel 3 si nivel 2 aún tiene capacidad viable disponible.

## Regla 16 — No doble consumo
Una misma unidad de capacidad de cuenta no puede usarse en dos propuestas dentro de la misma simulación.

## Regla 17 — Fuente = destino
No crear “transferencia” si la capacidad ya está en la misma cuenta de destino.
Ese monto debe considerarse localización, no cobertura.

## Regla 18 — Moneda
Motor de cálculo canónico en VES.
Originales intactos.
Si una ruta requiere conversión sin tasa:
- ruta no utilizable;
- no cobertura parcial silenciosa de esa ruta.

## Regla 19 — Resultado por tramo
Cada tramo de cobertura debe exponer:
- nivel_cobertura: 1|2|3|4
- empresa_fuente
- banco_fuente
- cuenta_fuente
- empresa_destino
- banco_destino
- affectation_id
- monto_propuesto_ves
- saldo_fuente_antes
- saldo_fuente_despues
- buffer_fuente
- capacidad_fisica_antes
- capacidad_fisica_despues
- viabilidad_bancaria
- restricciones/acciones requeridas
- motivo_seleccion

## Regla 20 — Resultado consolidado
Exponer:
- affectation_id
- monto_necesario
- monto_cubierto
- residual_no_cubierto
- estado:
  - COBERTURA_TOTAL
  - COBERTURA_PARCIAL
  - SIN_COBERTURA
- tramos
- fuentes_descartadas con motivo
- explicacion_jerarquia

## Regla 21 — No ejecución
buildCoveragePlan / equivalente:
- no modifica balances;
- no modifica afectaciones;
- no modifica postura;
- no reserva capacidad bancaria oficialmente;
- no crea mandato.

## Regla 22 — Política de buffer
APIs sugeridas:
- setCoveragePolicy(...)
- clearCoveragePolicy(...)
- buildCoveragePlan(...)
- buildCoverageReport(...)

Toda configuración:
- request_id obligatorio;
- mismo payload => idempotente;
- mismo request_id distinto payload => IDEMPOTENCY_CONFLICT.

## Regla 23 — Trazabilidad
Eventos:
- SET_COVERAGE_POLICY
- CLEAR_COVERAGE_POLICY

Con:
- empresa
- antes
- después
- origen
- usuario
- timestamp
- request_id

## Regla 24 — Alcance temporal
El contexto de cobertura debe recibir explícitamente:
- fecha_hora_evaluacion
- zona_horaria
- settlement/tipo_ruta cuando aplique

No usar reloj del sistema.

## Regla 25 — Ausencia de módulos futuros
Como FX T+1 y Mandatos aún no están implementados:
- no inventar reservas por esos conceptos;
- usar únicamente compromisos, reservas, posición, postura y reservas técnicas bancarias ya existentes;
- cuando esos módulos existan, se integrarán mediante sus contratos propios.

## QA obligatorio

QA-C01 — Sin residual
Afectación totalmente localizada => SIN_NECESIDAD_DE_COBERTURA o equivalente; no genera tramos.

QA-C02 — Nivel 1 cubre todo
Misma empresa/mismo banco tiene 20 disponibles para residual 15 => usa solo nivel 1.

QA-C03 — Nivel 1 parcial, nivel 2 completa
N1=10, N2=5 para residual 15 => 10+5.

QA-C04 — No saltar nivel
N2 tiene capacidad; no usar N3.

QA-C05 — Otra empresa mismo banco
Solo después de agotar misma empresa.

QA-C06 — Otra empresa otro banco
Solo como nivel 4.

QA-C07 — Fuente negativa
saldo_disponible_gestion fuente <=0 => descartada.

QA-C08 — Buffer protege fuente
Fuente 100, buffer 30, necesidad 80 => máximo cedible 70.

QA-C09 — Post movimiento
Fuente 50, buffer 10, cede 40 => válido; cede 41 => inválido.

QA-C10 — Capacidad física limita
Fuente económica 100 pero cuenta restante 25 => máximo 25.

QA-C11 — No usar saldo asignado
Capacidad ya consumida por postura no está disponible para cobertura.

QA-C12 — Orden de cuentas
Respeta postura dentro del banco.

QA-C13 — Restricción bloqueada
Ruta BLOQUEADA por CODEX-005 => fuente descartada.

QA-C14 — Restricción condicionada
VIABLE_CON_RESTRICCION => tramo conserva acción requerida.

QA-C15 — Split bancario
max_por_operacion exige 3 tramos => propuesta lo refleja.

QA-C16 — Cobertura parcial
Necesidad 100, fuentes totales 60 => residual 40, COBERTURA_PARCIAL.

QA-C17 — Sin fuentes
=> SIN_COBERTURA.

QA-C18 — Múltiples fuentes
Combina sin doble uso.

QA-C19 — Orden entre empresas
Mayor capacidad cedible primero dentro del mismo nivel.

QA-C20 — Desempate estable
Capacidad igual => ID estable.

QA-C21 — Misma cuenta destino
No generar auto-transferencia sobre la misma cuenta.

QA-C22 — Moneda convertible
Cuenta USD con BCV participa por equivalente VES.

QA-C23 — Moneda sin tasa
Fuente/ruta no utilizable; explicación MISSING_EXCHANGE_RATE.

QA-C24 — Originales intactos
No altera amount_original/currency_original.

QA-C25 — Posición inalterada
Plan no modifica saldo_disponible_gestion.

QA-C26 — Postura inalterada
Plan no modifica asignaciones.

QA-C27 — Restricciones inalteradas
Plan no reserva ni libera capacidad oficial.

QA-C28 — Buffer no es afectación
Configurar buffer no cambia saldo_disponible_gestion.

QA-C29 — Idempotencia política
Mismo request_id/payload no duplica.

QA-C30 — Conflicto idempotencia
Mismo request_id/payload distinto => IDEMPOTENCY_CONFLICT.

QA-C31 — Clear policy
Buffer vuelve a 0 sin alterar posición.

QA-C32 — Fuente intercompany protegida
Empresa B con saldo gestión 30 y buffer 20 solo puede ceder 10.

QA-C33 — No crear déficit en fuente
Toda propuesta mantiene saldo_post_fuente >= buffer.

QA-C34 — Ruta parcial bloqueada
Si una parte indispensable queda bloqueada, no declararla cobertura total.

QA-C35 — Determinismo
Mismos inputs => mismo plan.

QA-C36 — Timestamp explícito
Sin fecha_hora_evaluacion => ERROR.

QA-C37 — Jerarquía explicable
Cada tramo indica nivel y motivo de selección.

QA-C38 — Fuentes descartadas explicables
Cada descarte indica motivo estable.

QA-C39 — Sin FX específico
No aparecen reglas/campos que inventen operación FX T+1.

QA-C40 — Sin mandatos
No se crea ni reserva un mandato.

## Regresión
Conservar:
- CODEX-001 15
- CODEX-002 20
- CODEX-002A 12
- CODEX-003 25
- CODEX-004 30
- CODEX-005 40
- CODEX-005A 16

CODEX-006:
- 40

Total esperado:
198/198 PASS

## Criterio de cierre
PASS si:
- 198/198;
- ninguna cobertura crea déficit en fuente;
- jerarquía 1→2→3→4 se respeta;
- restricciones bancarias gobiernan las rutas;
- no hay doble uso de capacidad;
- plan no muta estado económico;
- no mandatos;
- no FX específico;
- no UI;
- no SIGRF.

## Entrega
1. archivos modificados;
2. APIs públicas creadas/afectadas;
3. QA exacto y regresión;
4. decisiones técnicas;
5. términos técnicos nuevos explicados;
6. bloqueos;
7. deuda técnica;
8. commit en liq-codex-006;
9. sin merge a main.

## Estado
LISTA PARA EJECUCIÓN.
