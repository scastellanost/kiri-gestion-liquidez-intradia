# PILOT-01/F1/P2 — Dictamen independiente de QA (Claude Code)

Fecha: 2026-10-09
Auditor: Claude Code (sesión separada; no participó en la implementación, según certificación del Líder Funcional registrada en el expediente)
Expediente: `11_RUNTIME/qa-requests/PILOT_01_F1_P2_GLOBAL_INDEPENDENT_REVIEW_20261009.md` (rama `qa/pilot-01-f1-p2-restart`)
Contrato de escenarios: `11_RUNTIME/work-requests/PILOT_01_F1_P2_NEEDS_AFFECTATIONS.request.md` — «Pruebas mínimas dirigidas» 1–13
Contratos funcionales: `docs/LIQ-CODEX-002.md`, `docs/LIQ-CODEX-002A.md`, `docs/LIQ-CODEX-003.md`

> Este dictamen es una valoración técnica del auditor. **No** acepta excepciones, **no** cambia reglas, **no** marca P2 como VALIDATED_FOR_PILOT y **no** habilita P3. Esas decisiones corresponden exclusivamente al Líder Funcional (GOV-KIRI-AUTORIDAD-FUNCIONAL-EXCEPCIONES).

## 1. Confirmación previa a la ejecución

| Elemento | Valor verificado |
|---|---|
| Repositorio | `scastellanost/kiri-gestion-liquidez-intradia` |
| Versión auditada | rama `qa/pilot-01-f1-p2-restart`, commit `851bb5845708bc3b280fc2eeab11006f8cb1745c` (head de PR #3, DRAFT, base `pilot/liquidez-001`) |
| Código de motores | `src/` idéntico byte a byte al baseline congelado `archive/liquidez-baseline-liq-codex-009-20261008` (`git diff` vacío). Diferencias del commit auditado frente al baseline: sólo workflows y 2 archivos de prueba (`test/p2-independent-economic-oracles.test.js`, `test/pilot-p1-monetary-integrity.test.js`) |
| SHA-256 módulos P2 | `position.js` 62f7b478…c2b5 · `needs.js` 6b34f151…68cb · `money.js` db569ef6…e66e · `state.js` 83b05933…bc35 |
| Entorno | Node v22.22.0, Linux, contenedor aislado; datos 100 % sintéticos; BCV = 36,50 VES/USD **sintético** |
| Alcance | Sólo P2 — necesidades y afectaciones (13 escenarios) + transversales: permisos, persistencia, errores, simultaneidad, regresión P1, ausencia de ejecución bancaria y de datos productivos |
| Restricciones respetadas | Sin modificar código de producción, reglas, baseline ni PR #3; sin merge; sin P3; sin decidir los 2 bloqueos funcionales; sin producción/secretos/SIGRF/banca. El checkout auditado quedó sin cambios (`git status` limpio) |
| Bloqueos excluidos de certificación | `AGGREGATE_APPROVED_MANDATE_LIMIT_PER_AFFECTATION_UNDECIDED`, `FX_RECOMPOSITION_RESERVATION_RULE_UNDECIDED` (no evaluados, no decididos) |

## 2. Método

1. Lectura de Gobierno (`PILOT_GOVERNANCE.md`, `GOV_KIRI_AUTORIDAD_FUNCIONAL_EXCEPCIONES_20261008.md`), estado (`PROJECT_STATE.json`), orden `PILOT_01_F1.md`, work-request P2 y contratos 002/002A/003.
2. Revisión de código de `src/position.js` y `src/needs.js` contra cada regla.
3. Arnés propio `P2_CLAUDE_AUDIT.harness.mjs` (43 casos, oráculos derivados de los contratos, no de salidas del motor), ejecutado contra un checkout del commit auditado. No forma parte de la suite del motor (no altera el conteo 369).
4. Muestreo cuantitativo `P2_CLAUDE_DECIMAL_SAMPLE.mjs` para el hallazgo de precisión decimal.
5. Regresión íntegra `node --test` en el commit auditado y verificación del run de CI citado.

Reproducción:
```
git worktree add ../p2 851bb5845708bc3b280fc2eeab11006f8cb1745c
KIRI_P2_ROOT=../p2 KIRI_P2_COMMIT=851bb58 KIRI_P2_EVIDENCE=evidence.json \
  node --test 11_RUNTIME/qa-audit/claude-code-p2/P2_CLAUDE_AUDIT.harness.mjs
KIRI_P2_ROOT=../p2 node 11_RUNTIME/qa-audit/claude-code-p2/P2_CLAUDE_DECIMAL_SAMPLE.mjs
```

## 3. Resultados de ejecución

- **Regresión íntegra (commit auditado, local):** 369 tests · 369 pass · 0 fail · 0 skipped · 0 cancelled (incluye 15 de P1 y 21 oráculos P2 del implementador).
- **CI:** run [37872413333](https://github.com/scastellanost/kiri-gestion-liquidez-intradia/actions/runs/37872413333) `success`, ejecutado sobre `0144a79`; verificado que `src/`, `test/`, `package.json` y `.github/` son idénticos entre `0144a79` y `851bb58`.
- **Arnés del auditor:** 43 casos · 39 pass · **4 fail** (3 × S02-d decimales, 1 × OBS-08 persistencia). Salida completa: `P2_CLAUDE_AUDIT.run.tap`; importes por caso: `P2_CLAUDE_AUDIT.evidence.json`.
- **Muestreo decimal:** 5 008 anulaciones parcial→total con importes de 2 decimales: 674 rechazadas + 199 con residuo activo = **17,43 % defectuosas** (`P2_CLAUDE_DECIMAL_SAMPLE.out.json`).

## 4. Dictamen por escenario (13)

Importes VES; equivalente USD con BCV sintético 36,50. Detalle numérico completo en `P2_CLAUDE_AUDIT.evidence.json`.

| # | Escenario contractual | Evidencia (casos del arnés) | Resultado observado clave | Dictamen |
|---|---|---|---|---|
| 1 | Alta y cambios controlados conservando identificador y originales | S01-a…e | ALTA 100 USD → compromiso 3 650 VES / 100 USD; AJUSTE a 120 USD → 4 380 VES, 1 solo registro, originales 100 USD intactos; cambios a `amount_original`, `currency_original`, `empresa`, `naturaleza` → `IMMUTABLE_AFFECTATION_FIELD` sin mutación; trazabilidad origen/usuario/request_id/fecha | **PASS** |
| 2 | Anulación parcial y total; no exceder pendiente | S02-a…d | Enteros conformes a R-002A-01 (20/conf 10: anula 5 → pend 5 ACTIVA; anula 5 → ANULADA, confirmado 10 intacto; reserva 15 → 10 → 0 ANULADA; exceso/0/negativo/NaN rechazados sin mutación). **Con decimales, la anulación total tras una parcial falla**: 1 250,30 − 250,10 deja `1000.1999999999999` y anular el resto 1 000,20 → `EXCESSIVE_OR_INVALID_CANCELLATION`; 1,10 − 1,00 y luego 0,10 deja la afectación **ACTIVA** con residuo `8.3e-17` y una `UNCLASSIFIED_NEED` fantasma. Tasa 17,43 % en muestreo | **FAIL** (EXC-P2-01) |
| 3 | Saldos actualizados sustituyen stock, nunca se suman | S03-a…e | 100 → 90 = 90 (no 190), 1 stock vigente + historial; ejemplo rector 002 (90 + conf 10 → disp 80; 80 sin conf → disp 60, no infiere ejecución); stock por cuenta y moneda (70 + 30 + 12 USD); duplicado conflictivo en lote, cuenta inexistente, cuenta ajena y moneda no habilitada rechazados sin mutación | **PASS** |
| 4 | Stock retroactivo se preserva históricamente sin reemplazar vigente | S04-a…c | Vigente 100 @12:00; llega 90 @10:00 → vigente 100, evento `HISTORICAL_ONLY` con 90 y request_id; comparación por instante con zona `-04:00`; mismo timestamp con otro monto → `CONFLICTING_STOCK_TIMESTAMP` sin mutación | **PASS** |
| 5 | Ajuste/anulación retroactiva: rechazo sin mutación | S05-a, S05-b | AJUSTE y ANULACION anteriores al último evento → `RETROACTIVE_AFFECTATION_EVENT`, estado idéntico, disponible 75; lote mixto (alta válida + retroactivo) es atómico: no se aplica nada | **PASS** |
| 6 | Confirmado no disminuye por ajuste genérico | S06-a, S06-b | 15 → 10 → `CONFIRMED_AMOUNT_REVERSAL_NOT_ALLOWED` sin mutación; 15 → 18 aceptado (pend 2, disp 98); > vigente → `INVALID_CONFIRMED_AMOUNT`; ANULACION conserva confirmado; COMPROMISO→RESERVA con confirmado > 0 rechazado | **PASS** |
| 7 | batch_id / request_id repetidos sin efectos duplicados | S07-a…c | Replays devuelven la misma referencia de estado (sin eventos nuevos), también con claves reordenadas y tras persistir/recargar; payload distinto → `IDEMPOTENCY_CONFLICT`; ANULACION repetida con mismo request_id no se aplica dos veces | **PASS** |
| 8 | Un affectation_id no genera dos necesidades activas | S08-a, S08-b, OBS-08 | `createNeed` y `linkNeedToAffectation` → `DUPLICATE_ACTIVE_NEED` sin mutación; necesidad sin vínculo no suma economía (total 20); afectación anulada → necesidad CERRADA y no admite nueva. **Pero** `loadNeedState` acepta un estado almacenado con dos necesidades activas para la misma afectación (y afectación con vigente −50 → disponible 150) | **PASS_CON_EXCEPCIONES** (EXC-P2-02) |
| 9 | Déficit es derivado, no otra obligación | S09-a | Saldo 100, comp 80, reserva 50 → disponible −30, déficit 30 (0,8219 USD eq.), brecha 30, total necesidad 130, exactamente 2 necesidades, ningún elemento DEFICIT | **PASS** |
| 10 | Prioridad y rigidez independientes; orden determinístico y explicable | S10-a, S10-b | 8 necesidades: orden `NC, NH, NF, NG, NB, NE, ND, NA` idéntico al oráculo de la Regla 5 e independiente del orden de alta; `criterio_orden` con los 5 componentes; R1/R3 sin objetivo, prioridad inválida, repriorización sin motivo/retroactiva/con cambio de monto → errores sin mutación; P4→P1 no altera posición y registra antes/después/motivo. El motor ordena R2_VENTANA_DIA antes que R3_FECHA_RIGIDA por posición en la enumeración: el contrato dice «rigidez más exigente» sin jerarquizar R2 vs R3 | **PASS_CON_EXCEPCIONES** (EXC-P2-03, confirmación semántica) |
| 11 | Reclasificación COMPROMISO/RESERVA sin doble impacto | S11-a…c | 20 C→R: comp 0, reserva 20, disp 80; R→C: disp 80; 1 afectación, 1 necesidad actualizada; en USD (10 USD) disp 635 antes y después; motivo vacío, destino igual, retroactiva, cambio de monto → rechazados sin mutación; evento con anteriores/posteriores | **PASS** |
| 12 | Monedas heterogéneas por motor central o excepción | S12-a…c | 3 650 VES + 100 USD = 7 300 VES; comp 50 USD = 1 825 VES; disp 5 475 VES = 150 USD eq.; reserva EUR sin `EUR_VES` → posición y cola no publicables (`MISSING_EXCHANGE_RATE`), originales intactos; con EUR_VES 40 → 400 VES; `position.js`/`needs.js` no acceden a tasas fuera de `money.js` | **PASS** |
| 13 | Regresión íntegra `node --test` | S13 + CI | 369/369 local en `851bb58`; run 37872413333 `success` sobre árbol de código idéntico | **PASS** |

Resumen de los 13 escenarios: 10 PASS · 2 PASS_CON_EXCEPCIONES · **1 FAIL** · 0 NO_DEMOSTRADO.

## 5. Verificaciones transversales

| Aspecto | Resultado | Dictamen |
|---|---|---|
| Regresión P1 | `test/pilot-p1-monetary-integrity.test.js` incluido en los 369 PASS | PASS |
| Sin ejecución bancaria / E/S | `src/` sólo importa módulos locales; sin `fetch`, sockets, `require`, `fs` ni red (X-01) | PASS |
| Datos productivos | Ninguno; todos los datos y la tasa BCV son sintéticos | PASS |
| Errores y no mutación | Todos los rechazos probados dejan el estado idéntico (`deepEqual`); estados devueltos congelados en profundidad (X-02) | PASS |
| Persistencia | Ida y vuelta conserva estado, trazabilidad e idempotencia; la validación de carga no revalida afectaciones ni la unicidad de necesidad activa (EXC-P2-02) | PASS_CON_EXCEPCIONES |
| Permisos | El motor no tiene modelo de permisos (`usuario` opcional, sólo trazabilidad); los contratos P2 no lo exigen. No es posible acreditarlo | NO_DEMOSTRADO (fuera de contrato; registrar para capa de aplicación) |
| Simultaneidad | Motor puro e inmutable; dos escrituras desde el mismo estado base se aceptan ambas sin detección de conflicto (OBS-X03). La serialización corresponde al llamador; no hay contrato de concurrencia | NO_DEMOSTRADO (fuera de contrato) |

## 6. Registro de excepciones y observaciones (sin decisión implícita)

### EXC-P2-01 — Precisión decimal en anulación parcial → total (CRÍTICA para S02)
- Módulo/versión: `src/position.js` (`applyAffectations`, rama ANULACION), commit `851bb58`.
- Regla vigente: R-002A-01 — `monto_anulado <= pendiente`; si nuevo pendiente = 0 → ANULADA.
- Discrepancia: aritmética binaria sin política de precisión monetaria. Tras una anulación parcial con decimales, el pendiente queda ligeramente por debajo (rechazo de la anulación del resto mostrado) o por encima (afectación ACTIVA con residuo ~1e-16 y `UNCLASSIFIED_NEED` fantasma) del valor contable.
- Impacto: funcional (no se puede anular totalmente o queda obligación fantasma), operativo (alerta espuria en la cola), semántico (pantalla mostraría 0,00 pendiente con estado ACTIVA); impacto económico numérico despreciable (< 1e-12 VES) pero estado incorrecto. 17,43 % de casos de 2 decimales en el muestreo.
- Evidencia: S02-d (3 casos rojos), `P2_CLAUDE_DECIMAL_SAMPLE.out.json`.
- Origen: CODEX-001 declaró «sin redondeo intermedio… no se introduce política contable de redondeo»; P1 no probó operaciones sucesivas con decimales.
- Opciones (para el Líder Funcional; el auditor no decide): (a) representar importes en unidades mínimas enteras (céntimos) por moneda; (b) política de redondeo a N decimales por moneda en cada mutación; (c) tolerancia explícita de comparación y cierre (p. ej., ≤ 0,005); (d) aceptar el límite temporalmente con instrucción operativa de anular el residuo exacto.
- Recomendación QA: (a) o (b), con nueva orden Codex y re-QA de S02 y regresión. No usar (d) para piloto con datos reales.

### EXC-P2-02 — Validación incompleta al cargar estado persistido (MEDIA)
- `loadNeedState`/`saveNeedState` validan necesidades pero no afectaciones/saldos ni el invariante «máximo una necesidad ACTIVA por afectación».
- Evidencia OBS-08: estado manipulado con `N1` + `N1-BIS` activas y vigente −50 se guarda y carga sin error; la cola muestra 2 necesidades para 1 afectación y disponible 150.
- Impacto: integridad de datos ante almacenamiento corrupto o manipulado; las APIs de mutación sí protegen el invariante.
- Opciones: revalidar invariantes P2 en carga; o declarar el almacenamiento como confiable y fuera de alcance del piloto.

### EXC-P2-03 — Jerarquía R2_VENTANA_DIA vs R3_FECHA_RIGIDA (confirmación semántica)
- El motor usa el orden de enumeración R1 < R2 < R3 < R4 como «más exigente». El contrato no define si una ventana del día (R2) es más exigente que una fecha rígida (R3).
- Opciones: ratificar el orden actual; o definir otra jerarquía. Sin cambio de código si se ratifica.

### Observaciones (no bloqueantes, para conocimiento)
- OBS-1: `request_id` comparte espacio de nombres entre saldos, afectaciones y necesidades (reutilizar un id en otra operación → `IDEMPOTENCY_CONFLICT`). Conservador.
- OBS-2: ANULACION es un delta: el mismo contenido con un `request_id` nuevo se aplica otra vez (correcto por contrato; requiere disciplina de ids en la capa de carga).
- OBS-3 (OBS-X04): ALTA de RESERVA admite `monto_reflejado_confirmado` > 0 (sin significado contractual para reservas) y limita su anulación; ALTA con `monto_vigente` 0 crea afectación ACTIVA de importe cero.
- OBS-4: no hay control de `fecha_hora_saldo` frente a la fecha administrada; observaciones `HISTORICAL_ONLY` repetidas con nuevo request_id duplican el historial técnico (sin efecto económico).
- OBS-5: las partidas de la cola exponen importe y moneda originales; el equivalente VES/USD por partida no se expone (sólo totales). Relevante para la futura UI.

## 7. Dictamen global

**FAIL — P2 no acreditable como VALIDATED_FOR_PILOT en el commit `851bb58`.**

Fundamento: el work-request exige que la revisión independiente «acredite todos los escenarios definidos». El escenario 2 (anulación parcial y total) falla de forma reproducible con importes de dos decimales (EXC-P2-01). Los otros 12 escenarios quedan acreditados (10 PASS, 2 PASS_CON_EXCEPCIONES pendientes de decisión del Líder Funcional), sin regresiones (369/369) y sin ejecución bancaria ni datos productivos.

Para un nuevo dictamen se requiere: decisión del Líder Funcional sobre EXC-P2-01 (y, si procede, EXC-P2-02/03); orden y corrección por el implementador; nuevo QA independiente de S02 completo, S08 y regresión íntegra. P3 permanece no habilitado.

## 8. Evidencias archivadas (este directorio)

| Archivo | Contenido |
|---|---|
| `P2_CLAUDE_AUDIT.harness.mjs` | Arnés independiente (43 casos) |
| `P2_CLAUDE_AUDIT.run.tap` | Salida TAP completa de la ejecución |
| `P2_CLAUDE_AUDIT.evidence.json` | Importes por caso (VES y USD eq.), observaciones y resumen de regresión |
| `P2_CLAUDE_DECIMAL_SAMPLE.mjs` / `.out.json` | Muestreo cuantitativo de EXC-P2-01 |
| `PILOT_01_F1_P2_CLAUDE_CODE.result.json` | Resultado estructurado del dictamen |
