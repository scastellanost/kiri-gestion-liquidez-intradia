# P2 — Entrega técnica candidata / SELF_TEST

Fecha: 2026-10-09. Implementador: Codex. PR #3, rama qa/pilot-01-f1-p2-restart.
Orden: https://github.com/scastellanost/kiri-gestion-liquidez-intradia/pull/3#issuecomment-6083721320
Referencia inicial: 13787f73ec49a6f47017edf1816a029d8cde35be.
Versión candidata: commit que contiene este expediente; su SHA completo se publica en el comentario de entrega del PR. El manifiesto identifica cada archivo ejecutable por SHA-256 y Git blob SHA.

## Alcance y contratos
Se leyeron Gobierno Piloto, GOV-KIRI-AUTORIDAD-FUNCIONAL-EXCEPCIONES, GOV-CONT, PROTOCOLO_CODEX, contratos LIQ-CODEX-002/002A/003, orden P2, propuesta y puerta monetaria. Aprobación funcional #6082751466: precisión decimal sin redondear originales, validación integral y orden R1→R2→R3→R4. Sin cambios de reglas, FX ni baseline.

## Hallazgo y corrección
La primera regresión sobre la referencia publicada dio 376/377 PASS, 1 FAIL: QA-RSV38, snapshot persistente de reserva cancelada. La anulación dejaba la necesidad vinculada ACTIVA, mientras la nueva validación rechazaba esa contradicción. Se corrige src/position.js: cierre atómico de necesidades activas vinculadas cuando la afectación queda ANULADA o pendiente cero sin seguimiento; conserva originales, clasificación, idempotencia e historial antes/después. El seguimiento explícito continúa activo si la afectación no está anulada.

src/needs.js completa validación de catálogo, stock por cuenta/moneda sin duplicados, propiedad/monedas/timestamps de saldos, banco asignado, origen y vínculos/identidad económica incluso en necesidades cerradas. Los montos actuales de clasificaciones anteriores pueden diferir del vigente tras ajustes: la cola obtiene el vigente de la afectación. No se repara ningún payload al cargar; error estable INVALID_STORED_NEED_STATE y cero escrituras al rechazar.

test/p2-candidate-regression.test.js añade seis pruebas: 5008 secuencias de anulación en VES/USD/EUR y compromisos/reservas; escalas variables y exponentes; rechazo explícito de precisión irrepresentable; cierres persistentes e idempotentes; doce mutaciones de catálogo/stock/vínculos; desempates S10; ajuste confirmado a cero con/sin seguimiento.

## Resultados reales
Entorno: Node v24.19.0. package.json sin dependencias; no fue necesaria instalación. npm test ejecuta node --test.

| Ejecución | PASS | FAIL | Evidencia |
|---|---:|---:|---|
| Referencia, regresión detallada | 376 | 1 | initial-full.tap |
| Final npm test, archivos de prueba | 16 | 0 | final-npm.log |
| Final npm test -- --test-isolation=none --test-reporter=tap | 383 | 0 | final-full.tap |
| P1: LIQ-CODEX-001 + pilot-p1-monetary-integrity | 30 | 0 | final-p1.tap |
| Dirigidas S02/S08/S10 | 14 | 0 | final-directed.tap |

En este entorno node --test con aislamiento resume por archivo; se añadió la ejecución sin aislamiento para conservar los nombres y el recuento de los 383 casos. Cero skipped/cancelled/todo. La muestra de 5008 operaciones está dentro de una prueba, no se suma al conteo 383. SELF_TEST del implementador, no certificación independiente ni nuevo dictamen de Claude.

EXC-P2-01: evidencia técnica favorable a decimales exactos, sin residuos ni necesidades fantasma, exceso rechazado sin mutación; originales intactos y rechazo de resultados no representables. Motor de conversión FX sin cambios; P1 PASS.
EXC-P2-02: evidencia técnica favorable a rechazo de estados corruptos y persistencia válida, incluida la regresión que inicialmente falló.
EXC-P2-03: jerarquía ratificada intacta; pruebas de precedencia y todos los desempates PASS.
Las tres excepciones permanecen OPEN/PENDING_INDEPENDENT_VERIFICATION, sin cierre por Codex.

## Recuperación y trazabilidad
git fetch falló por conexión a proxy:8080. Se recuperaron los 92 blobs del SHA inicial mediante el conector GitHub. Se comprobaron los Git blob SHA; dos JSON documentales sin salto final se normalizaron a sus bytes originales. Fuentes/pruebas iniciales coinciden con GitHub. Publicación mediante Git Data API, sobre el árbol inicial, con actualización fast-forward y expected_sha, sin tocar main. No se atribuye un resultado Actions a esta ejecución local.

## Congelamiento y siguiente instrucción operativa
Congelar como candidata la versión exacta publicada en el PR; cualquier cambio posterior invalida este congelamiento y requiere nueva evidencia. Claude Code debe trabajar en sesión independiente, recuperar ese SHA, verificar el manifiesto y repetir S01–S13, ampliar su arnés de 43+ casos y exigir P1/regresión completa. Foco S02/S08/S10, conversiones, fronteras, idempotencia y persistencia corrupta/válida. Auditar cierre atómico y validación de stocks. Emitir dictamen por escenario y global; acreditar o mantener pendiente cada excepción sin modificar código ni aceptar excepciones por cuenta propia.

Estado técnico: SELF_TEST_PASS / CANDIDATE_FOR_INDEPENDENT_QA. PR DRAFT. Sin merge, producción, P3 ni VALIDATED_FOR_PILOT. Mandatos agregados y reserva de recomposición FX siguen bloqueados. Permisos/concurrencia y unidades mínimas legales continúan NO_DEMOSTRADO/fuera de contrato. La promoción final corresponde al Líder Funcional después del dictamen independiente.

SHA-256: huella de integridad del archivo; Git blob SHA: identidad del contenido versionado; congelamiento: referencia reproducible por commit, sin bloqueo físico de la rama. Deuda de esta entrega: dictamen independiente pendiente; límites funcionales anteriores intactos.
