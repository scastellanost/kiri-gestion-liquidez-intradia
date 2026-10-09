# PILOT-01/F1/P2 — Dictamen de RE-QA independiente (Claude Code)

| Campo | Valor |
|---|---|
| Fecha | 2026-10-09 |
| Auditor | Claude Code, que en este expediente solo audita (`SELF_TEST != CERTIFICACION_INDEPENDIENTE`) |
| Orden | PR #3, comentario #6084118783 (entrega formal), basada en la aprobación funcional #6082751466 |
| Repositorio / rama auditada | `scastellanost/kiri-gestion-liquidez-intradia` / `qa/pilot-01-f1-p2-restart` |
| **Commit candidato congelado** | **`9146f4f4610e38ebd746fa66d9c6bcbd7d6acd5f`** (coincide con el head del PR #3 al iniciar la auditoría) |
| Commit auditado anteriormente (control) | `851bb5845708bc3b280fc2eeab11006f8cb1745c`, con dictamen FAIL en la rama `claude/gallant-lovelace-i6t14b` @ `152a834` |
| Entorno del auditor | Linux, Node v22.22.0, ejecutado sobre un checkout `--detach` del SHA, sin modificar archivos (`git status` limpio después de ejecutar) |
| Rama de la auditoría | `claude/wizardly-feynman-d2ar02`, separada de la implementación. Solo contiene `11_RUNTIME/qa-audit/claude-code-p2-reqa/` |

## Dictamen global: **FAIL**

El auditor no puede acreditar P2 como VALIDATED_FOR_PILOT en `9146f4f`.

Las tres excepciones abiertas (EXC-P2-01, 02 y 03) quedan **corregidas y acreditadas** con pruebas reproducibles. La batería ampliada encontró además un **hallazgo nuevo en S09 (déficit derivado)**, que se propone registrar como **EXC-P2-04**. Ya existía en `851bb58`, así que la remediación no lo introdujo. El auditor no lo detectó en la primera auditoría y lo hace constar aquí con transparencia. Incumple la Regla 6 de LIQ-CODEX-003, por lo que el auditor no puede aceptarlo como excepción.

## 1. Gobierno, contratos e integridad

| Verificación | Resultado |
|---|---|
| Gobierno Rector (`00_GOBIERNO/PILOT_GOVERNANCE.md`, `GOV_KIRI_AUTORIDAD_FUNCIONAL_EXCEPCIONES_20261008.md`) leído y aplicado: el auditor identifica y recomienda, y solo el Líder Funcional decide sobre excepciones | Cumplido |
| Contratos LIQ-CODEX-001/002/002A/003, propuesta de remediación y puerta de compatibilidad monetaria (`PILOT_01_F1_P2_MONETARY_COMPATIBILITY_GATE_20261009.md`) | Leídos. Son los oráculos del arnés |
| Manifiesto `11_RUNTIME/work-results/P2_SELF_TEST_CANDIDATE_20261009/manifest.json`: 27 archivos ejecutables (`package.json`, 11 de `src/`, 16 de `test/`) comparados por SHA-256 del contenido **y** por blob Git en `9146f4f` | **27/27 OK, 0 discrepancias** |
| Cambios de `851bb58` a `9146f4f` | En `src/` solo cambian `money.js` (+40), `needs.js` y `position.js`. En `test/` solo hay 2 archivos nuevos (`p2-remediation-decimal`, `p2-candidate-regression`), **sin borrar ni modificar pruebas previas**. En `docs/`, solo `LIQ-CODEX-003.md` (+3, jerarquía ratificada). El workflow solo cambia de nombre y de rutas de disparo. Comprobado con el caso RQ-X-02 |
| Independencia | El arnés no importa pruebas del implementador. Sus oráculos son propios (centésimas enteras y ordenación de referencia) y se escribieron a partir de los contratos |

## 2. Regresión (repetida por el auditor)

| Ejecución | Resultado | Evidencia |
|---|---|---|
| `node --test` (suite íntegra, 16 archivos) | **383/383 PASS**, 0 fail/skip/todo/cancelled, exit 0 | `REGRESSION_FULL_9146f4f.tap` |
| Desglose por archivo | 15+20+12+25+30+40+16+40+15+40+40+40+6+21+8+15 = 383 | `REGRESSION_PER_FILE_9146f4f.txt` |
| **P1** (`liq-codex-001` + `pilot-p1-monetary-integrity`) | **30/30 PASS** | `REGRESSION_P1_9146f4f.tap` |
| Pruebas dirigidas del implementador (S02/S08/S10) | 14/14 PASS | `REGRESSION_DIRECTED_9146f4f.tap` |
| Regresiones históricas LIQ-CODEX-001…009 | Todas PASS. Ninguna prueba previa fue alterada | — |

Nota: el implementador usó Node v24.19.0 con `--test-isolation=none`. Esa opción no existe en Node v22, por eso el auditor ejecutó la suite con aislamiento por proceso. Los recuentos coinciden.

## 3. Arnés independiente: 43 casos reutilizados + 21 ampliados = 64

`P2_CLAUDE_REQA.harness.mjs` reutiliza **íntegros** los 43 casos del arnés original. Solo se cambiaron el encabezado, el umbral de S13 (≥383) y el título de OBS-08, que ahora expresa el comportamiento exigido. Añade 21 casos RQ-*.

| Ejecución | Resultado |
|---|---|
| Candidato `9146f4f` | **62/64 PASS, 2 FAIL** (RQ-S09-01 y RQ-S09-02) → `P2_CLAUDE_REQA.run.tap`, `P2_CLAUDE_REQA.evidence.json` |
| Control `851bb58` (para mostrar que el arnés discrimina) | 44/64 PASS, 20 FAIL: S02, OBS-08, S08, RQ-S02 y también RQ-S09 → `P2_CLAUDE_REQA.control-851bb58.tap` |
| Arnés original de 43 casos sobre `9146f4f` | **43/43 PASS**. En `851bb58` fueron 39/43 |
| Muestreo original EXC-P2-01 (5 008 casos) | `9146f4f`: **0 rechazos, 0 residuos (0 %)**. Control `851bb58`: 674 rechazos y 199 residuos (17,43 %) |

## 4. Dictamen por escenario

| # | Escenario | Dictamen | Fundamento |
|---|---|---|---|
| S01 | Alta y cambios controlados | **PASS** | S01-a…e |
| S02 | Anulación parcial y total (precisión) | **PASS** | S02-a…d y RQ-S02-01…08: ejemplos rectores en COMPROMISO y RESERVA; barrido exhaustivo de 6 700 combinaciones de 0,01 a 2,00; 3 000 casos aleatorios en VES/USD/EUR con 2–4 decimales, 2–5 cortes, reflejado y reserva; 0 defectos. Las fronteras de 0,01, 0,0001 y 0,000001 por encima del pendiente se rechazan sin mutación. Importes exactos en Posición y en la cola. Idempotencia antes y después de recargar. FX con BCV sintético. `MONETARY_PRECISION_UNSUPPORTED` es explícito, sin redondeo (p. ej., 1e20 − 0,01) |
| S03 | Stock reemplazable | **PASS** | S03-a…e |
| S04 | Stock retroactivo histórico | **PASS** | S04-a…c |
| S05 | Ajuste/anulación retroactiva | **PASS** | S05-a…b |
| S06 | Confirmado no disminuye | **PASS** | S06-a…b |
| S07 | Idempotencia batch_id/request_id | **PASS** | S07-a…c, RQ-S02-06 |
| S08 | Una necesidad activa por afectación / persistencia | **PASS** (con observaciones OBS-RQ-01/02 para decisión funcional; no incumplen el contrato) | S08-a/b, OBS-08 y RQ-S08-01…04: **32 manipulaciones** más 5 contenidos malformados se rechazan con `INVALID_STORED_NEED_STATE` tanto en `load` como en `save`, sin escritura ni reparación. **4 633 estados** alcanzables en 400 secuencias aleatorias se guardan y recargan idénticos, con ≤1 necesidad ACTIVA por afectación. El cierre atómico ocurre en la misma operación, con evento `CLOSE_NEED_IF_RESOLVED` y su request_id. Un lote rechazado no deja cierres parciales |
| S09 | Déficit derivado | **FAIL** (EXC-P2-04 propuesta) | Ver §5 |
| S10 | Prioridad/rigidez y orden | **PASS** | S10-a/b y RQ-S10-01…04: R1→R2→R3→R4 prevalece sobre la fecha objetivo y la prioridad (R2/P4 sin objetivo va antes que R3/P1 con objetivo más temprano). Desempates sucesivos: objetivo, con los ausentes al final y comparando por instante con zona horaria; luego prioridad, evento y need_id. Una matriz de 40 necesidades × 50 permutaciones de alta coincide con el orden de referencia. La repriorización R4→R1 no altera la posición |
| S11 | Reclasificación sin doble impacto | **PASS** | S11-a…c |
| S12 | Monedas heterogéneas | **PASS** | S12-a…c y RQ-S02-07. La precisión de las equivalencias FX queda fuera de la orden de compatibilidad (no está autorizada) |
| S13 | Regresión íntegra | **PASS** | 383/383 y P1 30/30 |

Transversales: sin E/S de red ni ejecución bancaria (X-01) PASS; estados inmutables (X-02) PASS; las lecturas, el preview y el save no mutan (RQ-X-01) PASS; superficie de cambio acotada (RQ-X-02) PASS. **Permisos y simultaneidad: NO_DEMOSTRADO, fuera de contrato** (OBS-X03: el motor es puro y no tiene token de versión). **Unidades mínimas legales por moneda: NO_DEMOSTRADO, no definidas en el contrato.**

## 5. Hallazgo nuevo — EXC-P2-04 (propuesta; severidad ALTA; escenario S09)

**Definición vigente:** LIQ-CODEX-003, Regla 6, establece `Déficit = max(0, −saldo_disponible_gestion)`. La puerta de compatibilidad exige además "prevenir saldo fantasma".

**Discrepancia:** `calculate()` (`src/position.js:240-250`) agrega los pendientes con `consolidateMoney` (`src/money.js`, suma binaria con `reduce`) y resta `saldo − compromisos − reservas` también en binario. La aritmética decimal exacta se aplicó a la anulación y al pendiente individual, pero **no a la agregación en la misma moneda ni a la resta del disponible**.

**Reproducción mínima** (RQ-S09-01): saldo 0,30 VES; compromisos 0,10 y 0,20 VES. El motor devuelve `compromisos_por_ejecutar = 0.30000000000000004`, `saldo_disponible_gestion = −5.55e-17`, **`deficit = brecha_consolidada = 5.55e-17`** y `total_necesidad_vigente = 0.30000000000000004`. El resultado exacto es disponible 0 y déficit 0.

**Magnitud** (RQ-S09-02, 2 000 posiciones VES con 2 decimales y 2–5 afectaciones, sin FX): de 1 500 casos con déficit exacto 0, **286 muestran déficit fantasma > 0 (19,1 %)**. En los 500 casos con déficit real de 0,01, el valor es inexacto en todos (p. ej., 0,010000000000218). No hubo déficit omitido.

**Impacto:** la empresa aparece con brecha, y por tanto con una alerta o una cola de cobertura posterior, cuando está exactamente equilibrada. El déficit expuesto no es el monetario exacto. Afecta a la cola (`brecha_consolidada`) y a los módulos que consumen `deficit` (`posture.js`). Es la misma clase de defecto que EXC-P2-01, pero en la agregación.

**Origen:** ya estaba en `851bb58` y en el baseline (lo comprueba la ejecución de control). La remediación no lo introdujo, pero tampoco lo cubrió.

**Opciones, sin decisión implícita del auditor:**
- (a) Extender la aritmética decimal exacta (`addDecimal`/`subtractDecimal`) a la suma de originales en la misma moneda y al cálculo de disponible y déficit, dejando las conversiones FX bajo su política actual.
- (b) Definir funcionalmente una unidad mínima por moneda para la presentación y la comparación del déficit. Esto requiere una decisión que hoy no existe.
- (c) Otra opción que defina el Líder Funcional.

**Recomendación del QA:** (a), por coherencia con la decisión ya aprobada en la puerta de compatibilidad. Requiere corrección por ChatGPT/Codex, nueva congelación y re-QA de S09, S02, S12 y la regresión.

## 6. Estado individual de las excepciones

| ID | Estado del auditor | Evidencia |
|---|---|---|
| **EXC-P2-01** (anulación parcial→total con decimales) | **CORREGIDA — ACREDITADA** | 0/5 008 en el muestreo original (control 17,43 %), 0/6 700 en el barrido exhaustivo y 0/3 000 en el muestreo multimoneda; ejemplos rectores 1 250,30−250,10−1 000,20 y 1,10−1,00−0,10 en ANULADA, sin `UNCLASSIFIED_NEED` fantasma. Los originales (`amount_original`, `currency_original`) quedan intactos |
| **EXC-P2-02** (estado persistido inválido aceptado) | **CORREGIDA — ACREDITADA** | 32 manipulaciones y 5 malformados rechazados de forma atómica en `load` y `save`; 4 633 estados válidos recargan sin pérdida |
| **EXC-P2-03** (jerarquía R2 frente a R3) | **CORREGIDA — ACREDITADA** | Jerarquía ratificada por el Líder Funcional (#6082751466), documentada en `docs/LIQ-CODEX-003.md` y verificada en la matriz de 40 necesidades × 50 permutaciones y en los casos de prevalencia y desempate |
| **EXC-P2-04** (déficit fantasma por agregación binaria) | **ABIERTA — NUEVA, pendiente de decisión del Líder Funcional** | §5 |

Que el auditor cierre EXC-P2-01, 02 y 03 significa que su corrección está **acreditada técnicamente**. No equivale a aceptar excepciones ni a promover P2.

## 7. Observaciones para decisión funcional (no incumplen el contrato ni bloquean por sí solas)

- **OBS-RQ-01 — Reapertura tras pendiente 0.** El candidato cierra de forma persistente (CERRADA) la necesidad cuyo pendiente llega a 0 sin seguimiento, conforme a la Regla 12. Si después un AJUSTE eleva el vigente, la necesidad sigue CERRADA y la afectación vuelve a la cola como `UNCLASSIFIED_NEED` (por ejemplo, 50 VES): se pierde su clasificación P1/R1 y debe crearse una necesidad nueva. En `851bb58` la necesidad volvía a mostrarse ACTIVA con su prioridad. Ningún contrato regula la reapertura y el auditor no asume la regla.
- **OBS-RQ-02 — Compatibilidad del estado persistido v1.** Los estados guardados por el motor de `851bb58` con una afectación ANULADA o con pendiente 0 y la necesidad vinculada todavía ACTIVA (resultado legítimo de aquel motor) ahora se rechazan en la carga con `INVALID_STORED_NEED_STATE` (`P2_CLAUDE_REQA_COMPAT_PROBE.mjs`). El rechazo es coherente con la Regla 12, pero la versión de formato sigue siendo `1`. No consta que haya datos piloto persistidos que migrar. Si los hubiera, habría que decidir cómo migrarlos.

## 8. Reproducción

```bash
git fetch origin qa/pilot-01-f1-p2-restart claude/wizardly-feynman-d2ar02
git worktree add --detach /tmp/cand 9146f4f4610e38ebd746fa66d9c6bcbd7d6acd5f
git worktree add --detach /tmp/base 851bb5845708bc3b280fc2eeab11006f8cb1745c   # control
git worktree add --detach /tmp/qa origin/claude/wizardly-feynman-d2ar02
cd /tmp/qa/11_RUNTIME/qa-audit/claude-code-p2-reqa
(cd /tmp/cand && node --test)                                          # 383/383
KIRI_P2_ROOT=/tmp/cand KIRI_P2_EVIDENCE=/tmp/ev.json node --test P2_CLAUDE_REQA.harness.mjs   # 62/64 (RQ-S09-01/02 FAIL)
KIRI_P2_ROOT=/tmp/base node --test P2_CLAUDE_REQA.harness.mjs          # control 44/64
KIRI_P2_ROOT=/tmp/cand node P2_CLAUDE_DECIMAL_SAMPLE.mjs               # 0/5008
node P2_CLAUDE_REQA_COMPAT_PROBE.mjs /tmp/base /tmp/cand               # OBS-RQ-02
```

## 9. Restricciones cumplidas y siguiente puerta

No se modificó `src/`, `test/` ni el SHA candidato. No se fusionó ni se desplegó. P3 no se inició y no se aceptó ninguna excepción. PR #3 sigue en DRAFT. Los bloqueos funcionales de límite agregado de mandatos y de reserva de recomposición FX siguen fuera del dictamen e intactos.

**Siguiente puerta de control (Líder Funcional):** decidir sobre EXC-P2-04 (opciones de §5) y tomar conocimiento de OBS-RQ-01/02. Si procede, ChatGPT/Codex corrige y publica un nuevo commit congelado con SELF_TEST, y Claude Code hace un re-QA independiente de S09, S02, S12, S08 y la regresión completa, P1 incluida. P2 **no** pasa a VALIDATED_FOR_PILOT con este dictamen.
