# LIQ-CODEX-002 — Motor de Posición

## Objetivo
Construir el motor canónico de posición intradía sobre el núcleo monetario aprobado en LIQ-CODEX-001.

Esta orden implementa:
- saldos bancarios como stock;
- compromisos y reservas como afectaciones;
- Saldo Disponible Bancario;
- Saldo Disponible para Gestión;
- cargas manuales/masivas a nivel lógico;
- continuidad intradía;
- control de doble descuento;
- posición por empresa;
- posición por banco;
- trazabilidad mínima de origen/fecha/hora;
- cálculo en VES con selector USD equivalente ya provisto por CODEX-001.

## No tocar
NO implementar todavía:
- prioridad económica;
- rigidez temporal;
- reclasificación compromiso↔reserva;
- postura bancaria;
- restricciones bancarias;
- motor de cobertura;
- FX T+1;
- What If;
- mandatos;
- conciliación avanzada de transferencias intercompany;
- cierre D+1;
- navegación, layout, estilos o identidad visual;
- SIGRF.

## Regla 1 — Grano de saldo bancario
Cada saldo bancario debe operar a nivel:
- empresa
- banco
- cuenta
- moneda
- saldo
- fecha_hora_saldo

El saldo bancario es un STOCK.
Una nueva observación para la misma cuenta reemplaza la observación anterior vigente.
Nunca debe sumarse automáticamente al saldo previo.

## Regla 2 — Identidad de cuenta
Cada saldo debe referenciar una cuenta válida.
No crear cuentas implícitamente desde una carga transaccional.

## Regla 3 — Afectaciones
Compromisos y Fondos Reservados son registros económicos separados del stock bancario.

Campos mínimos:
- affectation_id
- empresa
- tipo_partida
- naturaleza_afectacion: COMPROMISO | RESERVA
- moneda_original
- monto_original
- monto_vigente
- monto_reflejado_confirmado
- estado
- banco_asignado opcional
- operacion
- origen
- fecha_hora_evento
- observacion opcional

## Regla 4 — Estados mínimos
Para esta orden:
- ACTIVA
- ANULADA

No inventar más estados de negocio todavía.

## Regla 5 — Operaciones
Procesar al menos:
- ALTA
- AJUSTE
- ANULACION

RECLASIFICACION queda fuera de alcance de CODEX-002 y pertenece a CODEX-003.

AJUSTE y ANULACION requieren referencia gobernada a un affectation_id existente.

## Regla 6 — Efecto económico
Compromiso activo:
monto_por_ejecutar = monto_vigente - monto_reflejado_confirmado

Reserva activa:
monto_bloqueado = monto_vigente

Saldo Disponible Bancario Empresa =
suma de saldos bancarios vigentes de sus cuentas convertidos explícitamente a la moneda de cálculo.

Saldo Disponible para Gestión Empresa =
Saldo Disponible Bancario Empresa
- Compromisos por Ejecutar
- Fondos Reservados activos

## Regla 7 — Moneda de cálculo
La posición se calcula de forma canónica en VES usando la librería de LIQ-CODEX-001.
USD es únicamente vista equivalente BCV.

No sumar monedas heterogéneas sin conversión explícita.
Si falta tasa para una moneda, la posición debe quedar incompleta/no publicable para esa agregación.

## Regla 8 — No doble descuento
Un compromiso aprobado reduce disponibilidad desde su alta.

Si posteriormente se confirma que una parte ya fue absorbida por un nuevo saldo bancario:
monto_reflejado_confirmado aumenta
monto_por_ejecutar disminuye

Ejemplo rector:
Saldo inicial 100
Compromiso 20
Disponible Gestión = 80

Nuevo saldo banco 90
Tesorería confirma 10 reflejados
Compromiso pendiente = 10
Disponible Gestión = 80

El motor NO puede inferir monto_reflejado_confirmado solo porque el saldo bancario disminuyó.

## Regla 9 — Reemplazo de stock
Si cuenta A tenía 100 y entra nueva observación válida por 90:
saldo vigente cuenta A = 90

No:
100 + 90
ni mantener ambos como stock vigente.

Puede conservar historial técnico si se desea, pero solo una observación es vigente.

## Regla 10 — Posición por empresa
Debe exponer como mínimo:
- saldo_bancario
- compromisos_por_ejecutar
- reservas_bloqueadas
- saldo_disponible_gestion
- deficit = max(0, -saldo_disponible_gestion)

No calcular remanente movilizable todavía.

## Regla 11 — Posición por banco
Debe exponer:
- saldo_bancario por empresa/banco
- compromisos asignados a ese banco cuando existan
- reservas asignadas cuando existan
- disponibilidad localizada preliminar

Pero:
la disponibilidad consolidada de la empresa gobierna.
Los compromisos sin banco asignado siguen reduciendo la empresa y no deben desaparecer del cálculo.

No llamar “remanente movilizable” a esta vista.

## Regla 12 — Compromiso sin banco
Banco_Asignado es opcional.
Si está vacío:
- el compromiso reduce totalmente a la empresa;
- queda como NO LOCALIZADO;
- no se reparte automáticamente entre bancos en CODEX-002.

La postura bancaria corresponde a CODEX-004.

## Regla 13 — Cargas
Implementar APIs lógicas reutilizables para:
- carga masiva de saldos;
- registro manual de saldo;
- carga masiva de afectaciones;
- registro manual de afectación.

La selección/parseo visual de archivos queda fuera de alcance.
El motor debe recibir estructuras ya parseadas.

## Regla 14 — Preview / validación
Antes de aplicar una carga, debe poder validarse sin mutar estado oficial.

Validaciones mínimas saldos:
- empresa válida;
- banco válido;
- cuenta válida;
- moneda válida;
- saldo numérico;
- timestamp válido;
- cuenta pertenece a empresa/banco;
- sin duplicado lógico conflictivo dentro del lote.

Validaciones mínimas afectaciones:
- empresa válida;
- moneda válida;
- monto positivo en ALTA;
- referencia válida en AJUSTE/ANULACION;
- banco opcional válido si se informa;
- no anular más de lo pendiente.

## Regla 15 — Idempotencia mínima
Cada lote debe admitir:
- batch_id

Reaplicar exactamente el mismo batch_id no puede duplicar efectos económicos.

Cada registro manual debe admitir:
- request_id

Repetir exactamente el mismo request_id no puede duplicar efectos.

## Regla 16 — Trazabilidad mínima
Conservar:
- origen
- usuario opcional
- fecha_hora_evento
- batch_id/request_id cuando aplique

No implementar todavía auditoría completa de eventos.

## Regla 17 — Inmutabilidad de originales
Nunca modificar:
- amount_original
- currency_original

Los equivalentes son derivados.

## Regla 18 — Presentación
No agregar UI.
Entregar motor puro + tests + documentación técnica.

## Casos QA obligatorios

### QA-P01 — Stock reemplazable
Cuenta A:
saldo 100
nueva observación 90
Resultado vigente = 90, no 190.

### QA-P02 — Compromiso reduce disponibilidad
Saldo bancario empresa = 100
Compromiso activo = 20
Reserva = 0
Disponible Gestión = 80.

### QA-P03 — Reserva reduce disponibilidad
Saldo = 100
Compromiso = 20
Reserva = 15
Disponible Gestión = 65.

### QA-P04 — Compromiso sin banco
Saldo Empresa A = 100
Compromiso sin banco = 30
Disponible Gestión Empresa = 70
El compromiso queda NO LOCALIZADO.

### QA-P05 — No doble descuento
Saldo inicial = 100
Compromiso = 20
Disponible = 80
Nuevo saldo = 90
Reflejado confirmado = 10
Pendiente = 10
Disponible = 80.

### QA-P06 — No inferir ejecución
Saldo inicial 100
Compromiso 20
Nuevo saldo 80
Reflejado confirmado = 0
Pendiente = 20
Disponible = 60.
La caída bancaria sola no ejecuta el compromiso.

### QA-P07 — Anulación
Saldo 100
Compromiso 20
Anular 20
Disponible vuelve a 100.
Debe conservar trazabilidad del registro.

### QA-P08 — Ajuste
Compromiso 20
Ajuste gobernado a 25
Pendiente = 25 si reflejado = 0.
No crear segundo compromiso.

### QA-P09 — Idempotencia lote
Aplicar batch saldo X dos veces.
Resultado económico idéntico a aplicarlo una vez.

### QA-P10 — Idempotencia manual
Aplicar request_id Y dos veces.
No duplicar afectación.

### QA-P11 — Moneda
Saldo VES + saldo USD con BCV válida:
consolidación explícita correcta en VES.
Sin BCV válida:
agregación que requiere USD↔VES debe fallar controladamente.

### QA-P12 — Cuenta inválida
Saldo para cuenta inexistente:
preview = ERROR
estado oficial no muta.

### QA-P13 — Cuenta no pertenece a empresa
Cuenta válida pero empresa incorrecta:
preview = ERROR
estado oficial no muta.

### QA-P14 — Banco opcional inválido
Compromiso con banco informado inexistente:
ERROR.
Sin banco:
válido y NO LOCALIZADO.

### QA-P15 — Anulación excesiva
No se puede anular más del monto pendiente/vigente permitido.

### QA-P16 — Posición negativa
Saldo 100
Compromisos 130
Disponible Gestión = -30
Déficit = 30.

### QA-P17 — Empresa negativa no genera remanente
No debe existir campo calculado de remanente movilizable positivo en CODEX-002.

### QA-P18 — Múltiples cuentas
Empresa con cuentas 40 + 60:
Saldo Bancario Empresa = 100.

### QA-P19 — Múltiples bancos
Empresa con Banco A 70 + Banco B 30:
Saldo Bancario Empresa = 100.
La vista banco conserva 70/30.

### QA-P20 — Originales intactos
Conversión/agregación no modifica amount_original/currency_original de ningún registro.

## Criterios de aceptación
PASS si:
- 20/20 QA pasan;
- no hay doble descuento;
- saldos operan como stock;
- compromisos/reservas son afectaciones separadas;
- VES es cálculo canónico;
- USD sigue siendo vista equivalente;
- compromisos sin banco afectan empresa;
- no se implementa postura;
- no se implementa cobertura;
- no se toca UI;
- no se toca SIGRF.

## Entrega Codex
Debe entregar:
1. archivos modificados;
2. funciones públicas creadas;
3. tests;
4. resultado exacto 20/20;
5. decisiones técnicas;
6. cualquier BLOCKED_BY_FUNCTIONAL_RULE;
7. commit en rama liq-codex-002;
8. no merge a main.

## Estado
LISTA PARA EJECUCIÓN.
