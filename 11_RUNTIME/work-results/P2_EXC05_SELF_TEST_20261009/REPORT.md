# P2 EXC-P2-04/05 — entrega técnica SELF_TEST

Fecha: 2026-10-09. Implementador: Codex. PR #3, qa/pilot-01-f1-p2-restart.
Partida: 5af50fdc829e94a6b62dc909923093a393c5912b.
Orden/aprobación: https://github.com/scastellanost/kiri-gestion-liquidez-intradia/pull/3#issuecomment-6084761588
Evidencia independiente de origen: #6084668117, dictamen Claude global FAIL sobre la partida.
El SHA candidato es el commit que contiene este expediente; se publica completo en el comentario de entrega del PR. Manifiesto de integridad adjunto.

## Contrato y alcance
Aplicados Gobierno Rector, autoridad funcional exclusiva, PROTOCOLO_CODEX, GOV-CONT y contratos LIQ-CODEX-002/002A/003. Opción (a) expresamente aprobada: conservar exactitud de componentes originales homogéneos en moneda destino VES y compatibilidad numérica de FX heterogénea, sin errores no controlados en buildNeedQueue. Archivos previstos/modificados: src/position.js, src/needs.js, prueba nueva test/p2-exc05-fx-compatibility.test.js y evidencia. Sin migraciones, dependencias nuevas, modificaciones de originales, tasas, reglas FX, clasificación/reapertura ni contratos. src/money.js y src/fx.js permanecen idénticos a la partida.

## Corrección
src/position.js añade hasNativePositionComponents(state, empresa, banco): examina exclusivamente saldos y afectaciones activas pertinentes a la empresa/banco solicitado. Si todos los componentes originales están en VES, conserva restas decimales exactas y déficit exacto. Si existe conversión, mantiene resta numérica y déficit previos. Un componente FX en otro banco no degrada la exactitud del banco nativo. Se mantienen agregadores/conversores, tasas obligatorias y rechazo explícito de precisión nativa no representable; no se implementa política de precisión FX nueva.

src/needs.js usa la misma distinción para el total de necesidad vigente. buildNeedQueue captura los errores de cálculo/enlaces/total antes no controlados: devuelve una cola inmutable no publicable, errores con código/detalle, importes derivados null y colecciones vacías cuando no puede construir un resultado seguro. No devuelve un PASS parcial ni omite el error. Si la posición ya era no publicable por tasa ausente, conserva sus errores y total null. La cola no modifica el estado ni repara payloads históricos.

## Pruebas nuevas y contraste
Cinco pruebas propias, sin alterar fuentes o pruebas de Claude:
- Dos casos mínimos del dictamen: USD 5624.34 + VES 82075.82, BCV 36.4721, compromiso VES 5792.17 y reserva VES 18.25; USD 4087.82 + VES 54425.29, BCV 191.6489 y compromiso USD 9024.27. Posición empresa/banco y cola publicables y compatibles.
- 2000 posiciones multimoneda deterministas VES/USD/EUR con tasas BCV 36.5, 36.4721, 37.123456, 40.1234, 191.6489 y EUR_VES variable. Cero posiciones no publicables y cero excepciones en cola, mismos disponibles/déficits/totales que las operaciones numéricas previas sobre agregados. Estado/originales intactos.
- Banco nativo equilibrado 0.30−0.10−0.20=0 pese a FX en otro banco.
- Tasa ausente, precisión nativa no representable y referencia corrupta: error controlado, no publicación.
- Total nativo de cola no representable (1e20+1) tras posición representable: error controlado y derivados null.

Las pruebas nuevas sobre una copia separada del código de partida dan 1 PASS / 4 FAIL, reproducen la regresión y excepciones sin modificar el árbol candidato. La prueba de 2000 casos en ese control se detiene ante el primer fallo; no se atribuye a ese control el muestreo completo del auditor. En el candidato las 2000 iteraciones terminan y verifican empresa, banco, cola y ausencia de mutación. Los barridos cuentan dentro de una prueba, no como miles de casos adicionales.

## Resultados reales
Node v24.19.0, package sin dependencias, sin instalación adicional. npm test ejecuta node --test; este entorno resume la ejecución normal por archivos, por eso se conserva también el TAP sin aislamiento con cada caso.

| Comando/alcance | PASS | FAIL | Evidencia |
|---|---:|---:|---|
| Control de cinco pruebas nuevas sobre partida | 1 | 4 | control-reference.tap |
| npm test final (archivos) | 19 | 0 | final-npm.log |
| npm test -- --test-isolation=none --test-reporter=tap | 397 | 0 | final-full.tap |
| P1: LIQ-CODEX-001 + pilot-p1-monetary-integrity | 30 | 0 | final-p1.tap |
| Dirigidas: seis archivos P2 y oráculos económicos | 49 | 0 | final-directed.tap |

Dirigidas: p2-remediation-decimal, p2-candidate-regression, p2-exc04-position, p2-exc04-boundaries, p2-exc05-fx-compatibility, p2-independent-economic-oracles. Cero FAIL/skipped/cancelled/todo en candidato. S02 conserva barrido de 5008 anulaciones; S08 persistencia corrupta/válida y errores atómicos; S09 conserva 1500 posiciones equilibradas, déficit real 0.01/0.00001, reservas y superávit; S10 jerarquía/desempates; S12 2000 multimoneda, tasas variables y errores de tasa. P1 y regresión íntegra PASS. Evidencia local, no atribuida a Actions ni a Claude.

Comparación del árbol publicado de partida frente a los archivos existentes locales: solo src/needs.js y src/position.js difieren. Pruebas previas, contratos, money.js, fx.js y expedientes anteriores intactos. El manifiesto registra SHA-256 y Git blob SHA de todas las fuentes/pruebas y package; se cotejan con GitHub tras publicación. Publicación fast-forward con expected_sha, sin tocar main/baselines.

## Estado, límites y congelamiento
SELF_TEST_PASS / CANDIDATE_FOR_INDEPENDENT_QA. EXC-P2-04/05 permanecen pendientes de acreditación independiente, sin autocierre. EXC-P2-01/02/03 mantienen acreditación anterior salvo nueva evidencia del auditor. El FAIL global de Claude no queda sustituido por este resultado técnico.
OBS-RQ-01/02 siguen sin nuevas reglas: no reapertura automática ni migración v1. Mandatos agregados y reserva de recomposición FX bloqueados. Permisos/concurrencia y unidades mínimas legales NO_DEMOSTRADO/fuera de contrato. PR DRAFT; sin merge, producción, P3 ni P2 certificado/VALIDATED_FOR_PILOT. Promoción reservada al Líder Funcional tras dictamen independiente.
Congelamiento documental por SHA inmutable; un cambio posterior exige nueva evidencia/candidato. Huellas de integridad identifican contenido, no bloquean físicamente la rama.

## Instrucción expresa a Claude Code
Recuperar el SHA exacto de esta entrega en sesión/árbol separados, verificar manifiesto y contratos; auditar los 13 escenarios P2 con 73+ oráculos independientes, incluyendo RQ2-S12-01/02/03 y RQ-S09-01/02, S02/S08/S09/S10/S12, P1 y regresión completa. Repetir los 2000 multimoneda y 1500 equilibrados, casos mínimos, tasas variables, banco nativo con FX externo, errores controlados, fronteras de representación, originales y ausencia de efectos secundarios. Examinar la compatibilidad de operaciones heterogéneas y la ruta exacta homogénea juntas. Emitir dictamen por escenario/global y acreditar o mantener pendientes EXC-P2-04/05. Publicar solo evidencia de auditoría en rama independiente; no corregir implementación ni aceptar excepciones funcionales por cuenta propia. Esta remisión no afirma ejecución automática de Claude.
