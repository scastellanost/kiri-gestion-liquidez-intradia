# PILOT-01/F1/P2 — Puerta técnica de compatibilidad monetaria
Fecha: 2026-10-09
Tipo: evaluación técnica previa a remediación; no es certificación QA
Estado: COMPATIBILITY_REVIEW_COMPLETED / IMPLEMENTATION_PENDING
PR: #3 — qa/pilot-01-f1-p2-restart
Baseline auditado: 851bb5845708bc3b280fc2eeab11006f8cb1745c
Fuente funcional: comentario #6082751466 y propuesta PILOT_01_F1_P2_REMEDIATION_PROPOSAL_20261009.md

## Evidencia de inspección
- `src/money.js`: `createMoney` acepta cualquier número finito y moneda ISO de tres letras; no existe tabla contractual de exponentes o unidad mínima por divisa. `convertMoney` utiliza tipos de cambio BCV y tasas auxiliares con precisión variable y devuelve números; `consolidateMoney` suma montos convertidos. P1 exige originales intactos y tasa explícita.
- `src/position.js`: `applyAffectations` resta números binarios (`old.monto_vigente - old.monto_reflejado_confirmado`, `next.monto_vigente -= row.monto_anulado`); `getAffectationPending` repite la resta. Esta es la ruta de EXC-P2-01.
- `src/needs.js`: `validateStoredState` verifica mayormente estructura y cada necesidad aisladamente; no comprueba duplicidad activa, correspondencia económica, importes negativos ni integridad transversal. Esta es la ruta de EXC-P2-02.
- `src/needs.js` y `src/fx.js`: los arreglos de rigidez ya enumeran R1/R2/R3/R4; `docs/LIQ-CODEX-003.md` no explicita su precedencia contractual. EXC-P2-03 requiere formalización y pruebas, no redefinir valores.

## Decisión de compatibilidad técnica dentro de la aprobación funcional
No imponer dos decimales universales, no redondear, no truncar y no reescribir `amount_original`, `currency_original`, `monto_anulado`, tipos de cambio ni sus fuentes. Las unidades mínimas por divisa no están definidas en el contrato; por tanto no se atribuirán unidades mínimas supuestas a VES, USD, EUR u otras divisas.

Implementar un núcleo de **aritmética decimal exacta para movimientos monetarios originales** mediante representación decimal y enteros de precisión arbitraria (BigInt), tomando la expresión decimal del número recibido (`Number.toString()`) y alineando escalas para sumar, restar y comparar. Esta decisión evita introducir una tabla de exponentes no aprobada. Debe admitir notación exponencial de forma determinista. La salida pública sigue siendo numérica y conserva compatibilidad; si un resultado exacto no puede representarse de ida y vuelta sin pérdida, bloquearlo explícitamente, en lugar de redondearlo silenciosamente. No trasladar este cambio de forma indiscriminada a equivalencias FX: el cálculo de conversiones por tasa requiere una política independiente de precisión/representación, que esta orden no autoriza redefinir.

## Implementación acotada exigida
1. EXC-P2-01: funciones reutilizables `addDecimal`, `subtractDecimal`, `compareDecimal` en módulo monetario; sustituir las restas/comparaciones relevantes de afectación y pendiente y prevenir saldo fantasma. Mantener invariantes de reflejado y anulación, incluyendo compromisos y reservas.
2. EXC-P2-02: validación de colección y cada entidad, identificadores únicos, importes finitos no negativos, `reflejado <= vigente`, pendiente y estado coherentes, vínculo y campos económicos consistentes entre necesidad y afectación, máximo una necesidad ACTIVA por afectación, sin escrituras ni reparaciones al rechazar. Usar código de error estable `INVALID_STORED_NEED_STATE` y envolver errores de validación interna que de otro modo expongan otra etiqueta.
3. EXC-P2-03: documentar precedencia R1_HORA_RIGIDA > R2_VENTANA_DIA > R3_FECHA_RIGIDA > R4_FLEXIBLE; el orden posterior sigue `fecha_hora_objetivo`, prioridad económica, fecha de evento, `need_id`. No inferir objetivos nuevos para categorías que los permiten ausentes.

## Pruebas de compatibilidad y aceptación del implementador
- Anulación: 1250.30 - 250.10 = 1000.20 y anulación final 1000.20 => 0/ANULADA; 1.10 - 1.00 - 0.10 => 0/ANULADA, sin UNCLASSIFIED_NEED fantasma.
- Exceso de anulación frente a saldo exacto => rechazo sin mutación; idempotencia intacta; compromisos con reflejado, reservas, ajustes y reclasificaciones sin doble impacto.
- Dinero con distinta escala decimal y valores grandes: exactitud o rechazo explícito si no hay representación segura; no adoptar redondeo implícito. Conversiones BCV y tasas adicionales reproducen resultados anteriores para casos válidos; USD y VES de P1, tasa ausente y monedas heterogéneas conservan reglas.
- Persistencia corrupta: duplicado ACTIVA, vigente negativo, reflejado mayor que vigente, vínculo inexistente, datos económicos inconsistentes, estados contradictorios, ids duplicados y contenido malformado. Debe rechazar antes de devolver estado; ninguna reparación silenciosa.
- Rigidez: probar R1<R2<R3<R4 aunque la prioridad económica/fecha discrepe; después validar cinco desempates y rigor de timestamps.
- Ejecutar todas las pruebas `npm test`, registrar recuento real y commit; implementador solo SELF_TEST.
- Re-QA Claude Code: 13 escenarios S01–S13, 43 casos independientes ampliados y regresión P1. Evidencia y dictamen separados.

## Limitaciones expresas
Permisos, concurrencia y unidades mínimas legales no definidas permanecen NO_DEMOSTRADO / FUERA DE CONTRATO. Mantener bloqueos funcionales de mandato agregado y reserva de recomposición FX. No P3, no merge, no producción y no promoción a VALIDATED_FOR_PILOT.

## Glosario
- `BigInt`: tipo de entero de precisión arbitraria; permite operaciones exactas sobre dígitos monetarios una vez alineados.
- Escala decimal: cantidad de posiciones decimales representadas en un importe, no una regla legal de redondeo.
- Reversibilidad: convertir la representación exacta a la API pública y recuperar el mismo valor decimal sin pérdida.
- SELF_TEST: prueba del implementador, distinta del dictamen de calidad independiente.
