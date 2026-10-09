# P2 EXC-P2-06 — SELF_TEST y candidata para QA independiente

Fecha: 2026-10-09. Implementador: Codex. PR #3, qa/pilot-01-f1-p2-restart.
Partida exacta: 89ed8a1547144a53143a308c89ce8513ac088b9b.
Orden: https://github.com/scastellanost/kiri-gestion-liquidez-intradia/pull/3#issuecomment-6085445288
Aprobación: #6085430189. SHA candidato: commit que contiene este expediente, publicado completo en comentario del PR; manifiesto de fuentes/pruebas adjunto.

## Gobierno, alcance y verificación
Gobierno Rector, PROTOCOLO_CODEX, autoridad funcional exclusiva y GOV-CONT vigentes. Se revisaron orden, aprobación y último dictamen independiente #6085208983. Alcance: sumas/restas exactas en moneda original para cualquier posición de moneda única admitida; conversión posterior por convertMoney existente. Componentes genuinamente heterogéneos mantienen comportamiento numérico previo, incluyendo una cuenta de otra moneda en cero. No se cambia FX, tasa, originales, escala legal, tolerancia, redondeo, contratos, reapertura ni migración.

Se recuperaron position.js y las seis pruebas iniciales del SHA ordenado. Verificación de todos los blobs de partida: cero ausentes/cero discrepancias. La primera regresión dio 403/403 PASS. La implementación de partida calcula correctamente disponible/deficit en moneda nativa y convierte después a VES; la selección respeta el ámbito empresa/banco. No fue necesario corregir producción. Esta entrega solo añade test/p2-exc06-regression.test.js (cinco pruebas) y evidencia. Fuentes, pruebas preexistentes, money.js, fx.js y contratos idénticos a la partida.

## Pruebas propias y resultados
Cinco pruebas adicionales: 1000 posiciones equilibradas por USD, EUR y CAD (otra moneda admitida con tasa explícita), cada una con frontera deficit/superávit exacta en moneda original y conversión existente, empresa/banco/cola y ausencia de mutación; dos rutas heterogéneas con 1000 casos cada una (cuenta USD cero y producto FX compensado), identidad bit a bit con fórmula previa; rechazo explícito de precisión nativa no representable y persistencia/recarga. CAD es dato sintético de prueba, no tabla de unidades mínimas ni nueva política.

Se conservan el caso USD 100.10−33.37−66.73 y EUR/VES, 2000 multimoneda de EXC05, 1500 VES equilibrados y 5008 anulaciones decimales. Los barridos son internos a pruebas, no se añaden al conteo de casos.

| Ejecución local Node v24.19.0 | PASS | FAIL | Evidencia |
|---|---:|---:|---|
| Regresión de referencia | 403 | 0 | initial-full.tap |
| npm test final, resumen por archivos | 21 | 0 | final-npm.log |
| npm test -- --test-isolation=none --test-reporter=tap | 408 | 0 | final-full.tap |
| P1: LIQ-CODEX-001 + integridad monetaria | 30 | 0 | final-p1.tap |
| Dirigidas: node --test --test-isolation=none --test-reporter=tap test/p2-*.test.js | 60 | 0 | final-directed.tap |
| Contraste técnico arnés Claude sin modificar | 79 | 2 | reference-81.tap |

En suites propias finales: cero skipped/cancelled/todo. npm test = node --test, sin dependencias/instalación. Este entorno resume por archivos al aislar; TAP sin aislamiento contiene todos los casos. Logs locales reales, no atribuidos a Actions ni a nueva ejecución de Claude. S02/S08/S09/S10/S12 y P1 PASS en pruebas propias.

## Contraste de 81 casos de referencia, sin autocertificación
Se descargó íntegro y sin editar el arnés Claude del commit ca0011ed303c59804b0aaefa852d8e4ebf7a21f6, 11_RUNTIME/qa-audit/claude-code-p2-reqa3/P2_CLAUDE_REQA3.harness.mjs. Copia exacta reference-harness.mjs y provenance.json; no se modificó la rama del auditor ni sus fuentes.
Comando: KIRI_P2_ROOT=/workspace/work/p2-candidate KIRI_P2_COMMIT=89ed8a1547144a53143a308c89ce8513ac088b9b KIRI_P2_EVIDENCE=/workspace/work/exc06-reference-ledger.json node --test --test-isolation=none --test-reporter=tap /workspace/work/exc06-audit/P2_CLAUDE_REQA3.harness.mjs.

Resultado bruto 79/81, dos divergencias identificadas, sin esconder ni cambiar sus aserciones:
1. S13: el subproceso node --test termina con exit 0, pero el parser de conteos del arnés contiene un patrón sobreescapado y obtiene NaN. No demuestra fallo de producción. La regresión propia detallada acredita 408/408 con su log completo; el auditor deberá ajustar su herramienta en su sesión independiente.
2. RQ3-S12-05: el oráculo anterior exige disponible USD convertido -4.547473508864641e-13 para una posición equilibrada de moneda única. El candidato devuelve 0 conforme a la aprobación EXC06; la expectativa heredada está superada por la nueva decisión funcional. Las pruebas propias USD/EUR/CAD verifican la regla actual. Se conserva el FAIL bruto como contraste, no se afirma 81/81.

El caso de superficie RQ-X-02 retorna sin comprobar git diff si no hay historia local; esa limitación no se presenta como verificación. Se acredita superficie por comparación de árboles GitHub y manifiesto. Las observaciones documentales del arnés tampoco equivalen a aceptación de sus riesgos o textos antiguos.

Ledger del arnés: OBS-RQ-04, 1000 USD + 1000 EUR equilibrados, cero déficits fantasma en ambos. La nueva ruta corrige el síntoma nativo del último dictamen.

## Riesgo FX heterogéneo pendiente, NO aceptado
Ledger OBS-RQ-03 reproduce exactamente los controles del último dictamen: cuenta USD en 0.00, 132/1000 posiciones con déficit residual; producto FX exactamente compensado, 213/1000 con déficit residual. Ejemplos 1.8189894035458565e-12 y 2.9103830456733704e-11 VES. La muestra propia adicional de productos compensados registra 422/1000 (serie distinta); no se mezclan los conteos.
La ruta heterogénea sigue siendo compatible con el cálculo anterior bit a bit y publicable cuando tiene tasas, pero NO se declara exacta. Los residuos se conservan por orden expresa provisional; esto NO significa aceptar la excepción, suprimir errores con tolerancia o certificar precisión FX. Una política/aceptación ulterior corresponde exclusivamente al Líder Funcional. No se infiere riesgo resuelto por tener regresión PASS.

## Congelamiento y próxima puerta
Estado técnico: SELF_TEST_PASS en suites propias / CANDIDATE_FOR_INDEPENDENT_QA, con contraste bruto 79/81 explicado y evidencia adjunta. EXC-P2-06 pendiente de acreditación independiente de la dimensión moneda única; riesgo heterogéneo abierto. EXC-P2-01–05 conservan acreditación anterior salvo nueva evidencia de Claude. OBS-RQ-01/02 sin nueva regla. Permisos/concurrencia/unidades mínimas legales fuera de contrato; mandatos agregados/reserva de recomposición FX bloqueados. PR DRAFT; sin merge, producción, P3 ni VALIDATED_FOR_PILOT/certificación P2.

Congelar por SHA exacto publicado, no por nombre mutable de rama. Cada cambio futuro requiere nuevas pruebas/candidato. Manifiesto SHA-256/Git blob SHA cotejado después de publicación; publicación fast-forward con expected_sha, sin alterar main/baselines.

Instrucción expresa a Claude Code: recuperar el SHA de entrega en sesión/árbol/ramas independientes; verificar integridad y Gobierno Rector, auditar los 13 escenarios P2 con 81+ pruebas propias y oráculos actualizados a #6085430189, S02/S08/S09/S10/S12, P1 y regresión completa. Revisar y resolver en sus herramientas las dos divergencias documentadas del arnés anterior, sin modificar implementación. Acreditar exactitud nativa USD/EUR/otras admitidas, déficit/superávit y persistencia; verificar ruta heterogénea bit a bit y riesgo residual pendiente sin aceptarlo ni certificar precisión FX. Emitir dictamen por escenario/global y EXC-P2-06, publicar solo auditoría independiente. Promoción funcional exige nueva decisión expresa del Líder Funcional. Esta entrega no inicia automáticamente a Claude.
