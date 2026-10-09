# P2 / EXC-P2-04 — SELF_TEST y versión candidata

Fecha: 2026-10-09. Implementador: Codex. PR #3, rama qa/pilot-01-f1-p2-restart.
Referencia probada: 585fdfad3d59fac556a1f828542e30af3c65c83e.
Aprobación funcional: https://github.com/scastellanost/kiri-gestion-liquidez-intradia/pull/3#issuecomment-6084388651
Orden/evidencia de implementación: https://github.com/scastellanost/kiri-gestion-liquidez-intradia/pull/3#issuecomment-6084416671
Commit candidato: commit que contiene este expediente; su SHA completo se registra expresamente en la entrega del PR. Manifiesto de fuentes/pruebas ejecutadas incluido.

## Verificación del alcance aprobado
Se revisaron aprobación y orden, dictamen independiente #6084310624 y control #6084358685. Gobierno Rector, GOV-CONT, PROTOCOLO_CODEX y contratos LIQ-CODEX-002/002A/003 continúan vigentes. La opción (a) autoriza sumas decimales exactas en igual moneda, disponible y déficit, sin redondeo, cambios de originales ni redefinición FX. No autoriza reapertura ni migración.

La recuperación mediante conector GitHub y la comparación de Git blob SHA de todos los archivos de referencia produjo cero discrepancias. No se ejecutó una versión distinta de la solicitada. Entorno Node v24.19.0, npm test = node --test; sin dependencias que instalar.

src/money.js: sumOriginals agrega decimales exactamente; consolidateMoney usa esa aritmética solo si todos los originales ya están en moneda destino. La rama heterogénea mantiene suma y convertMoney previos; sigue exigiendo tasas. src/position.js resta exactamente saldo bancario, compromisos y reservas y obtiene déficit sin residuo ficticio. src/needs.js suma exactamente los totales de compromisos/reservas en la cola. El núcleo rechaza resultados no representables con MONETARY_PRECISION_UNSUPPORTED. src/fx.js conserva la huella del candidato anterior. No se cambian originales ni fuentes/tasas de conversión.

## Pruebas ejecutadas y cambios de esta entrega
La referencia original pasó 387/387 casos: no se halló defecto que requiriera alterar producción. Solo se añade test/p2-exc04-boundaries.test.js (cinco pruebas), más este expediente; los archivos src/, contratos, pruebas previas y fuentes/pruebas de Claude permanecen intactos respecto de la referencia.

Las cinco pruebas cubren 1500 posiciones VES exactamente equilibradas alternando compromisos/reservas, posiciones por empresa/banco y cola sin déficit fantasma; déficit real 0.01 y 0.00001 y superávit; suma nativa VES/USD/EUR con distintas escalas; errores explícitos al perder precisión; tasas FX de precisión variable y agregación heterogénea idéntica al cálculo anterior, tasa ausente, originales inmutables; persistencia y recarga de posición equilibrada. El barrido se contabiliza dentro de una prueba, no como 1500 casos adicionales.

| Ejecución | PASS | FAIL | Archivo |
|---|---:|---:|---|
| Referencia: npm test -- --test-isolation=none --test-reporter=tap | 387 | 0 | initial-full.tap |
| Final: npm test (resumen por archivos) | 18 | 0 | final-npm.log |
| Final: npm test -- --test-isolation=none --test-reporter=tap | 392 | 0 | final-full.tap |
| P1: LIQ-CODEX-001 + pilot-p1-monetary-integrity | 30 | 0 | final-p1.tap |
| Dirigidas: p2-remediation-decimal, p2-candidate-regression, p2-exc04-position, p2-exc04-boundaries, p2-independent-economic-oracles | 44 | 0 | final-directed.tap |

Cero skipped/cancelled/todo. La ejecución detallada sin aislamiento registra cada nombre de caso; npm test normal resume por archivo en este entorno. Resultado local real: no se atribuye un PASS a GitHub Actions. Los logs completos quedan versionados y enlazados por SHA.

S02: anulación decimal, excesos y precisión conservados, barrido anterior de 5008 secuencias PASS. S08: validaciones corruptas, rechazo atómico y persistencia válida/cierre PASS. S09: cero exactamente al equilibrar 0.30−0.10−0.20, déficit real y reservas, frontera y cola PASS. S10: precedencia ratificada y desempates PASS. S12: escalas/monedas nativas, conversión heterogénea y tasa ausente PASS. P1 y regresión completa PASS.

## Estado y límites
SELF_TEST_PASS / CANDIDATE_FOR_INDEPENDENT_QA, exclusivamente resultado técnico del implementador. EXC-P2-01/02/03 conservan la acreditación independiente registrada por Claude; EXC-P2-04 sigue ABIERTA/PENDING_INDEPENDENT_VERIFICATION. El dictamen global FAIL anterior no queda sustituido por este SELF_TEST.
OBS-RQ-01/02 conservan comportamiento vigente: sin reapertura automática, sin migración histórica y sin inventar datos piloto. Mandatos agregados/reserva de recomposición FX siguen bloqueados. Permisos, concurrencia y unidades mínimas legales fuera de contrato/NO_DEMOSTRADO. Sin merge, despliegue, P3 ni certificación P2. PR DRAFT.

## Instrucción expresa para la nueva auditoría independiente
Claude Code debe recuperar el SHA exacto publicado con esta entrega en sesión y árbol separados, verificar el manifiesto y contratos y repetir S01–S13, con foco S09/S02/S08/S10/S12, P1 y regresión íntegra. Reutilizar/ampliar su arnés de 64 casos (incluidos RQ-S09-01/02) sin modificar implementación ni sus fuentes de auditoría previas. Auditar posiciones equilibradas, déficits reales, moneda nativa frente a agregación FX heterogénea, fronteras de representación y conservación de originales/tasas, persistencia y ausencia de efectos secundarios. Publicar dictamen por escenario y global y acreditar o mantener abierta EXC-P2-04, conservando la segregación de funciones. No corregir código ni aceptar excepciones funcionales por cuenta propia. Esta instrucción no afirma inicio automático de Claude.

Congelamiento documental: el candidato se identifica por SHA inmutable; un nuevo cambio en rama requiere nueva evidencia y candidato. SHA-256 y Git blob SHA son huellas de integridad; no bloquean físicamente la rama. Publicación sobre el árbol de referencia con actualización fast-forward y comprobación expected_sha, sin tocar main ni baselines. La promoción funcional corresponde al Líder Funcional después del dictamen independiente.
