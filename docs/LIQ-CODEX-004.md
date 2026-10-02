# LIQ-CODEX-004 — Postura Empresa → Banco → Cuenta

## Objetivo
Construir el motor de localización física de afectaciones dentro de la liquidez disponible, sin crear un segundo efecto económico.

Base aprobada:
- CODEX-001 Moneda
- CODEX-002 Posición
- CODEX-002A Continuidad
- CODEX-003 Necesidades/Prioridad/Reclasificación

## Principio rector
La postura bancaria LOCALIZA la afectación económica.
No crea una segunda afectación.
La empresa consolidada gobierna siempre la disponibilidad.

## Alcance
Implementar:
- reglas de postura por empresa;
- orden de preferencia de bancos;
- orden de preferencia de cuentas dentro de cada banco;
- localización parcial o total de afectaciones;
- consumo de múltiples cuentas del mismo banco antes de saltar a otro banco;
- afectaciones sin banco asignado;
- residuales no localizados;
- explicación del recorrido;
- consistencia con posición consolidada;
- trazabilidad e idempotencia.

## No tocar
NO implementar:
- restricciones bancarias operativas/cutoff/límites;
- cobertura entre empresas;
- motor de fuentes de cobertura;
- FX T+1 específico;
- What If;
- mandatos;
- conciliación;
- cierre;
- UI;
- SIGRF.

## Regla 1 — Postura no altera economía
Una afectación ya reduce disponibilidad a nivel empresa desde Posición.
Asignarla a banco/cuenta:
- no vuelve a descontarla;
- no cambia saldo_disponible_gestion empresa;
- solo localiza dónde queda soportada físicamente.

## Regla 2 — Empresa primero
La postura se construye dentro de una empresa.
No usar saldos de otras empresas en CODEX-004.

## Regla 3 — Configuración de postura
Cada empresa puede definir:
- orden_bancos: lista ordenada de bancos válidos;
- orden_cuentas_por_banco: listas ordenadas de cuentas válidas de esa empresa/banco.

No derivar postura del orden de archivos fuente.
No inferir preferencias silenciosamente.

## Regla 4 — Cuenta elegible
Una cuenta es elegible si:
- pertenece a la empresa;
- pertenece al banco de la ruta;
- moneda compatible o convertible según motor monetario;
- tiene saldo vigente positivo;
- no está marcada como moneda ambigua/no utilizable en catálogo.

CODEX-004 no introduce restricciones adicionales.

## Regla 5 — Regla intrabanco
Para una afectación asignada a un banco:
1. recorrer cuentas elegibles de ese mismo banco según orden configurado;
2. consumir una cuenta hasta su capacidad disponible;
3. continuar en la siguiente cuenta del mismo banco;
4. solo si queda residual, mantenerlo como déficit/localización incompleta del banco;
5. NO saltar a otro banco automáticamente si la afectación está explícitamente asignada a ese banco.

Ejemplo rector:
Compromiso = 16
Banco X:
- Cuenta 1 = 10
- Cuenta 2 = 8
Resultado:
- C1 soporta 10
- C2 soporta 6
- residual = 0
- C2 conserva 2
No saltar a otro banco después de consumir C1.

## Regla 6 — Afectación sin banco asignado
Si banco_asignado = null:
- sigue afectando a empresa;
- se puede localizar usando postura configurada de bancos;
- recorrer bancos en orden definido;
- dentro de cada banco consumir todas sus cuentas elegibles antes de pasar al siguiente;
- si no hay postura configurada, queda NO LOCALIZADO.

## Regla 7 — Banco explícito
Si banco_asignado tiene valor:
- usar solo ese banco en CODEX-004;
- no usar otro banco para completar residual;
- residual queda NO LOCALIZADO_EN_BANCO / déficit localizado pendiente.

El uso de otro banco pertenece al motor de cobertura posterior.

## Regla 8 — Capacidad de cuenta
capacidad_cuenta_postura = saldo vigente de la cuenta
- asignaciones previas de postura activas sobre esa cuenta.

Nunca permitir capacidad negativa.
Nunca asignar por encima de saldo disponible de la cuenta.

No restar nuevamente compromisos/reservas globales fuera de las asignaciones de postura.

## Regla 9 — Orden de afectaciones
Para localizar varias afectaciones:
- usar el orden de la cola de necesidades CODEX-003 cuando exista;
- UNCLASSIFIED_NEED se procesa después de necesidades clasificadas;
- reservas activas también pueden localizarse;
- no inventar nueva prioridad.

## Regla 10 — Consistencia económica
La suma de asignaciones de una afectación + residual = monto pendiente económico de esa afectación.

Para COMPROMISO:
pendiente = monto_vigente - monto_reflejado_confirmado.

Para RESERVA:
pendiente = monto_vigente.

## Regla 11 — No doble uso de cuenta
Una misma unidad de saldo de cuenta no puede asignarse a dos afectaciones activas.

El motor debe mantener capacidad restante por cuenta durante el recorrido.

## Regla 12 — Afectaciones cerradas
Afectaciones ANULADAS o con pendiente económico 0:
- no participan en postura activa;
- asignaciones anteriores deben considerarse liberadas/no vigentes en una reconstrucción de postura.

## Regla 13 — Reconstrucción
La postura debe ser reconstruible de forma determinística desde:
- saldos vigentes;
- afectaciones activas;
- necesidades/prioridad;
- configuración de postura.

Preferir reconstrucción pura antes que acumulación manual de saldos asignados.

## Regla 14 — Salida por afectación
Exponer como mínimo:
- affectation_id
- empresa
- naturaleza
- monto_pendiente
- banco_asignado
- asignaciones: [{ banco, cuenta, monto_asignado, moneda }]
- monto_localizado
- monto_no_localizado
- estado_localizacion:
  - LOCALIZADA_TOTAL
  - LOCALIZADA_PARCIAL
  - NO_LOCALIZADA

## Regla 15 — Salida por cuenta
Exponer:
- empresa
- banco
- cuenta
- saldo_vigente
- monto_asignado_postura
- capacidad_restante_postura

## Regla 16 — Salida por banco
Exponer:
- empresa
- banco
- saldo_bancario
- monto_asignado_postura
- capacidad_restante_postura
- afectaciones_localizadas
- residual_no_localizado_en_banco

No llamar a esto remanente movilizable.

## Regla 17 — Moneda
La postura calcula capacidad en VES canónico usando CODEX-001.

Los originales permanecen intactos.
No convertir ni reescribir el saldo original almacenado.

Si falta tasa:
- postura no publicable para la ruta afectada;
- no asignar parcialmente ignorando moneda sin tasa.

## Regla 18 — Configuración inválida
Errores:
- banco no pertenece al catálogo;
- cuenta no pertenece a empresa/banco;
- cuenta repetida;
- banco repetido;
- cuenta omitida puede seguir existiendo pero no participa en postura configurada;
- configuración vacía es válida y produce NO LOCALIZADO para afectaciones sin banco.

## Regla 19 — Idempotencia de configuración
Toda actualización manual de postura:
- request_id obligatorio;
- mismo payload = sin duplicación;
- payload distinto con mismo request_id = IDEMPOTENCY_CONFLICT.

## Regla 20 — Trazabilidad
Conservar eventos de:
- SET_POSTURE_CONFIG
- CLEAR_POSTURE_CONFIG

con:
- empresa
- antes
- después
- origen
- usuario
- timestamp
- request_id

## Regla 21 — Separación de responsabilidades
CODEX-004:
- localiza;
- consume capacidad técnica de cuentas;
- explica ruta.

NO decide:
- si otro banco puede cubrir;
- si otra empresa puede cubrir;
- si una transferencia es viable;
- si hay cutoff/límite;
- si debe emitirse mandato.

## QA obligatorio

QA-B01 — Configuración válida
Empresa E con bancos A/B y cuentas válidas.
Se persiste orden exacto.

QA-B02 — Cuenta inválida
Cuenta inexistente en configuración:
ERROR.

QA-B03 — Cuenta de otra empresa
ERROR.

QA-B04 — Banco duplicado
ERROR.

QA-B05 — Cuenta duplicada
ERROR.

QA-B06 — Afectación con banco asignado
Compromiso 16 asignado Banco A, cuentas A1=10, A2=8.
Resultado 10+6, residual 0.

QA-B07 — No saltar de banco explícito
Compromiso 20 Banco A, A total 15, Banco B tiene 100.
Resultado localizado 15 en A, residual 5.
No usar B.

QA-B08 — Sin banco usa postura
Compromiso 20 sin banco.
Postura A→B.
A tiene 15, B tiene 10.
Resultado A=15, B=5.

QA-B09 — Intrabanco antes de siguiente banco
A1=10, A2=8, B1=100, necesidad 16.
Resultado A1=10, A2=6, B1=0.

QA-B10 — No doble uso
Dos afectaciones 12 y 8; cuenta única 15.
Primera según cola toma 12, segunda toma 3, residual segunda 5.

QA-B11 — Orden por cola
P1 y P3 compiten por capacidad limitada.
P1 se localiza primero.

QA-B12 — UNCLASSIFIED después
Necesidad clasificada y afectación UNCLASSIFIED compiten.
Clasificada primero.

QA-B13 — Reserva localizable
Reserva activa usa misma lógica de postura sin cambiar economía.

QA-B14 — Posición empresa inalterada
Antes y después de construir postura:
saldo_disponible_gestion idéntico.

QA-B15 — Suma asignación + residual
Para cada afectación:
monto_localizado + monto_no_localizado = pendiente económico.

QA-B16 — Cuenta no negativa
Nunca capacidad_restante_postura < 0.

QA-B17 — Afectación anulada
No consume postura.

QA-B18 — Pendiente cero
No consume postura.

QA-B19 — Reconstrucción determinística
Mismos inputs => misma postura.

QA-B20 — Cambio de saldo reconstruye
Cuenta pasa 10→20.
Reconstrucción refleja nueva capacidad sin duplicar asignaciones antiguas.

QA-B21 — Sin configuración
Afectación sin banco queda NO_LOCALIZADA.

QA-B22 — Banco explícito sin configuración
Si banco asignado existe, usar cuentas elegibles del banco según orden de cuenta configurado.
Si banco no tiene orden de cuentas configurado, NO_LOCALIZADA.

QA-B23 — Moneda convertible
Cuenta USD con BCV válida participa por equivalente VES.

QA-B24 — Moneda sin tasa
Ruta que requiere conversión:
publicable false / MISSING_EXCHANGE_RATE.
No asignación parcial silenciosa.

QA-B25 — Originales intactos
Ninguna postura altera amount_original/currency_original.

QA-B26 — Vista cuenta
Saldo 10, asignado 6 => capacidad restante 4.

QA-B27 — Vista banco
Banco A saldo 18, asignado 16 => capacidad 2.

QA-B28 — Banco explícito residual
Debe exponerse residual_no_localizado_en_banco.

QA-B29 — Idempotencia config
Mismo request_id/payload no duplica evento.

QA-B30 — Conflicto idempotencia
Mismo request_id/payload distinto => IDEMPOTENCY_CONFLICT.

## Regresión
Conservar:
- CODEX-001 15
- CODEX-002 20
- CODEX-002A 12
- CODEX-003 25

CODEX-004:
- 30 QA

Total esperado:
102/102 PASS

## Criterio de cierre
PASS si:
- 102/102;
- postura no altera disponibilidad empresa;
- no doble asignación de cuenta;
- intrabanco antes de siguiente banco;
- banco explícito no salta a otro banco;
- sin banco usa postura;
- no se implementan restricciones ni cobertura;
- no UI;
- no SIGRF.

## Entrega Codex
1. archivos modificados;
2. APIs públicas creadas;
3. tests;
4. 102/102;
5. decisiones técnicas;
6. bloqueos;
7. commit en liq-codex-004;
8. no merge a main.

## Estado
LISTA PARA EJECUCIÓN.
