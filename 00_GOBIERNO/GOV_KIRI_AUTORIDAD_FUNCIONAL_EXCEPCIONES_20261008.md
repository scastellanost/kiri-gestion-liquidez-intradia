# GOV-KIRI-AUTORIDAD-FUNCIONAL-EXCEPCIONES — Ratificación transversal
Fecha: 2026-10-08
Autoridad: Líder Funcional / Propietario Funcional
Estado: RATIFICADO — aplicación obligatoria en todas las fases y proyectos KIRI.

## Regla invariable
**Únicamente el Líder Funcional puede APROBAR, RECHAZAR o ACEPTAR CONDICIONALMENTE una excepción funcional, semántica, metodológica o de alcance**, o cambios en definiciones, fórmulas, umbrales, universos, fuentes autorizadas, interpretación de resultados y criterios de aceptación. Su silencio no significa aprobación.

QA, analistas, diseñadores, programadores, agentes IA y operadores pueden IDENTIFICAR, DOCUMENTAR, EVALUAR, PROPONER y RECOMENDAR. **Nunca aprobar en nombre del Líder Funcional**, reclasificar unilateralmente una excepción como aceptada, ni cambiar reglas para lograr PASS.

## Separación de responsabilidades
- Diseño/Análisis: proponer alternativas con justificación y efecto.
- Desarrollo: implementar SOLO especificaciones o cambios previamente aprobados; no decidir reglas.
- QA independiente: verificar de manera objetiva; emitir dictamen técnico/semántico/funcional PASS, FAIL, PASS_CON_EXCEPCIONES o NO_DEMOSTRADO sustentado. Un dictamen **no equivale** a aceptación funcional de las excepciones.
- Líder Funcional: decidir cada excepción y cualquier cambio material de negocio, dejar constancia de condiciones, límites y riesgos aceptados.
- Operaciones: aplicar únicamente versiones liberadas por el gobierno.

## Circuito obligatorio
HALLAZGO → EVIDENCIA → EVALUACIÓN DE IMPACTO → PROPUESTA Y OPCIONES → QA INDEPENDIENTE → **DECISIÓN EXPLÍCITA DEL LÍDER FUNCIONAL** → IMPLEMENTACIÓN SI PROCEDE → NUEVO QA → CONGELAMIENTO Y TRAZABILIDAD.

## Registro mínimo por excepción
ID único; proyecto/módulo/indicador; versión; definición vigente; discrepancia detectada; impacto funcional, financiero, semántico, operativo y en datos; fuente de evidencia; opciones sin decisión implícita; recomendación del QA; identidad, fecha y texto inequívoco de la decisión del Líder Funcional; condiciones, vigencia, acciones y verificación posterior.

## Reglas de bloqueo
- Una excepción con PASS_CON_EXCEPCIONES **no está aceptada** hasta la decisión expresa del Líder Funcional.
- Hallazgos críticos semánticos impiden certificar íntegramente el componente afectado; no ocultar el riesgo con una etiqueta general de PASS.
- No se permite cambiar nomenclatura, equivalencias, siglas, fórmulas, umbrales o fuentes de manera que altere el significado sin aprobación.
- Cambios de forma sin efecto material siguen el gobierno de cambios; si existe duda sobre el significado, tratar como candidato y elevar al Líder Funcional.
- Nadie puede modificar producción, hacer merge protegido o alterar baselines congelados fuera de sus autorizaciones expresas.

## Aplicación QA en todas las fases
QA conceptual/semántico, funcional/cálculos, datos, seguridad, técnico/integración/regresión, operación/continuidad. Registrar excepciones y responsable. La aceptación funcional y la certificación independiente son condiciones distintas y acumulativas.

## Siglas y conflictos
Conceptos como «crédito/préstamo» o siglas idénticas con significados diferentes deben inventariarse, comparar universo, fórmula, unidad y uso, y presentarse para decisión; NO unificar automáticamente.

Glosario: dictamen QA = valoración del auditor sobre evidencias; aceptación de excepción = decisión del Líder Funcional de permitir un límite de manera consciente y documentada; congelamiento = preservar una versión reproducible; puerta funcional = punto donde únicamente el Líder Funcional decide.
