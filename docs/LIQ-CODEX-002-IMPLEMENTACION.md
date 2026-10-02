# LIQ-CODEX-002 — Motor de Posición

## Alcance entregado

Motor puro sin UI. Stock vigente separado de compromisos y reservas;
cargas manuales/masivas atómicas, preview, idempotencia, trazabilidad,
posición por empresa y banco, cálculo VES y vista USD del núcleo CODEX-001.
No se modificó el núcleo monetario ni se implementaron motores posteriores.

## Archivos

- `src/position.js`: motor y API pública.
- `test/liq-codex-002.test.js`: 20 casos QA con verificaciones adicionales.
- `docs/LIQ-CODEX-002-IMPLEMENTACION.md`: contrato técnico y evidencia QA.

## API pública

- `PositionError(code, detail)`: errores controlados.
- `createPositionState({ empresas, bancos, cuentas })`: catálogos explícitos y estado vacío.
- `previewBalances(state, rows, { batch_id | request_id })`: validación sin mutación.
- `previewAffectations(state, rows, { batch_id | request_id })`: misma semántica para afectaciones.
- `applyBalanceBatch(state, rows, batch_id)`: carga masiva de stock.
- `registerBalance(state, row, request_id)`: observación manual de stock.
- `applyAffectationBatch(state, rows, batch_id)`: carga masiva de afectaciones.
- `registerAffectation(state, row, request_id)`: operación manual de afectación.
- `calculateCompanyPosition(state, empresa, monetaryState)`: posición canónica VES.
- `calculateBankPosition(state, empresa, banco, monetaryState)`: vista bancaria preliminar VES.
- `displayPosition(position, monetaryState)`: vista equivalente mediante CODEX-001.

Las operaciones de aplicación devuelven un nuevo snapshot congelado. El consumidor
adopta ese resultado como estado oficial solo si la llamada termina sin error.
Un lote inválido no deja aplicaciones parciales ni consume su identificador.
El preview devuelve `{ status: 'VALID' | 'ERROR', errors }`; no aplica el lote.

## Estructuras y ejemplo

Los catálogos de empresas y bancos son listas de identificadores únicos. Cada
cuenta tiene `cuenta`, `empresa`, `banco` y `monedas` (lista explícita de monedas
admitidas); no se crean cuentas a partir de transacciones.

```js
import { createPositionState, registerBalance, registerAffectation,
  calculateCompanyPosition, displayPosition } from '../src/position.js';
import { createState, setDisplayCurrency } from '../src/state.js';

const monetary = createState({ managedDate: '2026-10-02', rates: {
  VES_USD_BCV: { value: 36.5, source: 'BCV', timestamp: '2026-10-02T09:00:00Z' }
} });
let state = createPositionState({ empresas: ['E'], bancos: ['B'], cuentas: [
  { cuenta: 'C', empresa: 'E', banco: 'B', monedas: ['VES'] }
] });
state = registerBalance(state, {
  empresa: 'E', banco: 'B', cuenta: 'C', amount_original: 100,
  currency_original: 'VES', fecha_hora_saldo: '2026-10-02T09:00:00Z',
  origen: 'MANUAL', fecha_hora_evento: '2026-10-02T09:01:00Z'
}, 'saldo-1');
state = registerAffectation(state, {
  affectation_id: 'OB-1', empresa: 'E', tipo_partida: 'PAGO',
  naturaleza_afectacion: 'COMPROMISO', amount_original: 20,
  currency_original: 'VES', operacion: 'ALTA', origen: 'MANUAL',
  fecha_hora_evento: '2026-10-02T10:00:00Z'
}, 'obligacion-1');
const ves = calculateCompanyPosition(state, 'E', monetary); // gestión: 80
const usd = displayPosition(ves, setDisplayCurrency(monetary, 'USD'));
```

Todas las cargas requieren `origen` y `fecha_hora_evento` ISO con zona horaria;
`usuario` es opcional. Saldos requieren además `fecha_hora_saldo`.
La entrada monetaria acepta `amount_original`/`currency_original` o los alias
`monto_original`/`moneda_original` del contrato. Si se suministran ambos deben
coincidir. El estado conserva exclusivamente los nombres canónicos de CODEX-001.

En ALTA, `monto_vigente` omitido es el monto original y
`monto_reflejado_confirmado` omitido es cero (no hay confirmación).
ALTA debe tener monto original positivo y crea una afectación ACTIVA.
Los únicos estados de negocio son ACTIVA y ANULADA.

AJUSTE identifica `affectation_id` y proporciona el nuevo `monto_vigente`
absoluto y/o `monto_reflejado_confirmado` absoluto, sin crear otra obligación.
ANULACION identifica `affectation_id` y proporciona `monto_anulado` positivo;
la anulación total pendiente deja ANULADA la afectación y conserva sus originales.
La parte ya reflejada de un compromiso se conserva al anular el pendiente.
No se permite alterar empresa, naturaleza, originales ni asignación bancaria
mediante AJUSTE/ANULACION; reclasificación y postura no están implementadas.

## Decisiones técnicas

- Clave de stock: empresa/banco/cuenta/moneda. Una observación posterior reemplaza
  el stock de esa clave. Observaciones conflictivas con timestamp idéntico o
  duplicados conflictivos de la misma clave dentro de un lote se rechazan.
- Preview y aplicación comparten validación y se ejecutan sobre una copia.
  Las entradas y el snapshot anterior no se modifican.
- Cada batch_id y request_id tiene su propio espacio de identificadores. La
  reutilización exacta devuelve el mismo snapshot sin nuevos efectos ni eventos.
  La reutilización con otro contenido/tipo de carga produce IDEMPOTENCY_CONFLICT.
  Se normaliza el orden de claves de objetos; el orden de filas sí es significativo.
- Los recibos de idempotencia y eventos son parte del estado retornado. Se deben
  conservar durante la continuidad intradía. Esta orden no agrega persistencia
  externa, cierre ni reinicio D+1.
- El historial técnico conserva observaciones y entradas/resultados de afectaciones,
  con origen, timestamp, usuario opcional e ID de carga. Solo `balances` contiene
  el stock vigente; el historial nunca se suma.
- Todo cálculo se convierte explícitamente a VES mediante `consolidateMoney` de
  CODEX-001. `displayPosition` usa `convertMoney` de esa misma biblioteca.
  No hay fórmulas BCV ni formateo monetario duplicados en el Motor de Posición.
- Cualquier tasa faltante deja esa agregación con `publicable: false`, importes
  `null` y error `MISSING_EXCHANGE_RATE`; no se publica una suma parcial ni cero
  sustituto. Otras empresas/bancos sin esa exposición conservan su cálculo propio.
- Los originales se preservan; las afectaciones usan importes vigentes derivados
  para el cálculo. No se infiere ejecución por caídas del saldo.
- La vista de empresa contiene `localizaciones` y conserva las afectaciones
  NO LOCALIZADO. La vista bancaria resta solo afectaciones asignadas y expone
  `disponibilidad_localizada_preliminar`; no es capacidad transferible. La empresa
  consolidada gobierna y ningún motor de esta orden dispone fondos intercompany.
- El estado de posición lo administra el consumidor junto al estado monetario de
  la jornada. No se infiere una tasa ni se elige automáticamente otra jornada.
- La precisión y validación monetaria se heredan de CODEX-001; no se introduce una
  política de redondeo contable nueva.

## BLOCKED_BY_FUNCTIONAL_RULE

El contrato no determina estas transiciones; se rechazan sin mutar estado:

1. Anulación parcial: falta definir el efecto en vigente/estado y su tratamiento
   respecto de lo reflejado. Se consultó al usuario; no se asume respuesta.
2. Observación de saldo anterior a la vigente: no se define si se ignora, se
   conserva solo como histórico o reemplaza stock.
3. Cambio de afectación con timestamp anterior al último evento: no se define
   una política de correcciones retroactivas.
4. Disminución de `monto_reflejado_confirmado`: no se define la reversión de una
   confirmación de Tesorería.

Estos bloqueos no afectan los ejemplos ni los 20 QA especificados. El resultado
20/20 no implica que estas reglas pendientes hayan sido resueltas.

## QA ejecutado

Comando: `node --test`. Incluye regresión completa de CODEX-001.

| Caso | Resultado | Evidencia verificada |
|---|---|---|
| QA-P01 | PASS | Stock 100→90; un solo vigente, no 190 |
| QA-P02 | PASS | Banco 100 menos compromiso 20 = 80 |
| QA-P03 | PASS | Banco 100 menos compromiso 20 menos reserva 15 = 65 |
| QA-P04 | PASS | Sin banco reduce empresa a 70 y queda NO LOCALIZADO |
| QA-P05 | PASS | Nuevo saldo 90, confirmado 10, pendiente 10, gestión 80 |
| QA-P06 | PASS | Nuevo saldo 80 no confirma ejecución: gestión 60 |
| QA-P07 | PASS | Anular 20 restaura gestión 100 y conserva trazabilidad |
| QA-P08 | PASS | Ajuste a 25 conserva una afectación y original 20 |
| QA-P09 | PASS | Lote repetido no duplica; ID con otro contenido se rechaza |
| QA-P10 | PASS | request_id repetido no duplica afectación |
| QA-P11 | PASS | VES+USD convertido; sin tasa agregación no publicable |
| QA-P12 | PASS | Cuenta inexistente: preview ERROR y sin mutación |
| QA-P13 | PASS | Cuenta de otra empresa: ERROR y sin mutación |
| QA-P14 | PASS | Banco inexistente ERROR; sin banco válido y NO LOCALIZADO |
| QA-P15 | PASS | Anulación excesiva rechazada |
| QA-P16 | PASS | Gestión -30; déficit 30 |
| QA-P17 | PASS | Empresa negativa sin remanente ni compensación intercompany |
| QA-P18 | PASS | Dos cuentas 40+60 = 100 |
| QA-P19 | PASS | Empresa 100, bancos 70/30; afectaciones asignadas localizadas |
| QA-P20 | PASS | Agregar/convertir no altera originales ni entradas |

Resultado CODEX-002: **20/20 PASS**.
Regresión CODEX-001: **15/15 PASS**.
Total: **35 PASS, 0 FAIL, 0 cancelados, 0 omitidos**.
