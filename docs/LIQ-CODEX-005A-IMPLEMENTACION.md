# LIQ-CODEX-005A — Implementación y evidencia

Fecha: 2026-10-05. Rama exclusiva: `liq-codex-005a`.
Contrato aplicado: `docs/LIQ-CODEX-005A.md` del commit `643f0711f8b6a56bdbb918a73a327187a8801503`.
Resultado: **158/158 PASS**. Ningún bloqueo funcional pendiente.

## Contrato declarado antes de construir

- Objetivo: estabilizar ventanas que cruzan medianoche y horas inexistentes o repetidas por cambio estacional de hora.
- Incluido: día operativo, calendario y límites asociados a la ventana, resolución de horas y explicaciones exigidas.
- Excluido: cobertura, fuentes alternativas, FX específico, mandatos completos, conciliación, cierre, UI y SIGRF; cambios económicos o de postura.
- Archivos previstos y realizados: `src/bank-restrictions.js`, `test/liq-codex-005.test.js`, `test/liq-codex-005a.test.js` y este documento.
- Funciones públicas: conservar las existentes; corregir la evaluación temporal usada por `evaluateAssignmentRoute`, `evaluateAffectationRoute` y `buildBankRestrictionReport`, y permitir configurar ventanas nocturnas mediante `setBankRestriction`.
- Migraciones: ninguna. No modificar datos guardados ni motores monetario, de posición, necesidades o postura.
- Dependencias: CODEX-001 a CODEX-005, incluidas sus aclaraciones funcionales aprobadas.
- Reglas: cierre inclusivo; día hábil y uso asociados al inicio de ventana; espera de próxima apertura entre ventanas; hora inexistente al primer instante válido posterior; hora repetida a su primera ocurrencia; fecha y zona explícitas.
- Supuestos operativos añadidos: ninguno; la selección entre ventanas aplica el contrato actualizado.
- Bloqueo previo: resuelto por el Líder Funcional y la actualización documental antes de modificar código. No permanece como comportamiento del motor.
- Pruebas: 142 anteriores y los 16 casos de CODEX-005A, incluido QA-5A06B.
- Aceptación: 158/158 PASS, explicaciones verificables y publicación exclusiva en la rama indicada, sin merge a main.

## Decisiones y trazabilidad del cambio aprobado

El 2026-10-05 se aplicó la actualización aprobada del contrato: durante `INTERVALO_ENTRE_VENTANAS` se espera la apertura siguiente. Si la acreditación estimada supera la fecha objetivo, se bloquea; sin fecha objetivo, la espera no constituye por sí sola un bloqueo definitivo. No se introduce una hora arbitraria que divida el intervalo. Afecta QA-5A01, QA-5A06, QA-5A06B y la jornada de QA-5A09. Se descartó conservar el bloqueo automático a las 02:01 porque fue sustituido expresamente por el contrato.

La ventana se representa por fechas e instantes completos, no sólo comparando textos de horas. La continuación posterior a medianoche usa el día anterior de inicio. El intervalo cerrado usa el día de la próxima apertura. El campo de salida `fecha` y las consultas de uso, reservas y propuestas emplean esa misma jornada. Los registros de uso y reservas conservan su fecha explícita: no se reescriben ni se crean reservas al evaluar.

Las aperturas y cierres locales se resuelven con las reglas de la zona indicada mediante `Intl.DateTimeFormat`, ya disponible en Node.js. Se examinan diferencias horarias mediante muestras horarias hasta 48 horas antes y después de la fecha local; al encontrar un salto se localiza su instante exacto con precisión de milisegundo. Esto admite cambios distintos de una hora sin añadir dependencias externas. Si la hora no puede resolverse, se produce `LOCAL_TIME_RESOLUTION_FAILED`; nunca se inventa un equivalente.

La hora inexistente se desplaza al inicio del primer tramo válido posterior, sin conservar minutos, segundos ni fracciones que alejarían ese primer instante. Para una hora repetida se elige el menor instante cronológico. Se explican fecha, hora y zona configuradas e instante elegido. Una fecha de evaluación con desplazamiento horario ya identifica un instante inequívoco y no se reinterpreta como la primera repetición.

La espera calcula la acreditación desde la apertura efectiva. Se conserva la regla de CODEX-005: con fecha objetivo y sin minutos de acreditación, se bloquea con `ACCREDITATION_TIME_REQUIRED`. T1 conserva el siguiente día operativo hábil a la misma hora local; una continuación nocturna mantiene su relación con el día de inicio. Los ajustes estacionales se aplican también a ese cálculo. No se cambian importes ni conversiones.

## Funciones afectadas

- Públicas, por cambio de comportamiento: `setBankRestriction`, `evaluateAssignmentRoute`, `evaluateAffectationRoute`, `buildBankRestrictionReport`. Sin nuevas funciones públicas ni parámetros obligatorios.
- Internas modificadas: `validateRules`, `localInstant`, `evaluate`.
- Internas nuevas: `shiftDay` (desplazar fecha calendario), `overnight` (identificar ventana nocturna), `windowForDay` (resolver apertura y cierre), `operatingWindow` (seleccionar ventana).
- Configuración, uso y reservas conservan la repetición segura de solicitudes y su historial; los motores económicos permanecen intactos.

## Pruebas y evidencia

Comando ejecutado: `node --test`, Node.js v24.21.0, Windows.

```text
tests 158
pass 158
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
| Total | 158 | 0 |

Se conservaron los 40 casos anteriores. Sólo se actualizaron expectativas antes bloqueadas de QA-R13 (hora repetida) y QA-R38 (configuración nocturna).

| Caso nuevo | Comprobación | Resultado |
|---|---|---|
| QA-5A01 | 21:00 espera apertura 22:00 | PASS |
| QA-5A02 | 22:30 y apertura exacta dentro de ventana | PASS |
| QA-5A03 | 23:59 y último milisegundo antes de medianoche | PASS |
| QA-5A04 | 00:30 conserva día anterior, incluso cambio de mes/año | PASS |
| QA-5A05 | 02:00 inclusivo; un milisegundo posterior pasa a próxima ventana | PASS |
| QA-5A06 | Intervalo espera apertura y calcula ETA desde ella | PASS |
| QA-5A06B | Objetivo 12:00 anterior a apertura 22:00 bloquea | PASS |
| QA-5A07 | Continuación sabatina usa viernes y sus feriados; continuidad T1 | PASS |
| QA-5A08 | Inicio sabatino inhábil y su continuación bloquean T0 | PASS |
| QA-5A09 | Uso, reservas y propuestas mantienen límites al cruzar medianoche | PASS |
| QA-5A10 | Hora inexistente al primer instante válido, también salto de media hora | PASS |
| QA-5A11 | Desplazamiento y acreditación incumplen objetivo; cierre efectivo respetado | PASS |
| QA-5A12 | Primera repetición, explicación INFO y cierre en primera ocurrencia | PASS |
| QA-5A13 | Caracas conserva comportamiento; fecha y zona obligatorias | PASS |
| QA-5A14 | Configuración y reservas idempotentes tras guardar y recargar | PASS |
| QA-5A15 | Evaluación repetible sin mutar restricciones, uso, postura ni posición | PASS |

## Términos explicados (GOV-01.1)

- Ventana operativa: período entre apertura bancaria y cierre permitido.
- Día o jornada operativa: fecha de inicio de esa ventana, que puede diferir del calendario después de medianoche.
- `INTERVALO_ENTRE_VENTANAS`: tiempo posterior al cierre y anterior a la próxima apertura; se evalúa la espera y su cumplimiento de la fecha objetivo.
- Cutoff: hora límite para ejecutar; el instante exacto está permitido.
- Deadline: fecha y hora objetivo que la acreditación no debe superar.
- ETA: fecha y hora estimadas de acreditación.
- T0 / T1: ejecución en la jornada aplicable / liquidación en la siguiente jornada hábil según el contrato anterior.
- DST: cambio estacional del reloj local que puede saltarse horas o repetirlas.
- Zona IANA: nombre geográfico que identifica reglas horarias, por ejemplo `America/Caracas`.
- UTC: referencia horaria universal para comparar instantes sin confundir horas locales repetidas. La letra Z en las fechas resultantes indica esta referencia.
- Instante: punto único en el tiempo; una hora local repetida puede identificar dos instantes.
- Desplazamiento horario: diferencia de la hora local respecto de UTC, por ejemplo -04:00.
- Milisegundo: milésima parte de un segundo, usada para comprobar el límite exacto.
- Node.js: programa que ejecuta el motor y sus pruebas. `Intl.DateTimeFormat`: función incorporada que aplica reglas de zona horaria.
- Función pública/API: entrada del motor utilizable por otros componentes. Función interna: operación auxiliar dentro del motor.
- Dependencia externa: biblioteca adicional que requiere instalación y mantenimiento; no se añade ninguna.
- Migración: transformación de datos ya guardados para adaptarlos a cambios del sistema.
- Idempotencia: repetir la misma solicitud identificada no duplica sus efectos.
- Regresión: pruebas anteriores ejecutadas para detectar comportamientos que dejaron de funcionar.
- QA: comprobación frente al contrato. PASS/FAIL: prueba aprobada/fallida.
- `BLOCKED_BY_FUNCTIONAL_RULE`: falta de decisión funcional necesaria; los bloqueos temporales anteriores están resueltos.
- `LOCAL_TIME_RESOLUTION_FAILED`: error técnico explícito si no se logra resolver una hora; no sustituye silenciosamente el dato.
- Commit: registro identificable de una versión. Merge: integración entre ramas; no se realiza hacia main.

## Bloqueos y deuda técnica

Bloqueos funcionales restantes: ninguno. No se deja el bloqueo anterior en el motor ni como decisión pendiente.

Deuda técnica: la resolución depende de los datos de zonas horarias incluidos en Node.js; cambios normativos futuros pueden requerir actualizar ese entorno. No se incorpora una copia independiente de esos datos. Se realizan consultas de zona por evaluación; no se midió rendimiento bajo cargas productivas masivas, fuera de esta orden. No hay funciones futuras ni marcadores pendientes introducidos.

Publicación autorizada exclusivamente en `liq-codex-005a`. No se integra con main.
