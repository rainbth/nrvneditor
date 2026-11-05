# Editor Agentico — escribir y revisar con agentes sin perder la autoría

[English](editor-agentico.en.md) | [Español](editor-agentico.md)

**Autor:** rainbrth · **Fecha:** 2026-11-04 · **Estado:** v1.0.6 · **Licencia:** MIT (open source)

Este artículo explica la visión de producto de nrvn. No es una lista de features ni una promesa
de release. El estado real de cada capacidad vive en el [roadmap](../ROADMAP.md); los requisitos
verificables, en el [BRD](../BRD.md).

---

El patch de versión sube automáticamente durante `prebuild`/`predist`; se omite con `NRVN_SKIP_VERSION_BUMP=1`.

## 1. El problema: escribimos mucho con IA y revisamos cada vez menos

Hoy escribimos mucho con IA. El trabajo se ha acelerado y hemos delegado en agentes una parte
grande de la tarea humana. Como PM, cada vez me frustra más tener que modular el tono de voz para
la IA, decirle "esto sí" y "esto no" en cada petición. Cada vez más gente se rinde de revisar: se
crean documentos extensos que nadie lee porque saben que han sido producidos artificialmente y que
mañana pueden cambiar enteros.

Pero, al mismo tiempo, cada vez necesito más revisar documentos generados. La IA puede aprender
tu tono, tu forma de expresarte y la longitud que usas, y aun así fallar en cómo expresa una idea
o un concepto como tú quieres. La estructura puede estar bien y, sin embargo, tengo que ir sección
por sección tocando cosas. Y al hacerlo pierdo la posibilidad de iterar a nivel completo: el
documento deja de ser un sistema y se convierte en una suma de parches.

La pregunta que ordena el producto es esta: **¿cómo uso las habilidades de la IA a mi favor y no
en mi contra?**

## 2. La idea: un editor para escribir y revisar, no para volcar texto

Imaginé la herramienta que me facilitaría mi trabajo de escritura y revisión, y por eso creé mi
editor. No es un chat más largo ni un generador de documentos. Es una superficie donde el agente
trabaja sobre partes concretas del texto, conserva el porqué de cada decisión y me devuelve el
control de la narrativa.

La diferencia importante no es "escribir más rápido". Es **poder revisar sin rendirse**. Un
documento asistido por IA solo sirve si puedo recorrerlo, entenderlo, cambiarlo y defenderlo como
mío. nrvn existe para eso: reducir la fricción de revisar, no para producir más texto.

## 3. Principios de producto

1. **La unidad de trabajo es el área, no el documento.** Un bloque, una sección, un rango. El
   agente recibe esa área y su historia; el documento completo se usa solo cuando se pide de forma
   explícita.
2. **La decisión humana es un activo.** Cuando decido "esta sección va en primera persona porque
   el lector es un comité", esa razón debe sobrevivir a la siguiente edición. No quiero volver a
   explicarla en cada petición.
3. **El contexto importa tanto como el texto.** Una sección no se entiende sola: depende de lo que
   se prometió antes, de lo que se contradice después y del concepto que atraviesa el documento.
4. **El agente propone; la persona decide.** Nada se aplica solo. Las propuestas se ven como
   deltas y se aceptan, rechazan o se piden cambios.
5. **La procedencia es parte del documento.** Saber qué escribió una persona, qué generó un
   agente y qué se aceptó no es metadato decorativo: es lo que permite confiar en el texto.
6. **Honestidad antes que ilusión.** Si el producto no puede garantizar algo, lo dice. No simula
   autoría humana ni promete calidad automática.

## 4. Capacidades que queremos construir

La visión se organiza en deltas pequeños, iterables y verificables. El detalle, las dependencias y
las señales de aceptación están en el bloque **"Editor Agentico"** del
[roadmap](../ROADMAP.md#editor-agentico--escritura-y-revisión-con-agentes).

### 4.1 Iterar por área, con memoria

Editar trozos: seleccionar una sección, un párrafo o un bloque e iterar solo ahí. El contexto de
esa área se queda guardado. Mi agente sabe **por qué** esa sección está así, aun cuando vuelva a
editarla o pida una edición general. Las ediciones humanas permanecen como principio o guía.

Esto incluye:

- **Memoria de área:** decisiones humanas, instrucciones y el "por qué está así", visibles en el
  panel y presentes en el prompt de esa área.
- **Bloqueo de edición humana:** marcar un bloque como "no tocar" o "solo sugerencias" para que
  ninguna pasada global lo modifique.
- **Sesiones de foco:** fijar un área de trabajo durante un tiempo, con historial y un criterio
  explícito de "cerrado".

### 4.2 Saber cómo afecta una sección al resto

Una sección puede estar bien escrita y, aun así, romper el documento. Quiero que el agente pueda:

- comprobar cómo encaja la sección en el conjunto: duplicidades, contradicciones, tono y promesas
  sin cumplir;
- proponer **deltas**, no reescrituras completas;
- mostrar en contexto las secciones relacionadas a nivel conceptual, explicando la relación;
- sugerir variaciones, mejoras y preguntas pendientes por bloque, sin reescribir por su cuenta.

### 4.3 Generar desde varias fuentes, sin perder la trazabilidad

Generar un borrador o contenido a partir de múltiples fuentes. Importar de dos a cinco fuentes
(Markdown, URL o texto), extraer un outline, generar un borrador con citas y procedencia, y marcar
cada bloque como generado. Cada afirmación debería poder rastrearse a una fuente o a una decisión
humana.

### 4.4 Convertir correcciones en reglas

Una bandeja de instrucciones, una consolidación en bloque de reglas y una aplicación controlada a
los bloques que no se editaron a mano. La regla no sustituye a la persona: la hace escalable.

### 4.5 Procedencia, riesgos y honestidad

- Marcar contenido generado, reescrito o aceptado, con metadatos de autoría IA.
- Exportar preservando la procedencia.
- Detectar afirmaciones sin fuente, datos inventados, compromisos o promesas y contradicciones.
- No simular autoría humana en ningún caso.

## 5. Honestidad y límites

Esta sección separa la visión del estado real. Es la parte más importante del artículo.

### 5.1 Advertencia explícita

nrvn es una **herramienta personal**, publicada con la **licencia MIT** (source available) y **construida al 100 % con
IA**. Esa advertencia no es un detalle legal: describe el proyecto. No hay un equipo detrás ni un
compromiso de soporte; hay una persona iterando una herramienta que necesita y dejando el código
abierto para quien quiera usarla o auditarla.

### 5.2 Lo que hoy existe

A fecha de este documento (v1.0.6, 2026-11-04), están implementados:

| Capacidad | Estado | Qué significa |
| --- | --- | --- |
| Editor Markdown con hoja blanca y render GFM | Implementado | Leer y editar sin vista de código permanente. |
| Selección por bloque, sección y rango | Implementado | La unidad de trabajo existe y es visible. |
| Hoja blanca, Lato y números de línea en Markdown | Implementado | La estética editorial v3 se aplica al documento real. |
| Post-it «Editor Agentico» en documento vacío | Implementado | Una nota de bienvenida que se descarta por documento. |
| Conector OpenCode embebido y local | Implementado / en validación | El agente funciona dentro de la app o contra una instancia local. |
| OAuth de OpenCode Console | En validación | Flujo device para conectar cuenta y proveedores; validado contra código y mock, no contra el proveedor real. |
| Propuestas por bloque con diff y decisión humana | En validación | El agente propone y la persona acepta, rechaza o pide cambios. |
| Contexto de documento completo explícito | En validación | Se puede trabajar sobre el documento entero cuando el usuario lo pide. |
| Comentarios anclados y críticas/personas | Implementado | Anotaciones de revisión y audiencias/personas están disponibles en la app. |
| Variante desde revisión | Implementado | Genera una propuesta que corrige una crítica existente; no hay variantes libres por ejes (V-01…V-07). |
| Copias por idioma | Implementado | Archivos hermanos por idioma y sincronización por bloque; no es i18n de la UI. |

### 5.3 Lo que todavía no existe

No están implementados y **no deben presentarse como hechos**:

- variantes libres por ejes (extensión, detalle, tono, estructura, ejemplos, audiencia, libre);
- guidelines y banco de reglas;
- refactor de consistencia;
- versionado de documento y comparación de versiones;
- contexto conceptual relacionado;
- generación multi-fuente;
- memoria de área, bloqueo de edición humana y sugerencias por bloque;
- revisión de riesgos y trazabilidad afirmación → fuente;
- export que preserve la procedencia.

Tampoco hay release descargable firmado ni notarizado, ni métricas públicas. Los números del BRD
son objetivos de release, no resultados.

### 5.4 Lo que el producto no promete

- **No elimina el sesgo.** Un agente puede reproducir el sesgo de sus fuentes y de sus
  instrucciones. nrvn puede hacerlo visible y discutible; no puede hacerlo desaparecer.
- **No garantiza calidad.** Puede reducir fricción, ordenar decisiones y preservar el porqué. La
  calidad sigue dependiendo de la persona que revisa.
- **No produce dumps.** Si el resultado es un documento extenso que nadie lee, el producto ha
  fallado, aunque el texto sea correcto.
- **No sustituye la autoría.** La IA acelera, pero también puede erosionar la confianza y la
  autoría. nrvn existe para mantener el control humano de la narrativa, no para cederlo.

## 6. Cómo encaja con el resto de la documentación

- [README](../README.md): qué es nrvn y qué está disponible hoy.
- [Roadmap](../ROADMAP.md): prioridades, dependencias, estados y señales de aceptación.
- [BRD](../BRD.md): alcance, requisitos verificables y criterios de aceptación.
- [Sistema de diseño](../docs/design-system.es.md): la superficie visual del producto.

La regla es simple: si una capacidad no está en el roadmap con una señal de aceptación, no está
comprometida; si no está en el BRD, no está aprobada. Este artículo describe la dirección, no
adelanta el estado.
