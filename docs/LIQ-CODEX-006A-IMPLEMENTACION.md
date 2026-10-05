# LIQ-CODEX-006A — Estabilización de Cobertura Intraempresa

Fecha: 2026-10-05. Rama exclusiva: `liq-codex-006a`.
Base documental: `65e9c8939a345bd15e693d22137dcdd272b316f1`.
Resultado: **213/213 PASS**, sin fallos ni casos omitidos.

## Contrato previo y alcance

- Objetivo: eliminar el segundo descuento consolidado y la limitación por buffer de las relocalizaciones intraempresa de niveles 1 y 2.
- Incluido: selección y cuantificación de fuentes propias, registro simulado de cada tramo, límites compartidos físicos/bancarios y conservación de saldos explicables.
- Excluido: módulos futuros, FX específico, mandatos, What If, conciliación, cierre, UI y SIGRF.
- Archivos previstos y realizados: `src/coverage.js`, `test/liq-codex-006a.test.js` y este documento. No fue necesario modificar `test/liq-codex-006.test.js`.
- Funciones públicas: se conservan `buildCoveragePlan` y `buildCoverageReport`, con el comportamiento corregido. No se añaden funciones públicas ni parámetros obligatorios.
- Estado y migraciones: ninguna modificación de estructura persistida ni migración. La corrección afecta exclusivamente la simulación privada.
- Dependencias: se reutilizan Posición, Postura, Moneda y Restricciones existentes. Ninguno de esos motores se modifica.
- Reglas: niveles 1/2 mantienen disponibilidad consolidada y omiten el límite por buffer; niveles 3/4 mantienen capacidad cedible, descuento y protección de buffer. Todos consumen capacidad física y bancaria simulada.
- Supuestos nuevos: ninguno; el contrato define expresamente la distinción económica.
- Bloqueos: ninguno.
- QA: 198 anteriores más QA-6A01 a QA-6A15. Cierre sólo con 213/213 PASS y publicación exclusiva en esta rama, sin merge a main.

## Cambio funcional aprobado

La instrucción del Líder Funcional y `docs/LIQ-CODEX-006A.md` autorizan el 2026-10-05 corregir la aplicación general de las reglas de cesión de CODEX-006. En niveles 1 y 2 la liquidez permanece dentro de la misma empresa y la obligación ya está descontada en Posición: no existe otra salida consolidada que deba restarse.

Impacto: las propuestas intraempresa ya no se cortan por `saldo_disponible_gestion - buffer`, incluso si la disponibilidad es cero o negativa. Eso no crea ni agrava un déficit: el saldo simulado permanece constante y siguen rigiendo la capacidad libre de las cuentas y todas las restricciones bancarias. No se usa capacidad ya asignada por Postura.

Se descarta mantener el descuento con un buffer cero: seguiría imponiendo un límite consolidado ficticio. También se descarta eliminar todo descuento: dejaría desprotegidas las empresas externas en niveles 3 y 4.

La presente orden sustituye únicamente el tratamiento intraempresa descrito en la implementación anterior. Los contratos y documentos históricos se conservan sin reescribirlos. Pruebas afectadas: los 15 casos nuevos; los 198 existentes pasan sin ajustes.

## Funciones afectadas y decisiones técnicas

- `plan`: identifica los niveles 3/4 como cesiones entre empresas. Sólo en ellos descarta por capacidad cedible agotada, limita el importe por disponibilidad menos buffer y verifica el saldo posterior contra el buffer.
- `recordProposal`: reduce `company.available` únicamente en cesiones entre empresas. En todos los niveles conserva la reducción de capacidad física y la llamada al consumo bancario simulado existente.
- `buildCoveragePlan` y `buildCoverageReport`: reciben la corrección mediante esas funciones internas; sus firmas y formatos permanecen iguales.

Los campos `saldo_fuente_antes` y `saldo_fuente_despues` permanecen iguales para cada relocalización interna. `buffer_fuente` sigue mostrando la configuración para trazabilidad, pero no limita esos tramos. En cesiones externas, los campos reflejan el descuento acumulado y la protección del buffer.

Un informe conserva un único consumo físico por cuenta y un único consumo bancario simulado compartido entre necesidades. No se modifica `consumeBankCapacity`, la evaluación de rutas, el orden de necesidades, la jerarquía de niveles ni la lógica de conversión. No hay dependencias nuevas.

## Evidencia de QA

Entorno: Windows, Node.js v24.21.0. Comando: `node --test`.

```text
tests 213
pass 213
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
| CODEX-006A | 15 | 0 |
| Total | 213 | 0 |

| Caso | Evidencia | Resultado |
|---|---|---|
| QA-6A01 | Nivel 1 cubre 30 y mantiene saldo consolidado 40 | PASS |
| QA-6A02 | Nivel 2 cubre 20 y mantiene saldo consolidado cero | PASS |
| QA-6A03 | Disponible 20, buffer 20: nivel 1 moviliza 15 | PASS |
| QA-6A04 | Buffer superior a disponibilidad no bloquea nivel 2 | PASS |
| QA-6A05 | Nivel 3: fuente 50, buffer 10, cede 30 y queda en 20 | PASS |
| QA-6A06 | Nivel 4: fuente 50, buffer 10, cede 30 y queda en 20 | PASS |
| QA-6A07 | Necesidades 20+20 comparten 30 físicos: total 30, no 40 | PASS |
| QA-6A08 | Disponible 10 no limita 30 físicos libres; saldo simulado sigue 10 | PASS |
| QA-6A09 | Hora límite, máximo diario y número de operaciones rigen niveles 1/2 | PASS |
| QA-6A10 | Necesidades y cuentas comparten máximo diario y operaciones | PASS |
| QA-6A11 | Tramos mixtos conservan saldo propio y descuentan sólo fuente externa | PASS |
| QA-6A12 | Niveles 3/4 conservan buffer; múltiples necesidades no lo exceden | PASS |
| QA-6A13 | Estado, posición, originales y reservas oficiales intactos | PASS |
| QA-6A14 | Postura intacta; no reutiliza la cuenta ya asignada | PASS |
| QA-6A15 | Plan e informe repetibles con los mismos datos | PASS |

## Términos explicados — GOV-01.1

- Intraempresa: entre cuentas o bancos de la misma empresa.
- Relocalización interna: cambiar el lugar desde el que se atendería una obligación sin sacar liquidez de la empresa.
- Intercompany o cesión entre empresas: propuesta que sí extrae liquidez de una empresa fuente distinta del destino.
- Disponibilidad consolidada: saldo de la empresa después de sus compromisos pendientes y reservas, calculado por Posición.
- Buffer operativo: mínimo protegido al proponer una cesión a otra empresa; no limita relocalizaciones internas.
- Capacidad física: saldo de cuenta que Postura no ha asignado a necesidades activas.
- Capacidad bancaria simulada: límites que las rutas propuestas consumirían, sin crear reservas oficiales.
- Tramo: parte de la cobertura aportada por una cuenta.
- API o función pública: entrada del motor utilizable por otros componentes; su firma es la lista de datos que recibe.
- Migración: transformación de datos guardados; no se necesita en esta orden.
- QA y regresión: comprobaciones del contrato nuevo y de comportamientos anteriores. PASS/FAIL: prueba aprobada/fallida.
- Determinismo: los mismos datos producen el mismo resultado.
- Commit: versión identificable de los archivos. Merge: integración entre ramas; no se realiza hacia main.

## Bloqueos y deuda técnica

No quedan bloqueos `BLOCKED_BY_FUNCTIONAL_RULE` ni ambigüedades identificadas para esta corrección.

Deuda técnica nueva: ninguna identificada. Se conservan los límites previamente documentados de CODEX-006: rendimiento masivo no medido y representación numérica del núcleo monetario aprobado. No se incorporan módulos futuros ni cambios en el estado oficial.

Publicación exclusivamente en `liq-codex-006a`, sin merge a main.
