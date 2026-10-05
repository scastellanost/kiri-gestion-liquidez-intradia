# LIQ-CODEX-006 — Motor de Cobertura: implementación

Fecha: 2026-10-05. Rama exclusiva: `liq-codex-006`.
Base del contrato: `53e7a04e91867956277b0f0a07ea9769a9622d53`.
Resultado: **198/198 PASS**. CODEX-005A se recibe aprobado; no se reabre su decisión funcional.

## Contrato previo y alcance realizado

- Objetivo: proponer cobertura de residual o localización no ejecutable, sin ejecutar movimientos ni crear otra afectación económica.
- Incluido: jerarquía 1→2→3→4; capacidad económica y física; protección de fuentes; buffer opcional; restricciones bancarias; combinación parcial de fuentes; explicación de selección y descarte; configuración trazable e idempotente.
- Excluido: ejecución de transferencias, mandatos, FX específico, What If, conciliación, cierre, UI y SIGRF.
- Archivos previstos y realizados: `src/coverage.js`, `test/liq-codex-006.test.js`, este documento.
- Funciones públicas: `setCoveragePolicy`, `clearCoveragePolicy`, `buildCoveragePlan`, `buildCoverageReport`.
- Estado: configuración opcional `coveragePolicies` por empresa; solicitudes y eventos SET/CLEAR en las colecciones existentes. Ausencia de configuración equivale a buffer cero. Sin migración obligatoria ni modificación de saldos.
- Dependencias reutilizadas: CODEX-001 para conversión; CODEX-002/002A para disponibilidad; CODEX-003/004 para orden y capacidad física; CODEX-005/005A para viabilidad bancaria.
- Reglas: no descontar otra vez compromisos/reservas al obtener disponibilidad; no usar capacidad ya asignada; no ceder por debajo del buffer; no mutar el estado oficial al construir planes.
- Supuestos operativos: no se inventa destino ni preferencia corporativa. Las dos decisiones consultadas fueron resueltas antes de implementar selección de rutas.
- Pruebas obligatorias: 158 anteriores y QA-C01 a QA-C40.
- Aceptación: 198/198 PASS, jerarquía respetada, sin doble uso de capacidad ni déficit nuevo en fuente, publicación exclusiva en esta rama y sin merge a main.

## Decisiones funcionales aprobadas

Aprobadas por el Líder Funcional en esta conversación, el 2026-10-05:

1. Si una fuente con capacidad 100 sólo puede operar 30 por límite bancario y la necesidad es 50, proponer hasta 30, volver a validar con CODEX-005 y buscar los 20 restantes. Sustituye la alternativa de descartar toda la ruta por exceder el importe original. Impacta QA-C04, QA-C15, QA-C18, QA-C22 y QA-C27.
2. Para una necesidad sin banco asignado, exigir `banco_destino` explícito; `cuenta_destino` es opcional y permite comprobar la prohibición de transferir a la misma cuenta. Se descarta inferir un banco o una cuenta. Impacta QA-C21 y QA-C36.

No queda `BLOCKED_BY_FUNCTIONAL_RULE` pendiente.

## Uso de las funciones públicas

```js
setCoveragePolicy(state, {
  empresa: 'E',
  buffer_operativo_ves: 30,
  origen: 'TESORERIA',
  usuario: 'operador', // opcional
  fecha_hora_evento: '2026-10-05T10:00:00-04:00'
}, request_id);

clearCoveragePolicy(state, {
  empresa: 'E',
  origen: 'TESORERIA',
  fecha_hora_evento: '2026-10-05T10:00:00-04:00'
}, request_id);

buildCoveragePlan(state, affectation_id, context, monetaryState);
buildCoverageReport(state, empresa, context, monetaryState);
```

Contexto de evaluación:

- `fecha_hora_evaluacion`, `zona_horaria` y `settlement` (T0/T1) explícitos.
- `banco_destino` obligatorio si no existe banco asignado; si existe, un banco de contexto distinto produce `DESTINATION_BANK_MISMATCH`.
- `cuenta_destino` opcional, validada contra empresa y banco destino.
- `fecha_hora_objetivo` opcional; la fecha de la necesidad activa vinculada tiene precedencia.
- `moneda_operacion_por_cuenta` permite indicar moneda por cuenta; `moneda_operacion` permite una moneda común. Si el catálogo admite una sola moneda, se usa esa moneda explícita del catálogo. Una cuenta con varias monedas requiere selección explícita: `OPERATION_CURRENCY_REQUIRED`. No se inventa una operación de cambio.
- El tipo intrabanco/interbanco de cada ruta se obtiene comparando los bancos fuente y destino conocidos. El campo opcional `tipo_ruta`, si se proporciona, debe ser válido.
- Para el informe por empresa, `por_afectacion` permite aportar contexto específico por identificador de afectación, por ejemplo destinos para obligaciones sin banco. Cada contexto resultante se valida.

El informe construye los planes en el orden de Postura, que hereda Necesidades: clasificadas primero y sin clasificación después. Comparte el consumo simulado entre esos planes. Llamadas independientes a `buildCoveragePlan` son escenarios independientes; para combinar varias necesidades debe usarse `buildCoverageReport`.

## Decisiones técnicas

1. **Capacidad económica:** se obtiene mediante `calculateCompanyPosition`; se aplica exclusivamente la resta del buffer y de cesiones propuestas en esta simulación. No se duplican fórmulas de disponibilidad ni descuentos de compromisos.
2. **Capacidad física:** se toma de `buildPosture`. Se mantienen copias de capacidad restante por cuenta; nunca se liberan asignaciones de postura, ni siquiera porque una ruta esté bloqueada.
3. **Necesidad:** residual no localizado más importe de asignaciones bloqueadas por CODEX-005, sin crear afectaciones. Una localización ejecutable completa produce `SIN_NECESIDAD_DE_COBERTURA`. Si no puede cuantificarse por falta de tasa, el importe queda nulo y la salida no publicable, con explicación; no se sustituye por cero.
4. **Jerarquía:** se recorre nivel por nivel. Dentro de otras empresas se ordena por capacidad económica cedible descendente e identificador estable. Dentro del banco se usa el orden configurado de cuentas. Los bancos alternativos respetan el orden de Postura.
5. **Viabilidad:** cada propuesta se valida con `evaluateAssignmentRoute`. Los bloqueos por importe diario o número de operaciones permiten calcular el importe menor a partir de la explicación y configuración efectiva devueltas por CODEX-005, y se vuelve a validar. Los demás bloqueos no se eluden.
6. **Límites compartidos:** las propuestas aceptadas y las localizaciones ejecutables del informe consumen capacidad bancaria en una copia privada. CODEX-005 consulta esa copia junto con el uso y reservas existentes. No se llama a la operación de reserva oficial, no se agregan eventos oficiales ni se libera capacidad oficial.
7. **Moneda:** cálculo del plan en VES; límites bancarios en moneda de operación usando exclusivamente `createMoney` y `convertMoney`. Una empresa con posición incompleta por falta de tasa no se convierte en fuente mediante una suma parcial.
8. **Trazabilidad:** cada tramo conserva nivel, fuente/destino, importe, saldo anterior/posterior, buffer, capacidad física anterior/posterior, viabilidad, condiciones, operaciones bancarias, acreditación estimada y motivo. Los descartes incluyen empresa, cuenta/banco cuando corresponde, motivo estable y evaluación bancaria si aplica.
9. **Misma cuenta:** nunca se propone una transferencia hacia sí misma. La cuenta ya localizada no necesita cobertura; si se encuentra como candidata, se identifica `SAME_ACCOUNT_REQUIRES_LOCALIZATION` y su capacidad localizable, sin crear un movimiento. No se modifica Postura desde Cobertura.
10. **Configuración:** buffer finito y no negativo, empresa válida y datos de origen/fecha. Mismo identificador y contenido es idempotente; contenido distinto produce conflicto. Guardado y carga reutilizan la persistencia existente de estado.
11. **Inmutabilidad:** entradas oficiales intactas y resultados protegidos frente a modificación accidental. El saldo posterior de una fuente es una simulación, no un nuevo saldo guardado.

## Evidencia QA

Entorno: Windows, Node.js v24.21.0. Comando completo: `node --test`.

```text
tests 198
pass 198
fail 0
cancelled 0
skipped 0
todo 0
```

| Orden | PASS | FAIL |
|---|---:|---:|
| CODEX-001 | 15 | 0 |
| CODEX-002 | 20 | 0 |
| CODEX-002A | 12 | 0 |
| CODEX-003 | 25 | 0 |
| CODEX-004 | 30 | 0 |
| CODEX-005 | 40 | 0 |
| CODEX-005A | 16 | 0 |
| CODEX-006 | 40 | 0 |
| Total | 198 | 0 |

Los archivos de pruebas anteriores no se modificaron.

| Caso | Comprobación | Resultado |
|---|---|---|
| QA-C01 | Localización completa ejecutable sin cobertura | PASS |
| QA-C02 | Nivel 1 cubre todo | PASS |
| QA-C03 | Nivel 1 parcial y nivel 2 completa | PASS |
| QA-C04 | No salta nivel con capacidad viable, incluida reducción bancaria | PASS |
| QA-C05 | Otra empresa mismo banco, nivel 3 | PASS |
| QA-C06 | Otra empresa otro banco, nivel 4 | PASS |
| QA-C07 | Fuente negativa descartada | PASS |
| QA-C08 | 100 menos buffer 30 permite ceder 70 | PASS |
| QA-C09 | 50 menos buffer 10 permite 40, nunca 41 | PASS |
| QA-C10 | Capacidad física 25 limita disponibilidad económica 100 | PASS |
| QA-C11 | No reutiliza saldo ya asignado a reservas propias | PASS |
| QA-C12 | Respeta orden de cuentas y agota capacidad | PASS |
| QA-C13 | Ruta bloqueada se descarta | PASS |
| QA-C14 | Conserva aprobación adicional y espera de apertura | PASS |
| QA-C15 | Conserva división en tres operaciones y máximo diario de operaciones | PASS |
| QA-C16 | Necesidad 100, cubierto 60, residual 40 | PASS |
| QA-C17 | Sin fuentes no inventa cobertura | PASS |
| QA-C18 | Múltiples fuentes/necesidades sin doble uso físico ni bancario; respeta prioridad | PASS |
| QA-C19 | Mayor capacidad cedible primero, considerando buffer | PASS |
| QA-C20 | Desempate estable por identificador | PASS |
| QA-C21 | Sin transferencia a la misma cuenta; valida titularidad destino | PASS |
| QA-C22 | USD convertido por BCV y límite bancario en USD | PASS |
| QA-C23 | Sin tasa, no usa agregación parcial de la fuente | PASS |
| QA-C24 | Monedas y montos originales intactos | PASS |
| QA-C25 | Posición de todas las empresas intacta | PASS |
| QA-C26 | Postura y asignaciones intactas | PASS |
| QA-C27 | Uso y reservas oficiales respetados e intactos | PASS |
| QA-C28 | Buffer no es afectación ni modifica Posición | PASS |
| QA-C29 | Política idempotente, incluso tras guardar/cargar | PASS |
| QA-C30 | Conflicto por solicitud repetida con distinto contenido | PASS |
| QA-C31 | Clear elimina buffer sin modificar Posición | PASS |
| QA-C32 | Fuente 30 con buffer 20 cede 10 | PASS |
| QA-C33 | Todas las fuentes conservan buffer y capacidad no negativa | PASS |
| QA-C34 | Parte bloqueada conserva residual; deadline gobierna ruta | PASS |
| QA-C35 | Plan e informe determinísticos | PASS |
| QA-C36 | Fecha/zona explícitas y destino sin banco informado obligatorios | PASS |
| QA-C37 | Nivel y selección explicables | PASS |
| QA-C38 | Descartes con motivos estables y evidencia | PASS |
| QA-C39 | Sin módulo ni reservas de FX específico | PASS |
| QA-C40 | Sin mandatos, ejecución ni mutación oficial | PASS |

## Glosario GOV-01.1

- Buffer operativo: mínimo de liquidez que debe conservar la empresa fuente; no es una reserva económica.
- Capacidad cedible: importe que la fuente puede aportar manteniendo su buffer.
- Capacidad física: saldo libre en cuentas después de asignaciones de Postura.
- Simulación: cálculo de cómo quedarían capacidades tras propuestas, sin ejecutar ni guardar movimientos.
- Tramo: parte de la cobertura aportada por una cuenta fuente.
- Residual: importe que todavía falta cubrir.
- Split o división bancaria: separación de un importe en varias operaciones por el límite de cada operación.
- Intrabanco/interbanco: movimiento entre cuentas del mismo banco/de bancos distintos.
- Intercompany: entre empresas distintas.
- ETA: fecha y hora estimadas de acreditación. Deadline: fecha y hora objetivo máxima.
- T0/T1: ejecución en la jornada aplicable/liquidación en la siguiente jornada hábil según el motor bancario aprobado.
- API o función pública: entrada del motor utilizable por otros componentes.
- Idempotencia: repetir una solicitud identificada no duplica efectos. Request_id: identificador de esa solicitud.
- Inmutabilidad: no cambiar los datos recibidos al calcular un resultado.
- Determinismo: mismos datos producen el mismo resultado.
- Migración: transformación de datos guardados para adaptar su estructura.
- QA: comprobación frente al contrato. PASS/FAIL: aprobada/fallida.
- Regresión: pruebas anteriores para detectar comportamientos que dejaron de funcionar.
- BLOCKED_BY_FUNCTIONAL_RULE: decisión de negocio pendiente; no queda ninguna en esta orden.
- Commit: versión identificable de archivos. Merge: integración entre ramas; no se realiza hacia main.

## Bloqueos, deuda técnica y límites

Bloqueos restantes: ninguno. Las dos consultas de CODEX-006 fueron resueltas; no permanece el bloqueo de CODEX-005A.

Deuda técnica: se reconstruyen posiciones y posturas por simulación para priorizar consistencia; no se midió rendimiento masivo. Se conserva la representación numérica del núcleo monetario aprobado, sin introducir una política nueva de redondeo. El informe coordina una empresa destino por llamada; no se inventa una prioridad corporativa entre empresas destino. La selección de moneda de una cuenta multimoneda exige un dato explícito.

No se modifican los motores aprobados, no se ejecutan transferencias ni se crean mandatos. Publicación únicamente en `liq-codex-006`; sin merge a main.
