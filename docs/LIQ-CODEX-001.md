# LIQ-CODEX-001 — Motor de Estado y Moneda

## Objetivo
Construir el núcleo de estado monetario del standalone.

## Alcance
Implementar:
- `currency_original`
- `amount_original`
- VES como `displayCurrency` inicial
- selector lógico VES / USD
- BCV por jornada
- conversión explícita
- validación de monedas sin tasa
- persistencia de fecha, BCV y displayCurrency
- librería central de conversión/formateo

## No tocar
- navegación
- layout
- estilos
- identidad KIRI
- cobertura
- FX
- reservas
- mandatos
- conciliación
- SIGRF

## Contrato
```js
{
  managedDate,
  status,
  rates: {
    VES_USD_BCV: {
      value,
      source,
      timestamp
    }
  },
  displayCurrency: "VES"
}
```

Conversión:
- VES → USD = VES / BCV
- USD → VES = USD * BCV

Si BCV <= 0, bloquear equivalencia USD.
No usar valores fallback silenciosos.

## QA obligatorio
1. 36.500.000 VES @ 36,50 = 1.000.000 USD.
2. 1.000.000 USD @ 36,50 = 36.500.000 VES.
3. VES→USD no cambia `amount_original`.
4. USD→VES reproduce valor original dentro de tolerancia.
5. BCV cero bloquea USD.
6. BCV nula bloquea USD.
7. Registro USD conserva USD original.
8. Registro VES conserva VES original.
9. EUR sin tasa => `MISSING_EXCHANGE_RATE`.
10. Prohibido consolidar VES+USD con suma directa.
11. Vista inicial = VES.
12. Vista persiste al recargar.
13. BCV vinculada a `managedDate`.
14. Cambio BCV recalcula equivalentes, no originales.
15. Existe una sola implementación central de conversión.

## Entrega
- código
- tests
- resultado 15/15
- archivos modificados
- decisiones técnicas
- bloqueos `BLOCKED_BY_FUNCTIONAL_RULE`
