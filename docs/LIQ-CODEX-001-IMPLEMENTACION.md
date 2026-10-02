# LIQ-CODEX-001 — Implementación y QA

## Uso del núcleo standalone

Requiere Node >= 20 para ejecutar `npm test` (también `node --test`).
Los módulos ESM no tienen dependencias ni requieren DOM. El consumidor puede
inyectar `localStorage` u otro adaptador síncrono `getItem`/`setItem`.

```js
import { createMoney, displayMoney, formatMoney, consolidateMoney } from '../src/money.js';
import { createState, setBCV, setDisplayCurrency, saveState, loadState } from '../src/state.js';

let state = createState({ managedDate: '2026-10-02' }); // VES, BCV pendiente
state = setBCV(state, '2026-10-02', {
  value: 36.5, source: 'BCV', timestamp: '2026-10-02T12:00:00Z'
});
const record = createMoney(36500000, 'VES');
state = setDisplayCurrency(state, 'USD');
displayMoney(record, state); // { amount: 1000000, currency: 'USD' }
formatMoney(record, state); // formateo es-VE mediante Intl
saveState(localStorage, state);
state = loadState(localStorage);
```

## API pública

- `MonetaryError`: error con `code` estable.
- `createMoney`: valida y congela monto y moneda originales.
- `validateState`: valida fecha, vista y estructura de tasas.
- `convertMoney`: única implementación de conversión; devuelve un equivalente.
- `displayMoney`: delega conversión usando `displayCurrency`.
- `formatMoney`: delega conversión y formatea mediante `Intl.NumberFormat`.
- `sumOriginals`: suma exclusivamente originales de moneda homogénea.
- `consolidateMoney`: convierte cada registro a una moneda explícita antes de sumar.
- `createState`: crea jornada con vista VES y BCV nula si no se suministra.
- `setDisplayCurrency`: selector lógico VES/USD, validado e inmutable.
- `setBCV`: actualiza BCV únicamente para la fecha indicada del estado.
- `saveState` / `loadState`: persisten/restauran conjuntamente fecha, estado,
  tasas (con fuente y timestamp) y vista.

## Decisiones técnicas

- La biblioteca central `src/money.js` contiene toda conversión y formateo.
  `src/state.js` administra snapshots; no implementa aritmética monetaria.
- Los originales y snapshots se congelan. Los equivalentes son objetos separados
  `{ amount, currency }`, para no confundirlos con registros originales.
- BCV expresa VES por USD, conforme al contrato. Otras tasas explícitas usan
  claves `ORIGEN_DESTINO` y expresan unidades de destino por unidad de origen.
  No se infieren tasas inversas, triangulaciones ni tasas de respaldo.
- `MISSING_EXCHANGE_RATE` bloquea conversiones sin tasa positiva finita.
  La vista USD requiere BCV válida. Si se intenta invalidar BCV mientras la vista
  es USD, la actualización se rechaza; el consumidor debe seleccionar VES antes.
- Cada snapshot representa una jornada. `setBCV` exige coincidencia de fecha;
  una nueva jornada se crea explícitamente con `createState`, sin arrastrar tasas.
  `timestamp` conserva la marca de origen, sin imponer que sea la fecha gestionada.
- Persistencia de la jornada activa bajo `kiri.liq-codex-001.state`. La ausencia
  devuelve `null`; JSON corrupto, estado inválido y errores de almacenamiento se
  propagan. No se sustituyen silenciosamente por datos iniciales.
- Se usan números finitos JavaScript, sin redondeo intermedio. QA de ida/vuelta
  exige tolerancia absoluta de `1e-8`. El redondeo visual pertenece a `Intl` y no
  altera originales. No se introduce una política contable de redondeo.
- `status` se conserva como dato opaco (inicialmente `null`); esta orden no define
  estados de negocio ni transiciones. No se implementa ese flujo.
- No hay interfaz previa en el repositorio. Se entrega un selector lógico y API
  reutilizable; no se agregan pantallas, navegación, estilos u otros módulos.

## QA ejecutado

Comando: `node --test`. Archivo: `test/liq-codex-001.test.js`.

| Caso | Verificación | Resultado |
|---|---|---|
| 01 | 36.500.000 VES / 36,50 = 1.000.000 USD | PASS |
| 02 | 1.000.000 USD × 36,50 = 36.500.000 VES | PASS |
| 03 | VES→USD conserva amount_original | PASS |
| 04 | Ida/vuelta reproduce original dentro de tolerancia | PASS |
| 05 | BCV cero bloquea USD | PASS |
| 06 | BCV nula bloquea USD | PASS |
| 07 | Registro USD conserva moneda y monto originales | PASS |
| 08 | Registro VES conserva moneda y monto originales | PASS |
| 09 | EUR y GBP sin tasa producen MISSING_EXCHANGE_RATE | PASS |
| 10 | Suma directa VES+USD rechazada; conversión explícita permitida | PASS |
| 11 | Vista inicial VES | PASS |
| 12 | Recarga conserva vista, fecha y BCV | PASS |
| 13 | BCV vinculada a managedDate | PASS |
| 14 | Cambio BCV recalcula equivalentes sin alterar originales | PASS |
| 15 | Única implementación central de conversión y formateo | PASS |

Resultado: **15 tests, 15 PASS, 0 FAIL, 0 cancelados, 0 omitidos**.
El caso 15 verifica estructura del código y formateo; la revisión del código
confirma que visualización y consolidación llaman a `convertMoney`.

## Bloqueos

Ningún `BLOCKED_BY_FUNCTIONAL_RULE` para el alcance de LIQ-CODEX-001.
No se implementaron reglas de órdenes posteriores.
