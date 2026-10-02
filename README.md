# Gestión de Liquidez Intradía — Alimentos KIRI

Repositorio standalone para el desarrollo controlado del aplicativo de Gestión de Liquidez Intradía.

## Gobierno
- No integrar con SIGRF durante su reingeniería.
- No modificar repositorios productivos del SIGRF.
- Moneda operativa de presentación: VES.
- Selector de visualización: VES / USD equivalente BCV.
- La moneda y monto originales siempre se preservan.
- Complejidad en el motor; claridad en la pantalla.
- Codex implementa; no redefine reglas funcionales.

## Metodología
Cada unidad funcional pasa por:
1. Contrato.
2. Implementación.
3. QA.

La primera orden autorizada es `docs/LIQ-CODEX-001.md`.
No avanzar a LIQ-CODEX-002 hasta alcanzar 15/15 QA PASS en CODEX-001.

## Estado
LIQ-CODEX-001 — READY FOR IMPLEMENTATION
