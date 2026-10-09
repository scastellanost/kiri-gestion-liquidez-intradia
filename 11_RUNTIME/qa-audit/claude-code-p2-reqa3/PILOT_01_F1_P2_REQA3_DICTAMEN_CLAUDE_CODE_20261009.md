# PILOT-01/F1/P2 — Dictamen de RE-QA independiente nº 3: EXC-P2-04/05 (Claude Code)

| Campo | Valor |
|---|---|
| Fecha | 2026-10-09 |
| Auditor | Claude Code; en este expediente solo audita (`SELF_TEST != CERTIFICACION_INDEPENDIENTE`) |
| Orden | PR #3, comentario #6085055170. Aprobaciones funcionales: EXC-P2-04 en #6084388651 y EXC-P2-05 (opción a) en #6084761588 |
| Rama / **commit auditado** | `qa/pilot-01-f1-p2-restart` @ **`a285519de71e983c9f836ade0dce045d8c82532c`** (head del PR durante toda la auditoría) |
| Controles | `5af50fd` (candidato anterior, FAIL por S12), `9146f4f` (FAIL por S09) y `851bb58` (primera auditoría) |
| Entorno | Linux, Node v22.22.0. Checkouts `--detach` sin modificar (`git status` limpio después de ejecutar) |
| Rama de auditoría | `claude/wizardly-feynman-d2ar02`, separada de la implementación. Directorio nuevo `11_RUNTIME/qa-audit/claude-code-p2-reqa3/`. Los expedientes anteriores (`claude-code-p2`, `-reqa`, `-reqa2`) no se modificaron |

## Dictamen global: **PASS_CON_EXCEPCIONES**. **No equivale a aceptación ni a VALIDATED_FOR_PILOT**

`a285519` corrige conjuntamente EXC-P2-04 y EXC-P2-05 **dentro del alcance aprobado**:
- **Ruta VES nativa:** decimal exacta, sin déficit fantasma.
- **Ruta heterogénea:** idéntica bit a bit al cálculo heredado y siempre publicable cuando hay tasa.
- **Cola:** nunca lanza excepciones.

Los 13 escenarios se ejecutaron sin ningún FAIL. El arnés independiente da **81/81** y la regresión **397/397** (P1 30/30).

La batería ampliada encontró un **residuo previo** que queda fuera de ese alcance: hay déficit fantasma en posiciones **de una sola moneda distinta de VES** y en la **ruta heterogénea heredada**. Se propone registrarlo como **EXC-P2-06**. Según el Gobierno Rector, solo el Líder Funcional puede decidirlo. El auditor **no lo acepta**, y P2 no debería promoverse mientras esa decisión siga pendiente.

## 1. Gobierno, contratos e integridad

| Verificación | Resultado |
|---|---|
| Gobierno Rector, GOV-KIRI-AUTORIDAD-FUNCIONAL-EXCEPCIONES y GOV-CONT | Aplicados |
| LIQ-CODEX-001/002/002A/003, aprobaciones #6084388651 y #6084761588, y REPORT del implementador | Leídos; sirven de oráculos |
| Manifiesto `11_RUNTIME/work-results/P2_EXC05_SELF_TEST_20261009/manifest.json`: 30 archivos cotejados por SHA-256 **y** por blob Git en `a285519` | **30/30 OK.** Ningún archivo rastreado de `src/`, `test/` o `package.json` queda fuera del manifiesto |
| Cambios de `5af50fd` a `a285519` | Solo `src/position.js` (`hasNativePositionComponents` y la elección de ruta), `src/needs.js` (envoltura `buildNeedQueue` con captura y elección de ruta para el total) y un archivo de prueba nuevo (`p2-exc05-fx-compatibility`). Sin cambios en `money.js`, `fx.js`, pruebas previas, contratos ni gobierno (RQ-X-02) |

## 2. Regresión repetida por el auditor

| Ejecución | Resultado |
|---|---|
| `node --test` (19 archivos) | **397/397 PASS**, exit 0, 0 skip/todo/cancelled (`REGRESSION_FULL_a285519.tap`, `REGRESSION_PER_FILE_a285519.txt`) |
| **P1** (`liq-codex-001` + `pilot-p1-monetary-integrity`) | **30/30 PASS** |
| Pruebas dirigidas del implementador (6 archivos P2) | 49/49 PASS |
| Muestreo original de EXC-P2-01 (5 008 casos) | 0 rechazos y 0 residuos |
| Reproducciones mínimas de EXC-P2-05 (`P2_CLAUDE_REQA2_FX_REPRO.out.txt`) | `a285519` devuelve exactamente los valores de `9146f4f` (disponible 281 396,890914…), y la cola publica sin excepción |

## 3. Arnés independiente: 73 casos reutilizados + 8 nuevos = 81

`P2_CLAUDE_REQA3.harness.mjs` es una copia del arnés de 73 casos con dos adaptaciones: el umbral de S13 pasa a ≥ 397 y RQ-X-02 se compara contra `5af50fd`.

Añade 8 casos nuevos:
- **RQ3-S12-01…05:** compatibilidad heterogénea frente a un oráculo heredado independiente, banco nativo con FX ajeno, cola sin excepción, transiciones y empresa solo en USD.
- **RQ3-S08-01:** persistencia heterogénea.
- **OBS-RQ-03 y OBS-RQ-04:** documentales.

| Commit | Resultado | Lectura |
|---|---|---|
| **`a285519` (candidato)** | **81/81** | — |
| `5af50fd` (control) | 71/81 | Fallan S12 (RQ2-S12-01/02/03, RQ3-S12-01…05), S13 y RQ-X-02 |
| `9146f4f` (control) | 68/81 | Fallan S09 (RQ-S09, RQ2-S09). También fallan RQ3-S12-01/02/04, porque los componentes VES no eran exactos (1 033/2 000 discrepancias en RQ3-S12-01), y RQ3-S12-03, porque la cola lanzaba `PositionError` ante una empresa inválida |
| `851bb58` (control) | 52/81 | — |

## 4. Dictamen por escenario

| # | Escenario | Dictamen | Fundamento |
|---|---|---|---|
| S01 | Alta y cambios controlados | PASS | S01-a…e |
| S02 | Anulación parcial y total (precisión) | PASS | S02-a…d, RQ-S02-01…08, muestreo 0/5 008 |
| S03 | Stock reemplazable | PASS | S03-a…e |
| S04 | Stock retroactivo | PASS | S04-a…c |
| S05 | Ajuste/anulación retroactiva | PASS | S05-a/b |
| S06 | Confirmado no disminuye | PASS | S06-a/b |
| S07 | Idempotencia | PASS | S07-a…c, RQ-S02-06, RQ3-S08-01 |
| S08 | Una necesidad activa / persistencia | PASS (OBS-RQ-01/02 vigentes) | OBS-08, RQ-S08-01…04, RQ2-S09-04, RQ3-S08-01 |
| S09 | Déficit derivado | **PASS_CON_EXCEPCIONES** (EXC-P2-06) | **Ruta VES exacta:** RQ-S09-01/02, RQ2-S09-01 (1 500 equilibradas en empresa, banco y cola: 0 defectos), RQ2-S09-02 (déficit 0,01 / 0,00001 / superávit exactos en 1 500 casos), RQ2-S09-03 (rechazo explícito y controlado), RQ3-S12-02 (banco VES exacto con FX ajeno) y RQ3-S12-04 (vuelta exacta al anular la afectación USD). **Residuo fuera de alcance:** §5 |
| S10 | Prioridad/rigidez y orden | PASS | S10-a/b, RQ-S10-01…04 |
| S11 | Reclasificación sin doble impacto | PASS | S11-a…c |
| S12 | Monedas heterogéneas | **PASS** | RQ2-S12-01/02/03 y RQ3-S12-01, con 2 000 posiciones (1 832 empresas heterogéneas y 2 312 vistas de banco nativo) **idénticas bit a bit** al oráculo heredado en empresa, BNC, BDV y cola. Además: 0 posiciones no publicables, 0 excepciones; tasa ausente controlada. RQ3-S12-03: 6 entradas adversas devuelven `publicable:false` congelado, con error, sin excepción y sin mutar el estado |
| S13 | Regresión íntegra | PASS | 397/397, P1 30/30 |

Transversales: X-01, X-02, RQ-X-01 y RQ-X-02 en PASS. **Permisos y simultaneidad: NO_DEMOSTRADO**, fuera de contrato. **Unidades mínimas legales: NO_DEMOSTRADO**, no están definidas.

**Cambio de comportamiento, informativo:** `buildNeedQueue` con una empresa inválida devuelve ahora `publicable:false` con `INVALID_COMPANY`; antes lanzaba `PositionError`. Es coherente con la orden "nunca lanzar sin control" (#6084761588) y ninguna prueba ni contrato exige lo contrario.

## 5. Hallazgo — EXC-P2-06 (propuesto; severidad MEDIA; S09; existía antes, no lo introduce la corrección)

**Definición vigente:** LIQ-CODEX-003, Regla 6 (`Déficit = max(0, −disponible)`).
- La aprobación #6084388651 extiende la aritmética exacta a la agregación "en la misma moneda" y al cálculo del disponible y del déficit.
- La aprobación #6084761588 la parafrasea como "cuando los componentes … están originalmente en la misma moneda".
- La opción (a) del dictamen #6084668117, que es la que se aprobó, decía "en la **moneda destino**".

La implementación aplica la versión de la moneda destino: solo los componentes **VES** siguen la ruta exacta.

**Discrepancia** (déficit > 0 donde el valor decimal exacto es 0):

| Caso | Muestra | Déficit fantasma |
|---|---|---|
| OBS-RQ-04: empresa **solo USD** exactamente equilibrada en USD | 1 000 | **274 (27,4 %)** |
| OBS-RQ-04: empresa **solo EUR** exactamente equilibrada en EUR | 1 000 | **282 (28,2 %)** |
| OBS-RQ-03 (i): saldos VES que igualan los compromisos VES más una cuenta USD con saldo **0,00** | 1 000 | **132 (13,2 %)** |
| OBS-RQ-03 (ii): saldo USD × BCV compensado por un compromiso VES igual al producto decimal exacto | 1 000 | **213 (21,3 %)** |

Ejemplo de RQ3-S12-05: saldo USD 100,10 con afectaciones USD 33,37 + 66,73 da `deficit = 4,55e-13` VES. Los fantasmas van de 1e-16 a 1e-10 VES.

**Origen:** las cifras son **idénticas en `9146f4f` y `851bb58`**. Es comportamiento heredado que la corrección conserva tal como ordenaba la aprobación de EXC-P2-05; no es una regresión. El auditor reconoce que la redacción de su opción (a) ("moneda destino") no advirtió el caso de una moneda única distinta de VES.

**Impacto:** en posiciones exactamente equilibradas aparece una brecha mayor que 0 (una alerta falsa). El efecto se limita al indicador `deficit > 0` y a la `brecha_consolidada`; los importes visibles no cambian a 2 decimales.

**Opciones, sin decisión implícita del auditor:**
- (a) Extender la ruta exacta a **cualquier posición de moneda única**: sumar y restar en la moneda original y convertir una sola vez el resultado. El oráculo exacto existe sin necesidad de una política FX nueva, pero cambia la ruta heredada en esas empresas.
- (b) Definir una política de precisión o comparación para la ruta heterogénea (unidad mínima o tolerancia). Requiere una decisión funcional nueva.
- (c) Que el Líder Funcional acepte expresamente y documente el residuo como límite conocido, con su alcance.
- (d) Otra.

**Recomendación del QA:** (a) para moneda única, y una decisión expresa entre (b) y (c) para la ruta heterogénea.

## 6. Estado individual y conjunto de las excepciones

| ID | Estado | Evidencia |
|---|---|---|
| EXC-P2-01 | **Mantiene CORREGIDA — ACREDITADA** | 0/5 008; RQ-S02-01…08 |
| EXC-P2-02 | **Mantiene CORREGIDA — ACREDITADA** | OBS-08, RQ-S08-01…04, RQ3-S08-01 |
| EXC-P2-03 | **Mantiene CORREGIDA — ACREDITADA** | S10-a/b, RQ-S10-01…04 |
| **EXC-P2-04** | **CORREGIDA — ACREDITADA en el alcance aprobado** (componentes en moneda destino VES) | RQ-S09-01/02 y RQ2-S09-01…04 en PASS (fallan en `9146f4f`); RQ3-S12-02 y RQ3-S12-04 |
| **EXC-P2-05** | **CORREGIDA — ACREDITADA** | RQ2-S12-01/02/03 y RQ3-S12-01/03/05 en PASS (fallan en `5af50fd`); 0/2 000 no publicables; 0 excepciones de cola; identidad bit a bit con el oráculo heredado |
| **EXC-P2-04 + EXC-P2-05 (conjunta)** | **ACREDITADAS CONJUNTAMENTE** | Por primera vez el mismo commit pasa todas las pruebas de S09 (VES) y de S12. Ninguna corrección revierte la otra |
| **EXC-P2-06** | **ABIERTA — PROPUESTA**, pendiente de decisión del Líder Funcional | §5 |

## 7. Observaciones vigentes (sin reglas nuevas inferidas)

- **OBS-RQ-01:** sin reapertura de una necesidad cerrada con pendiente 0.
- **OBS-RQ-02:** compatibilidad de estados v1 de `851bb58`; requiere inventario antes de cualquier migración.

Sin cambios respecto de `9146f4f` y sin regla aprobada.

## 8. Reproducción

```bash
git fetch origin qa/pilot-01-f1-p2-restart claude/wizardly-feynman-d2ar02
git worktree add --detach /tmp/cand a285519de71e983c9f836ade0dce045d8c82532c
git worktree add --detach /tmp/prev 5af50fdc829e94a6b62dc909923093a393c5912b      # control S12
git worktree add --detach /tmp/prev2 9146f4f4610e38ebd746fa66d9c6bcbd7d6acd5f     # control S09
git worktree add --detach /tmp/qa origin/claude/wizardly-feynman-d2ar02
cd /tmp/qa/11_RUNTIME/qa-audit/claude-code-p2-reqa3
(cd /tmp/cand && node --test)                                                   # 397/397
KIRI_P2_ROOT=/tmp/cand KIRI_P2_EVIDENCE=/tmp/ev.json node --test P2_CLAUDE_REQA3.harness.mjs   # 81/81 (+ OBS-RQ-03/04 en ev.json)
KIRI_P2_ROOT=/tmp/prev node --test P2_CLAUDE_REQA3.harness.mjs                  # 71/81
KIRI_P2_ROOT=/tmp/prev2 node --test P2_CLAUDE_REQA3.harness.mjs                 # 68/81
node P2_CLAUDE_REQA2_FX_REPRO.mjs /tmp/cand
KIRI_P2_ROOT=/tmp/cand node P2_CLAUDE_DECIMAL_SAMPLE.mjs                         # 0/5008
```

## 9. Restricciones cumplidas y siguiente puerta de control

No se modificó `src/` ni `test/` del implementador, ni el candidato, los contratos, el baseline o las auditorías anteriores. No hubo merge ni despliegue, no se inició P3 y no se aceptó ninguna excepción. PR #3 sigue en DRAFT. Los bloqueos de mandatos y de reserva FX siguen intactos.

**Siguiente puerta de control: decisión del Líder Funcional.**
1. Decidir sobre **EXC-P2-06** (opciones de §5) y sobre OBS-RQ-01/02.
2. Si ordena una corrección, ChatGPT/Codex la implementa sobre `a285519`, publica SELF_TEST y congela el commit; Claude Code repite el re-QA de S09 y S12 (moneda única no VES y ruta heterogénea), la regresión completa y P1 sobre los 81 casos.
3. Si el Líder acepta expresamente EXC-P2-06 como límite documentado, le corresponde decidir si promueve P2 a VALIDATED_FOR_PILOT sobre `a285519`, con este dictamen y el registro de su decisión.

El auditor no promueve P2.
