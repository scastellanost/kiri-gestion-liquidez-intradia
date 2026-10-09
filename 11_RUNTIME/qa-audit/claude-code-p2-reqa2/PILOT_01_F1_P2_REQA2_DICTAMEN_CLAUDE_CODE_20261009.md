# PILOT-01/F1/P2 — Dictamen de RE-QA independiente nº 2: EXC-P2-04 (Claude Code)

| Campo | Valor |
|---|---|
| Fecha | 2026-10-09 |
| Auditor | Claude Code; en este expediente solo audita (`SELF_TEST != CERTIFICACION_INDEPENDIENTE`) |
| Orden | PR #3, comentario #6084541652. Aprobación funcional de EXC-P2-04: #6084388651 |
| Rama / **commit auditado** | `qa/pilot-01-f1-p2-restart` @ **`5af50fdc829e94a6b62dc909923093a393c5912b`** (head del PR durante toda la auditoría) |
| Controles | `9146f4f` (candidato anterior, dictamen FAIL en S09) y `851bb58` (primera auditoría) |
| Entorno | Linux, Node v22.22.0. Checkouts `--detach` sin modificar (`git status` limpio después de ejecutar) |
| Rama de auditoría | `claude/wizardly-feynman-d2ar02`, separada de la implementación. Directorio nuevo `11_RUNTIME/qa-audit/claude-code-p2-reqa2/`. El expediente anterior `claude-code-p2-reqa/` no se modificó |

## Dictamen global: **FAIL**. P2 no es acreditable como VALIDATED_FOR_PILOT en `5af50fd`

La corrección elimina el déficit fantasma en igual moneda: S09 queda en PASS en empresa, banco y cola. Sin embargo, **introduce una regresión crítica en monedas heterogéneas (S12)**. Con tasas BCV reales, **la mitad de las posiciones con saldos o afectaciones en varias monedas dejan de publicarse** (`MONETARY_PRECISION_UNSUPPORTED`), y `buildNeedQueue` **lanza una excepción no controlada** en parte de ellas. En `9146f4f` esas mismas posiciones se publicaban. La aprobación #6084388651 exigía expresamente *preservar la lógica de monedas heterogéneas y el motor de conversiones FX*. Por eso EXC-P2-04 queda **NO ACREDITADA** y se propone un hallazgo nuevo, **EXC-P2-05**.

## 1. Gobierno, contratos e integridad

| Verificación | Resultado |
|---|---|
| Gobierno Rector y GOV-KIRI-AUTORIDAD-FUNCIONAL-EXCEPCIONES. GOV-CONT: auditoría continua hasta el dictamen | Aplicados |
| Contratos LIQ-CODEX-001/002/002A/003, aprobación #6084388651, puerta de compatibilidad monetaria y REPORT del implementador | Leídos; sirven de oráculos |
| Manifiesto `11_RUNTIME/work-results/P2_EXC04_SELF_TEST_20261009/manifest.json`: 29 archivos ejecutables cotejados por SHA-256 **y** por blob Git en `5af50fd` | **29/29 OK.** No hay archivos rastreados en `src/`, `test/` ni `package.json` fuera del manifiesto |
| Cambios de `9146f4f` a `5af50fd` | `src/money.js` (+4/−2), `src/position.js` (+3/−3), `src/needs.js` (+2/−2). Dos archivos de prueba nuevos (`p2-exc04-position`, `p2-exc04-boundaries`), sin cambios en pruebas previas. El workflow solo recibe un comentario. Los contratos y el gobierno no cambian. Verificado en RQ-X-02 |
| Evidencias previas de Claude | No se modificaron |

## 2. Regresión repetida por el auditor

| Ejecución | Resultado |
|---|---|
| `node --test` (18 archivos) | **392/392 PASS**, exit 0 (`REGRESSION_FULL_5af50fd.tap`, `REGRESSION_PER_FILE_5af50fd.txt`) |
| **P1** (`liq-codex-001` + `pilot-p1-monetary-integrity`) | **30/30 PASS** (`REGRESSION_P1_5af50fd.tap`) |
| Pruebas dirigidas del implementador (5 archivos) | 44/44 PASS (`REGRESSION_DIRECTED_5af50fd.tap`) |
| Muestreo original de EXC-P2-01 (5 008 casos) | 0 rechazos y 0 residuos |

La suite del implementador **no detecta** la regresión: su prueba FX usa importes y tasas cuyo resultado sí se puede representar.

## 3. Arnés independiente: 64 casos reutilizados + 9 nuevos = 73

`P2_CLAUDE_REQA2.harness.mjs` es una copia del arnés de 64 casos con dos adaptaciones documentadas: el umbral de S13 pasa a ≥ 392 y RQ-X-02 se compara contra `9146f4f`. Añade 9 casos RQ2-*.

| Commit | Resultado | Fallos |
|---|---|---|
| **`5af50fd` (candidato)** | **70/73** | RQ2-S12-01, RQ2-S12-02 y RQ2-S12-03 (monedas heterogéneas) |
| `9146f4f` (control) | 64/73 | Fallan los casos de S09 (RQ-S09-01/02, RQ2-S09-01…04), el control de regresión y RQ-X-02; **pasan los de S12** |
| `851bb58` (control) | 48/73 | — |

Los resultados de los controles confirman que el arnés distingue: el candidato corrige S09 y rompe S12, y el control anterior hace exactamente lo inverso.

## 4. Dictamen por escenario

| # | Escenario | Dictamen | Fundamento |
|---|---|---|---|
| S01 | Alta y cambios controlados | PASS | S01-a…e |
| S02 | Anulación parcial y total (precisión) | PASS | S02-a…d, RQ-S02-01…08 (6 700 + 3 000 casos), muestreo 0/5 008 |
| S03 | Stock reemplazable | PASS | S03-a…e |
| S04 | Stock retroactivo histórico | PASS | S04-a…c |
| S05 | Ajuste/anulación retroactiva | PASS | S05-a/b |
| S06 | Confirmado no disminuye | PASS | S06-a/b |
| S07 | Idempotencia | PASS | S07-a…c, RQ-S02-06 |
| S08 | Una necesidad activa / persistencia | PASS (OBS-RQ-01/02 vigentes) | OBS-08, RQ-S08-01…04 (32 corrupciones, 400 secuencias), RQ2-S09-04 (equilibrio exacto persiste tras recargar) |
| S09 | Déficit derivado (igual moneda) | **PASS** | RQ-S09-01 y RQ-S09-02 (0 fantasmas de 2 000). RQ2-S09-01: 1 500 posiciones equilibradas con reflejado parcial y reservas, sin defectos en empresa, banco ni cola. RQ2-S09-02: déficit real de 0,01 y de 0,00001 y superávit exactos (1 500 casos). RQ2-S09-03: un resultado no representable se rechaza de forma explícita y controlada. *En monedas heterogéneas el déficit queda sin publicar: ver S12* |
| S10 | Prioridad/rigidez y orden | PASS | S10-a/b, RQ-S10-01…04 |
| S11 | Reclasificación sin doble impacto | PASS | S11-a…c |
| **S12** | **Monedas heterogéneas** | **FAIL** (EXC-P2-05) | RQ2-S12-01/02/03, ver §5. Los casos S12-a…c, RQ2-S12-04 (tasa ausente) y RQ2-P1-01 pasan |
| S13 | Regresión íntegra | PASS | 392/392 y P1 30/30. No detecta EXC-P2-05 |

Transversales: X-01, X-02, RQ-X-01 y RQ-X-02 en PASS. **Permisos y simultaneidad: NO_DEMOSTRADO**, fuera de contrato. **Unidades mínimas legales: NO_DEMOSTRADO**, no están definidas.

## 5. Hallazgo nuevo — EXC-P2-05 (propuesto; severidad CRÍTICA; S12; regresión introducida por la corrección de EXC-P2-04)

**Definición vigente:**
- LIQ-CODEX-001/002: la posición se consolida en VES con tasa BCV. LIQ-CODEX-002 (línea 108) solo prevé dejarla *incompleta/no publicable* cuando **falta la tasa** de una moneda.
- Aprobación #6084388651: *"se preservan … la lógica de monedas heterogéneas y el motor de conversiones FX sin redondeos silenciosos"*.

**Discrepancia:** `calculate()` (`src/position.js`) ahora resta con `subtractDecimal` los totales de saldo, compromisos y reservas. Cuando hay monedas distintas, esos totales siguen saliendo de la rama FX binaria de `consolidateMoney` (p. ej., `287207.31091400003`). La diferencia decimal exacta de dos de esos valores no admite ida y vuelta en un `Number`. Resultado: `MONETARY_PRECISION_UNSUPPORTED` y la posición **no publicable**. En `buildNeedQueue` (`src/needs.js:186`), `addDecimal(compromisos, reservas)` se ejecuta fuera de cualquier captura y **lanza un `MonetaryError` no controlado**.

**Reproducción mínima** (`P2_CLAUDE_REQA2_FX_REPRO.mjs`, salida en `.out.txt`):

| Entrada (BCV sintético) | `9146f4f` | `5af50fd` |
|---|---|---|
| Saldos USD 5 624,34 y VES 82 075,82 a BCV 36,4721; compromiso VES 5 792,17 y reserva VES 18,25 | publicable; disponible 281 396,890914 | **no publicable**, `MONETARY_PRECISION_UNSUPPORTED` |
| Saldos USD 4 087,82 y VES 54 425,29 a BCV 191,6489; compromiso USD 9 024,27 y reserva VES 449,19 | posición y cola publicables; déficit 892 089,11 | posición publicable, pero **`buildNeedQueue` lanza `MonetaryError`** |

**Magnitud** (RQ2-S12-03: 2 000 posiciones con saldos USD+VES y afectaciones en VES, USD y EUR, BCV ∈ {36,5; 36,4721; 37,123456; 40,1234; 191,6489}):
- **999 de 2 000 (49,95 %) posiciones de empresa no publicables.** Incluso con BCV 36,5.
- **91 de 2 000 colas lanzan una excepción.**
- 0 desviaciones frente al oráculo FX en las posiciones que sí se publican.
- En `9146f4f`: 0 de 2 000 en los tres indicadores.

**Impacto:** cualquier empresa con saldos o afectaciones en más de una moneda (el caso habitual VES+USD) puede quedarse sin disponible ni déficit publicados. Aquí hay tasa, así que la no publicación no tiene base contractual. Además, la cola de necesidades puede abortar con una excepción en lugar de devolver el resultado no publicable con `errors` que usa el motor para los errores controlados. Esto también afecta a los consumidores de la cola (`posture.js`).

**Opciones, sin decisión implícita del auditor:**
- (a) Aplicar la resta y la suma exactas **solo cuando todos los componentes estén en la moneda destino**, conservar en la rama heterogénea la aritmética previa que la aprobación ordenó preservar, y garantizar que `buildNeedQueue` nunca lance excepciones (error controlado).
- (b) Definir una política de precisión para equivalencias FX. Esto exige una decisión funcional nueva que hoy no existe y que la puerta de compatibilidad no autorizó.
- (c) Otra que decida el Líder Funcional.

**Recomendación del QA:** (a), por ser la que se ajusta a la aprobación vigente.

## 6. Estado individual de las excepciones

| ID | Estado | Evidencia |
|---|---|---|
| EXC-P2-01 | **Mantiene CORREGIDA — ACREDITADA** | 0/5 008, RQ-S02-01…08 en PASS. Sin evidencia en contra |
| EXC-P2-02 | **Mantiene CORREGIDA — ACREDITADA** | OBS-08 y RQ-S08-01…04 en PASS. Sin evidencia en contra |
| EXC-P2-03 | **Mantiene CORREGIDA — ACREDITADA** | S10-a/b y RQ-S10-01…04 en PASS. Sin evidencia en contra |
| **EXC-P2-04** | **NO ACREDITADA** | El síntoma está corregido en igual moneda: RQ-S09-01/02 y RQ2-S09-01…04 en PASS, cuando en `9146f4f` fallaban. Pero la corrección incumple la condición expresa de la aprobación #6084388651 (preservar la lógica de monedas heterogéneas) y provoca EXC-P2-05. Se acreditará cuando una versión corrija ambas cosas a la vez |
| **EXC-P2-05** | **ABIERTA — NUEVA, CRÍTICA**, pendiente de decisión del Líder Funcional | §5 |

## 7. Observaciones vigentes (sin reglas nuevas inferidas)

- **OBS-RQ-01** (reapertura tras pendiente 0) y **OBS-RQ-02** (compatibilidad de estados v1): el comportamiento no cambia respecto de `9146f4f` y ninguna regla aprobada las regula. El auditor no infiere ninguna regla.

## 8. Reproducción

```bash
git fetch origin qa/pilot-01-f1-p2-restart claude/wizardly-feynman-d2ar02
git worktree add --detach /tmp/cand 5af50fdc829e94a6b62dc909923093a393c5912b
git worktree add --detach /tmp/prev 9146f4f4610e38ebd746fa66d9c6bcbd7d6acd5f      # control
git worktree add --detach /tmp/qa origin/claude/wizardly-feynman-d2ar02
cd /tmp/qa/11_RUNTIME/qa-audit/claude-code-p2-reqa2
(cd /tmp/cand && node --test)                                                   # 392/392
KIRI_P2_ROOT=/tmp/cand node --test P2_CLAUDE_REQA2.harness.mjs                  # 70/73 (RQ2-S12-01/02/03 FAIL)
KIRI_P2_ROOT=/tmp/prev node --test P2_CLAUDE_REQA2.harness.mjs                  # control 64/73 (S09 FAIL, S12 PASS)
node P2_CLAUDE_REQA2_FX_REPRO.mjs /tmp/prev; node P2_CLAUDE_REQA2_FX_REPRO.mjs /tmp/cand
KIRI_P2_ROOT=/tmp/cand node P2_CLAUDE_DECIMAL_SAMPLE.mjs                         # 0/5008
```

## 9. Restricciones cumplidas y siguiente puerta de control

No se modificó `src/` ni `test/` del implementador, ni el candidato, ni las evidencias previas de Claude. No hubo merge ni despliegue, no se inició P3 y no se aceptó ninguna excepción. PR #3 sigue en DRAFT. Los bloqueos de límite agregado de mandatos y de reserva de recomposición FX siguen intactos.

**Siguiente puerta de control (Líder Funcional):**
1. Decidir sobre **EXC-P2-05** (opciones de §5).
2. Si procede, ChatGPT/Codex corrige EXC-P2-04 y EXC-P2-05 juntas, sin perder la exactitud en igual moneda, y publica un nuevo commit congelado con su SELF_TEST, incluyendo posiciones heterogéneas con tasas BCV de precisión variable.
3. Claude Code repite el re-QA independiente de S12, S09, S02 y S08, la regresión completa y P1, reutilizando los 73 casos.

P2 **no** pasa a VALIDATED_FOR_PILOT con este dictamen.
