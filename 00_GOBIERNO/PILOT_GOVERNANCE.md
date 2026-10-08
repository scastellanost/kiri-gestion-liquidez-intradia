# Gobierno Piloto — Gestión de Liquidez Intradía

## Estado de adopción
`PILOT`

## Roles
- **Líder Funcional:** decide reglas de negocio, metodología, excepciones y Human Gates.
- **ChatGPT:** dirección funcional/conceptual, contratos, orquestación, QA independiente y gobierno del estado.
- **Codex:** implementación de código conforme a contratos; no redefine reglas funcionales ni certifica su propio trabajo.
- **GitHub:** fuente oficial de verdad, archivo, trazabilidad, código, evidencias y decisiones.

## Ciclo obligatorio
1. Baseline/contrato.
2. Orden oficial.
3. Implementación Codex.
4. Self-test del implementador.
5. Commit + push a rama gobernada.
6. QA independiente.
7. Corrección si aplica.
8. Certificación.
9. Human Gate sólo si existe decisión real.
10. Cierre y archivo.

## Principio de certificación
`SELF_TEST != CERTIFICACION_INDEPENDIENTE`

Un PASS de Codex es evidencia técnica del implementador. La certificación requiere evaluación separada contra contrato, código, resultados y regresión.

## Archivo obligatorio
Ningún baseline, cierre o versión certificada se considera completo si no está:
- identificado;
- versionado;
- recuperable en GitHub;
- acompañado de evidencia y estado;
- separado del desarrollo posterior.
