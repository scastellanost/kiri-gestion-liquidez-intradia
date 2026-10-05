# PROTOCOLO DE EJECUCIÓN CONTROLADA — CODEX

## 1. Principios rectores

1. Codex implementa. No redefine reglas funcionales.
2. El usuario actúa como **Líder Funcional / Propietario Funcional**. Codex no desplaza esa autoridad con decisiones técnicas implícitas.
3. Ante una ambigüedad funcional, normativa o de negocio: `BLOCKED_BY_FUNCTIONAL_RULE`. No inventar la regla.
4. Standalone únicamente mientras SIGRF permanezca fuera de alcance.
5. No modificar estética, layout, navegación, identidad ni experiencia de usuario salvo orden explícita.
6. Moneda y monto originales nunca se pierden.
7. Una obligación económica se descuenta una sola vez.
8. Una empresa nunca financia a otra poniendo en riesgo sus propias necesidades.
9. El sistema propone; Tesorería decide.
10. Ninguna restricción, permiso, umbral, integración, credencial, parámetro corporativo o supuesto operativo puede ser inventado.

## 2. GOV-01 — Liderazgo Funcional y Comunicación Comprensible

Toda implementación debe tratar al usuario como Líder Funcional, no como especialista en programación, bases de datos, infraestructura, DevOps u otras disciplinas técnicas.

Codex debe mantener rigor técnico, pero toda decisión, bloqueo o cambio relevante debe poder explicarse en lenguaje comprensible para el Líder Funcional.

No se puede usar complejidad técnica como sustituto de una decisión funcional.

## 3. GOV-01.1 — Terminología Técnica Explicada, Registrada y Trazable

Todo término técnico, acrónimo o concepto especializado nuevo utilizado durante análisis, diseño, implementación, QA, seguridad, persistencia, integración, operación o despliegue debe:

- explicarse en lenguaje comprensible;
- registrarse en la documentación de la orden o glosario acumulativo;
- usarse después de forma consistente;
- no aparecer en una interfaz futura sin traducción funcional apropiada.

Una vez definido formalmente un término, no debe cambiarse silenciosamente.

## 4. Forma obligatoria de trabajo por orden

Cada orden pasa por tres etapas obligatorias:

### A. Contrato antes de construir
Antes de modificar código, Codex debe declarar y verificar:

- objetivo;
- alcance incluido;
- alcance excluido;
- archivos previstos;
- APIs previstas;
- migraciones o cambios de estado si aplican;
- dependencias con órdenes anteriores;
- reglas funcionales aplicables;
- supuestos;
- bloqueos pendientes;
- casos QA obligatorios;
- criterios de aceptación.

Si existe contradicción entre documentos rectores, Codex no elige silenciosamente cuál gana: registra el conflicto y lo escala.

### B. Implementación controlada
Durante la ejecución:

- realizar cambios mínimos, trazables y coherentes con la orden;
- reutilizar motores existentes antes de duplicar lógica;
- no introducir reglas de órdenes futuras;
- no crear atajos, bypasses o defaults silenciosos;
- no usar TODO como sustituto de una decisión bloqueada;
- no alterar contratos ya aprobados salvo instrucción expresa;
- no introducir datos reales, credenciales reales ni integraciones productivas sin autorización;
- preservar inmutabilidad, linaje y trazabilidad donde correspondan.

### C. QA y cierre
Después de implementar:

- ejecutar todos los QA de la orden;
- ejecutar regresión completa de órdenes anteriores;
- documentar PASS/FAIL exacto;
- verificar estructura, relaciones, temporalidad, multiempresa, seguridad, fórmulas, moneda, trazabilidad e idempotencia cuando apliquen;
- registrar deuda técnica;
- registrar cualquier `BLOCKED_BY_FUNCTIONAL_RULE`;
- producir evidencia de QA;
- detenerse en el cierre de la orden.

Ninguna orden se cierra con tests requeridos fallidos.

## 5. Autorización para avanzar

Un PASS técnico no autoriza por sí solo avanzar a la siguiente orden.

El flujo es:

1. Codex implementa y publica.
2. ChatGPT audita contra el contrato funcional y el repositorio.
3. El Líder Funcional autoriza continuar, explícita o implícitamente mediante la instrucción de avance.
4. Solo entonces se abre la siguiente orden.

Codex no debe saltar automáticamente a la siguiente fase.

## 6. Gestión de cambios y conflictos

Todo cambio de una regla ya aprobada debe indicar:

- qué cambia;
- por qué;
- impacto;
- alternativas consideradas;
- pruebas afectadas;
- fecha;
- estado de aprobación.

No existen cambios silenciosos de contrato.

Si dos artefactos rectores entran en conflicto, Codex debe:
- conservar ambos;
- identificar el conflicto;
- detener la decisión afectada;
- escalar para resolución funcional.

## 7. Evidencia mínima por entrega

Cada entrega debe incluir:

1. archivos modificados;
2. funciones/APIs creadas o afectadas;
3. tests creados o modificados;
4. resultado exacto de QA y regresión;
5. decisiones técnicas;
6. términos técnicos nuevos explicados;
7. bloqueos;
8. deuda técnica;
9. commit publicado;
10. confirmación de que no hubo merge a `main` salvo orden expresa.

## 8. Regla de diseño transversal

La complejidad pertenece al motor y a la documentación técnica.

La experiencia futura debe ser clara, ejecutiva y comprensible:
**posición → necesidad → prioridad → ruta → restricción → decisión**.

No trasladar al usuario final la complejidad interna del modelo mediante términos técnicos, duplicaciones, paneles redundantes o alertas decorativas.

## 9. Regla de excelencia y trazabilidad

Cada componente debe poder responder:
- qué regla aplica;
- por qué aplica;
- qué dato la activó;
- qué cálculo produjo;
- qué decisión habilita o bloquea;
- dónde queda registrada la evidencia.

Este protocolo es obligatorio para todas las órdenes CODEX actuales y futuras del proyecto Gestión de Liquidez Intradía.
