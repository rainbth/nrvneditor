# BRD — nrvn

[English](BRD.en.md) | [Español](BRD.md)

**Documento vivo de consolidación de features**
Producto: `nrvn` — editor local de Markdown con agentes
Versión del documento: v1.0.6 · Fecha: 2026-11-04 · Autor: rainbrth
Licencia del producto: MIT (open source)

> Este BRD es la fuente de verdad del alcance. Cualquier feature que no aparezca aquí no
> está aprobada. Los cambios se registran en la sección 15 (Changelog).
> Las decisiones de arquitectura marcadas como **DECIDIDO** no se reabren en v1; si una
> decisión resulta inviable, se documenta la desviación y su impacto antes de cambiar código.
> La visión de escritura y revisión con agentes se desarrolla en
> [`docs/editor-agentico.md`](docs/editor-agentico.md) ([English](docs/editor-agentico.en.md));
> la priorización y el estado, en [`ROADMAP.md`](ROADMAP.md) ([English](ROADMAP.en.md)).

---

## 1. Resumen y propósito

`nrvn` es una aplicación de escritorio para macOS (arm64 en v1) que permite editar
documentos Markdown asistidos por un agente de IA, sin salir del sistema de archivos local
y sin que el agente pueda tocar nada por su cuenta.

El usuario abre una carpeta, navega únicamente sus archivos Markdown, lee el documento con
estética editorial o pasa a Markdown editable, selecciona un bloque o una sección y pide al
agente una reescritura. El agente **propone**; el usuario ve un diff y decide: Aceptar,
Rechazar o Pedir cambios. Cada bloque guarda su historial de versiones y admite comentarios
anclados.

Propósito de este documento: consolidar en un solo lugar el problema, el alcance, los
requisitos verificables, los criterios de aceptación, la arquitectura y el plan por fases,
de forma que ingeniería, diseño y QA puedan ejecutar sin ambigüedad.

### 1.1 Visión

`nrvn` nace de un problema real de PMs y escritores que redactan documentos con IA: las
herramientas actuales son chat suelto o editores que reescriben todo. Falta un editor que
permita **iterar documentos por partes, preservando la voz y el contexto**, y convertir las
correcciones repetidas en reglas reutilizables.

La unidad de trabajo no es el documento: es el bloque, la sección o el rango que el usuario
selecciona. Alrededor de esa unidad se organizan la voz, el foco, las guidelines y las
versiones.

La visión no es "escribir más rápido", sino **poder revisar sin rendirse**: que un documento
asistido por IA siga siendo legible, discutible y defendible como propio. nrvn existe para reducir
la fricción de revisar y preservar las decisiones humanas, no para producir dumps de contenido
generado. Esa dirección incluye memoria de área, bloqueo de edición humana, coherencia global,
contexto conceptual, generación multi-fuente y procedencia exportable; ninguna de esas capacidades
se considera implementada hasta que el roadmap marque su señal de aceptación.

### 1.2 Principios

| Principio | Qué significa en el producto |
| --- | --- |
| **Iteración aislada** | El agente recibe solo la selección y solo puede tocarla. El documento completo solo si el usuario lo selecciona explícitamente. |
| **Voz y tono persistentes** | Un perfil de voz por espacio/documento (registro, persona, longitud, léxico, cosas a evitar, ejemplos) usado como contexto de estilo, separado del contenido. |
| **Sesiones de foco** | El escritor se centra en un área (p. ej. "Introducción") durante un tiempo, itera y la cierra; el historial queda asociado a ese bloque o sección. |
| **Bandeja de guidelines** | Cada instrucción útil se captura; cuando hay suficientes, se resumen en un bloque de reglas aplicable al documento. |
| **Refactor de consistencia** | Las reglas consolidadas se aplican a bloques no editados a mano, siempre como propuestas con diff. |
| **Versionado por bloque** | Cada cambio (IA o manual) crea una versión navegable con procedencia; restaurar crea una versión nueva. |
| **Comentarios anclados** | Revisión por elemento, con hilo y resolución. |
| **Local-first y control** | Ficheros en disco, metadatos en Application Support, propuestas que el usuario acepta, agente sin tools. |

**Principio rector:** el archivo del usuario es sagrado. Ninguna escritura ocurre sin
intención explícita del usuario, y ninguna escritura ocurre sin snapshot previo.

### 1.3 Estado real y honestidad

nrvn es una **herramienta personal**, publicada con la **licencia MIT** (source available) y **construida al 100 % con IA**. Esa
advertencia es explícita y forma parte de la definición del producto.

A fecha de 2026-11-04 (v1.0.6), el producto incluye edición Render/Markdown, selección, agente y propuestas,
operaciones de Render, comentarios anclados, críticas, variante desde revisión, copias por idioma y metadatos `.nrvn`.
Las variantes libres V-01…V-07, versionado por bloque/documento, voz, foco, guidelines, refactor de consistencia,
i18n completa y auditoría AA formal no están implementados. Firma/notarización Apple, Windows/Linux, auto-update y sync tampoco están disponibles.

La IA acelera la escritura, pero también puede erosionar la confianza y la autoría. nrvn no
promete eliminar sesgos ni garantizar calidad: promete reducir fricción, hacer visibles las
decisiones y mantener el control humano de la narrativa. El detalle está en
[`docs/editor-agentico.md#5-honestidad-y-límites`](docs/editor-agentico.md#5-honestidad-y-límites).

---

## 2. Problema y contexto

### 2.1 Problema

Escribir y revisar Markdown de calidad es lento y fragmentado:

1. **Fricción de herramientas.** Los editores Markdown buenos para leer no son buenos para
   editar, y los buenos para editar imponen una vista de código que rompe la lectura.
2. **Asistentes de IA invasivos.** Las herramientas con IA actuales trabajan a nivel de
   documento completo o de chat suelto: el usuario copia y pega, pierde el contexto de
   *qué* está reescribiendo y no tiene control granular sobre el resultado.
3. **Pérdida de control.** Los agentes que pueden ejecutar herramientas (shell, escritura de
   archivos, red) son un riesgo inaceptable sobre documentos personales.
4. **Contexto perdido.** Las conversaciones con IA sobre un documento no quedan asociadas al
   documento; al reabrir el archivo, se empieza de cero.
5. **Anotaciones huérfanas.** Los comentarios y revisiones viven en otro sitio (o en el propio
   archivo como estado portable separado: sidecar `.md.nrvn` junto al documento y caché en Application Support).

### 2.2 Contexto

- El usuario objetivo es una persona técnica o de producto que escribe en Markdown a diario
  (notas, documentación, borradores) y ya paga por un proveedor de modelos.
- El ecosistema disponible hoy permite resolver esto de forma local: Electron para escritorio,
  OpenCode embebido para orquestar el agente, y un SDK con acceso programático a modelos.
- No hay requisito de colaboración ni de nube en v1. Todo el estado vive en la máquina.

### 2.3 Hipótesis de producto

Si el usuario puede seleccionar exactamente lo que quiere cambiar y el agente solo propone,
entonces aceptará usar IA en documentos que hoy no deja tocar a un asistente automático.

---

## 3. Usuarios y casos de uso

### 3.1 Segmentos

| Segmento | Descripción | Necesidad dominante |
| --- | --- | --- |
| **P1 — Autores técnicos** | Escriben docs, RFCs, notas de arquitectura en Markdown dentro de un repo local. | Reescribir secciones con precisión sin romper formato ni perder historial. |
| **P2 — PM / escritor que redacta con IA** | Redactan briefs, PRDs, notas de entrevistas y ensayos en Markdown, con ayuda de modelos. | Iterar por partes preservando su voz, sin reescribir el documento entero. |
| **P3 — Editor técnico** | Revisan y pulen documentación de otros: consistencia, tono, terminología. | Aplicar reglas de estilo de forma controlada y dejar registro de cada cambio. |
| **P4 — Revisor** | Leen un documento ajeno y dejan feedback por elemento. | Comentar bloques concretos con hilo y resolución, sin editar el texto. |
| **P5 — Usuarios de OpenCode** | Ya usan OpenCode y tienen modelos configurados. | Una superficie de edición que aproveche su configuración existente. |

### 3.2 Casos de uso principales

- **CU-1 · Reescribir un párrafo.** El usuario hace clic en un párrafo, escribe "más conciso,
  sin perder el dato del 40 %", revisa el diff y acepta.
- **CU-2 · Reestructurar una sección.** Selecciona el heading de nivel 2, pide "convierte esto
  en una lista de decisiones con su justificación", acepta.
- **CU-3 · Revisar un rango.** Selecciona con Shift tres párrafos contiguos y pide unificar el
  tono.
- **CU-4 · Volver atrás.** Tras aceptar tres propuestas en un bloque, navega el historial con
  `‹ ›` y restaura la versión anterior.
- **CU-5 · Anotar.** Deja un comentario en un bloque, lo resuelve más tarde; si el bloque
  cambió, ve el aviso "bloque editado".
- **CU-6 · Continuar después.** Cierra la app, la reabre, y la conversación del documento
  sigue ahí.
- **CU-7 · Fijar la voz.** Define una vez el perfil de voz del documento ("primera persona,
  frases cortas, sin adverbios en -mente") y lo reutiliza en cada petición sin repetirlo.
- **CU-8 · Cerrar un foco.** Trabaja solo en "Introducción" durante una sesión, itera con el
  agente y cierra el área; el historial de esa área queda agrupado.
- **CU-9 · Capturar una regla.** Tras corregir "no uses adverbios" tres veces, guarda la
  instrucción en la bandeja y, al acumular suficientes, la convierte en bloque de reglas.
- **CU-10 · Consistencia final.** Aplica el bloque de reglas a los bloques que no ha tocado a
  mano y revisa las propuestas con diff antes de aceptarlas.

### 3.3 No usuarios (v1)

Equipos que necesitan edición concurrente, usuarios de Windows/Linux, usuarios que esperan
un editor WYSIWYG inline.

---

## 4. Objetivos y métricas de éxito

### 4.1 Objetivos de producto

- **O-1.** Que pedir una reescritura de un bloque sea más rápido que copiar a un chat y pegar
  de vuelta.
- **O-2.** Que el usuario nunca pierda contenido por una acción del agente o de la app.
- **O-3.** Que la app sea usable sin terminal una vez instalada.
- **O-4.** Que la app sea confiable sin conexión salvo la llamada al proveedor de modelo.

### 4.2 Métricas medibles (v1)

| ID | Métrica | Definición operativa | Objetivo v1 | Cómo se mide |
| --- | --- | --- | --- | --- |
| M-1 | Tiempo a primera propuesta | Desde Cmd+Enter hasta que aparece el primer bloque de propuesta parseado, con modelo de referencia y documento < 20 KB. | ≤ 20 s p50, ≤ 45 s p90 | Telemetría local opcional (contador en disco) o instrumentación de dev build. |
| M-2 | Propuestas aplicadas sin edición manual posterior | % de propuestas aceptadas que no se revierten en la misma sesión. | ≥ 60 % | Conteo local de eventos `proposal.accept` vs `version.restore`. |
| M-3 | Tasa de contrato roto | % de respuestas del agente que no parsean. | ≤ 5 % con el prompt shipped | Contador local `proposal.parse_error`. |
| M-4 | Pérdida de datos | Casos reportados de contenido perdido tras aceptar o autosave. | 0 | Bug tracker + tests de escritura atómica. |
| M-5 | Arranque en frío | Desde doble clic hasta árbol visible. | ≤ 2,5 s | Instrumentación de dev build. |
| M-6 | Cobertura de criterios de aceptación | AC-1…AC-22 verificados y en verde en CI local. | 22/22 | Checklist del release. |
| M-7 | Suite de tests | Tests automatizados de splitter, rangos, parser e historial. | ≥ 20 | `npm test`. |
| M-8 | Tiempo para iterar un bloque | Desde que el usuario tiene un bloque seleccionado hasta que acepta o rechaza la propuesta, con documento < 20 KB. | ≤ 45 s p50, ≤ 90 s p90 | Telemetría local opcional de eventos `proposal.shown` / `proposal.decided`. |
| M-9 | Propuestas aceptadas sin retoque | % de propuestas aceptadas que no se editan manualmente en los 60 s siguientes. | ≥ 55 % | Contadores locales `proposal.accept` vs `block.manual_edit` posterior. |
| M-10 | Reducción de reescrituras completas | % de peticiones que usan "Seleccionar documento completo" frente al total de peticiones. | ≤ 10 % | Contador local por tipo de selección. |
| M-11 | Consistencia de voz | Puntuación media (1–5) de una rúbrica de voz aplicada a una muestra de bloques aceptados: registro, persona, longitud, léxico y cosas a evitar. | ≥ 4,0 | Rúbrica manual sobre muestra; no se automatiza en v1. |
| M-12 | Retención de guidelines | % de guidelines capturadas que llegan al bloque de reglas resumido y se aplican al menos una vez. | ≥ 40 % | Contadores locales `guideline.capture`, `guideline.summarize`, `guideline.apply`. |

> Las métricas M-1 a M-5 y M-8 a M-12 son objetivos de release, no promesas públicas. No se
> publican en README hasta tener datos reales. M-6 y M-7 son criterios de calidad internos.

---

## 5. Alcance

### 5.1 Dentro de alcance (v1)

La v1 se entrega por fases (v0.1.x → v0.2 → v0.3 → v1.0). Esta lista es el alcance completo
del producto, no el estado del código.

1. Empaquetado macOS arm64 como `.app` y `.dmg`, sin firma Apple.
2. Apertura de carpeta por diálogo nativo (menú Archivo, menú in-app Workspace) y árbol
   filtrado a `.md`/`.mdx`.
3. Lectura, render y escritura con autosave, guardado manual, indicador y escritura atómica.
4. Render GFM con resaltado de código y tipografía editorial.
5. Toggle Render ↔ Markdown preservando posición aproximada.
6. Selección de bloque, sección y rango contiguo; mapeo de selección de texto a bloques.
7. Outline del documento.
8. Panel de agente con streaming, cancelación, selector de modelo e historial por documento.
9. Contexto **estrictamente limitado a la selección activa** (bloque, sección, rango contiguo o documento completo seleccionado explícitamente) en cada petición.
10. Propuestas con diff y acciones Aceptar / Rechazar / Pedir cambios.
11. Historial de versiones por bloque con navegación y restauración.
12. Comentarios anclados a bloques con hilo, badge, resolver/reabrir, borrar.
13. Atajos de teclado, estados vacío/carga/error, accesibilidad AA, light/dark.
14. Modo mock sin créditos para desarrollo y Playwright.
15. Documentación: este BRD y el README, en español e inglés.
16. Perfil de voz por espacio/documento, usado como contexto de estilo (RF-16).
17. Sesiones de foco asociadas a un bloque o sección (RF-17).
18. Bandeja de guidelines y resumen en bloque de reglas (RF-18, RF-19).
19. Refactor de consistencia sobre bloques no editados a mano, como propuestas (RF-20).
20. UI y menú nativo en español e inglés, con selector persistido y detección del sistema
    (RF-21, RF-22).

### 5.2 Alcance por fase

| Fase | Incluye | Estado |
| --- | --- | --- |
| **v0.1.x** | Shell Electron, workspace Markdown, editor CodeMirror, render GFM, selección, menús nativos/in-app, titlebar, icono, diseño v2 y modo mock. | Hecho (v0.1.2) |
| **v0.2** | OpenCode embebido, agente `nrvn-editor` sin tools, streaming, propuestas/diff, versiones por bloque, comentarios anclados, perfil de voz básico, sesiones de foco, i18n ES/EN con selector. | En curso (B3): agente, conectores y propuestas en validación; versiones, comentarios, voz, foco e i18n pendientes. |
| **v0.3** | Bandeja de guidelines + resumen de reglas, refactor de bloques no editados, versionado de documento, export y git. | Planificado |
| **v1.0** | Windows/Linux, firma/notarización, i18n completa, accesibilidad auditada, sync opcional. | Planificado |

### 5.3 Fuera de alcance (v1) — explícito

| Excluido | Motivo | Fase prevista |
| --- | --- | --- |
| Multiusuario / colaboración en tiempo real | Requiere infraestructura de sync y resolución de conflictos. | No planificado |
| Sync en nube | Contradice la promesa de localidad de v1. | v1.0 (opcional, sin promesa de nube) |
| Integración git (diff, commit, blame) | Aumenta superficie y expectativas; v1 no toca el repo del usuario. | v0.3 |
| Export PDF | Requiere motor de impresión y plantillas; no es el núcleo. | v0.3 |
| WYSIWYG inline | El modelo de bloques + CodeMirror cubre la necesidad con menos riesgo. | No planificado |
| Versionado a nivel documento | v1 versiona por bloque; el historial global es un producto distinto. | v0.3 |
| Temas personalizables por el usuario | Añade superficie de diseño y QA; v1 trae light/dark curados. | v0.3 |
| Windows / Linux empaquetado | El código es portable, pero solo se empaqueta macOS arm64. | v1.0 |
| Firma y notarización Apple | Requiere cuenta de desarrollador y proceso de release. | v1.0 |
| Agentes con tools (shell, fs, red) | Riesgo inaceptable sobre documentos personales. | No planificado |
| Procesador de textos completo | El producto itera bloques Markdown; no compite con Word/Docs. | No planificado |
| Generación de imágenes | Fuera del núcleo de escritura; añade coste y superficie. | No planificado |
| Chat generalista | El agente solo trabaja sobre la selección del documento. | No planificado |

---

## 6. Requisitos funcionales

Convención: cada requisito se redacta "El sistema debe…" y es verificable. Cada RF está
mapeado a un criterio de aceptación literal (AC-n) de la sección 6.16.

### RF-1 · Empaquetado y arranque como aplicación

El sistema debe empaquetarse como aplicación de escritorio macOS arm64 (`.app` y `.dmg`
generados en `release/`) y debe arrancar con doble clic, sin terminal, sin variables de
entorno y sin dependencia de un servicio externo en ejecución. Al arrancar abre **siempre** un
documento nuevo vacío sin título en Render; no restaura el workspace ni el árbol anterior.

- Verificación: ejecutar `npm run dist`, montar el `.dmg`, arrastrar a `/Applications`,
  abrir desde Finder.
- Nota: sin firma Apple en v1; el primer arranque puede requerir autorización manual del
  usuario (ver R-5).

### RF-2 · Apertura de carpeta y árbol de Markdown

El sistema debe permitir elegir una carpeta mediante diálogo nativo y mostrar un árbol que
incluya subcarpetas y **solo** archivos `.md` y `.mdx`, excluyendo `node_modules`, `.git` y
`dist`. El árbol debe reflejar cambios en disco al recuperar el foco de la ventana. Abrir un
archivo debe cargarlo en el editor en menos de 300 ms para archivos de hasta 200 KB.

- Verificación: carpeta de prueba con `.md`, `.mdx`, `.txt`, imágenes y las carpetas
  excluidas; medir con `performance.now()` en build de producción.
- Regla de orden: directorios primero, luego archivos; orden alfabético, insensible a
  mayúsculas, con locale `es`.

### RF-3 · Edición Markdown, autosave e indicador de guardado

El sistema debe ofrecer una vista Markdown editable basada en CodeMirror 6 con resaltado,
undo/redo y atajos estándar; guardar automáticamente 800 ms después de la última edición y
permitir guardado inmediato con Cmd+S; si el documento no tiene ruta, Cmd+S abre
"Guardar como…" (IPC `saveDocumentAs`) y la carpeta elegida pasa a ser la raíz del workspace;
mostrar un indicador con los estados `Guardando…` y
`Guardado` (y `Sin guardar` si hay cambios pendientes o error); y escribir de forma atómica
(archivo temporal en el mismo directorio + `rename`).

- Verificación: editar y esperar 800 ms → indicador `Guardado`; matar el proceso durante la
  escritura → el archivo original permanece íntegro.
- Regla: nunca se escribe un archivo con contenido vacío como resultado de un fallo; si el
  buffer queda vacío por una acción del usuario, se escribe vacío pero con snapshot previo.

### RF-4 · Render GFM con estética editorial

El sistema debe renderizar GitHub Flavored Markdown —encabezados, párrafos, listas
ordenadas y no ordenadas, tablas, task lists, código en línea y en bloque, citas, enlaces,
imágenes, reglas horizontales— con tipografía de prosa editorial, y debe resaltar la sintaxis
del código en bloques con un tema coherente con light/dark.

- Verificación: documento fixture que ejercita cada constructo; comparación visual en
  Playwright (snapshot) y prueba de que un bloque de código contiene tokens resaltados.

### RF-5 · Selección de bloques, secciones y rangos

El sistema debe:

- seleccionar **un bloque** al hacer clic en un párrafo, ítem de lista, tabla, bloque de
  código o cita;
- seleccionar la **sección completa** (hasta el siguiente heading de nivel ≤) al hacer clic
  en un heading;
- extender a un **rango contiguo** con Shift + clic;
- mapear una selección de texto en modo Markdown a los bloques correspondientes;
- limpiar la selección con Esc.

La selección debe ser visible (contorno/realce) y anunciada por lector de pantalla.

- Verificación: fixture con documentación de la jerarquía; probar cada gesto y comprobar el
  conjunto de claves de bloque seleccionadas mostrado en el panel de agente.

### RF-6 · Panel de agente con sesión por documento

El sistema debe mostrar un panel derecho con la conversación del documento, el selector de
modelo disponible, streaming de tokens en vivo, botón Cancelar durante la generación, y
mantener una sesión de agente **por documento** con historial persistente entre reinicios de
la app.

- Verificación: abrir doc A, conversar, cerrar app, reabrir → el hilo de A está presente y el
  de B no aparece. Cancelar a mitad de stream deja el mensaje parcial marcado como cancelado.
- Regla: cambiar de documento cambia el hilo; el stream en curso se cancela al cambiar de
  documento (con confirmación si hay generación activa).

### RF-7 · Contexto de la petición y aislamiento del agente

El sistema debe construir cada prompt con **exclusivamente**: ruta del archivo, ruta de
headings de la selección, el contenido exacto de los bloques seleccionados, la instrucción del
usuario y el contrato de salida de la sección 8. El documento completo **no** forma parte del
contexto por defecto: solo se envía si el usuario ejecuta la acción explícita **Seleccionar
documento completo**, en cuyo caso la selección *es* el documento entero.

El agente de edición debe ser el agente dedicado `nrvn-editor`, con **todas** las herramientas
denegadas y los MCP del usuario desactivados en esa instancia. Su ámbito de trabajo es la
selección: no se le pide revisar, resumir ni reescribir nada fuera de ella, y el contrato solo
admite operaciones sobre las claves seleccionadas.

- Verificación: snapshot del prompt construido en tests unitarios; para una selección de un
  párrafo, el prompt no contiene texto de otros bloques ni el documento completo.
- Verificación: prueba negativa — se pide al agente "lista los archivos de la carpeta" y debe
  responder que no puede o reformular; no debe existir ninguna llamada a tool en el log del
  host.
- Verificación: el panel muestra la selección activa como contexto único y el botón de envío
  está deshabilitado sin selección.

### RF-8 · Propuesta con diff y decisión del usuario

El sistema debe mostrar toda propuesta como diff antes/después por bloque, y ofrecer:

- **Aceptar** → aplica exactamente el reemplazo propuesto para los bloques indicados.
- **Rechazar** → no modifica el documento.
- **Pedir cambios** → reabre el composer con el contexto anterior y la propuesta rechazada.

Ninguna propuesta se auto-aplica. Si la respuesta no cumple el contrato, el sistema debe
mostrar el texto crudo en un estado de error explícito, sin diff y sin acciones de aplicación.
Cualquier operación que referencie una clave **fuera de la selección activa** invalida la
propuesta completa: el agente no puede tocar bloques que el usuario no seleccionó.

- Verificación: tres propuestas, una por acción; y una respuesta corrupta (sin marcador de
  cierre) que debe caer en error sin tocar el archivo.

### RF-9 · Historial de versiones por bloque

El sistema debe crear una versión de bloque en cada cambio aceptado y en cada cambio manual
relevante, y ofrecer un overlay por bloque con navegación `‹ ›`, indicación de fecha/origen
(`agente` / `manual` / `restaurada`) y acción **Restaurar**, que crea una nueva versión (no
borra historia). El historial debe persistir entre reinicios y sobrevivir a la app sin
conexión.

- Verificación: aceptar 3 propuestas en un bloque → 3 versiones navegables; restaurar la
  primera → 4 versiones; reiniciar app → historial intacto.

### RF-10 · Comentarios anclados a bloques

El sistema debe permitir crear comentarios anclados a un bloque, mostrados por un badge en el
margen del bloque, con hilo de respuestas, acciones resolver/reabrir y borrar. Los comentarios
deben persistir por workspace y documento. Si el hash del bloque cambia por una edición, el
comentario debe seguir visible marcado como **"bloque editado"**.

- Verificación: crear comentario, editar el bloque manualmente, comprobar la marca; resolver y
  reabrir; borrar; reiniciar app.

### RF-11 · Atajos, estados y accesibilidad AA

El sistema debe implementar los atajos Cmd+O (abrir carpeta), Cmd+E (toggle Render/Markdown),
Cmd+S (guardar), Cmd+Enter (enviar al agente) y Esc (cerrar overlay / limpiar selección /
cancelar generación, en ese orden de prioridad). Debe cubrir estados vacío, carga y error en
árbol, documento y panel de agente. Debe cumplir WCAG 2.1 AA en foco visible, roles y
etiquetas ARIA, contraste de texto, `aria-live` para el streaming y navegación completa por
teclado en árbol y panel.

- Verificación: checklist manual AA + axe-core en Playwright; prueba de teclado sin ratón.

### RF-12 · Sistema de diseño y layout de tres paneles

El sistema debe usar tokens propios de diseño (color, espaciado, tipografía, radios, motion
120/180 ms) sin valores mágicos en componentes; layout de tres paneles colapsables
(árbol, documento, agente) con un ancho mínimo usable; responsive funcional a ≥ 1024 px y un
aviso claro por debajo de 900 px; y dependencias exclusivamente con licencias permisivas
(MIT/ISC/BSD/Apache-2.0/OFL).

- Verificación: auditoría de `package.json` contra lista permitida; prueba de colapso de cada
  panel; captura a 1024 y 899 px.

### RF-13 · Host OpenCode embebido, modelos y modo mock

El sistema debe arrancar el host de OpenCode embebido en el proceso principal, detectarlo
correctamente, listar los modelos realmente disponibles según la configuración del usuario y
mostrar un estado de error con acción de reintento si la detección falla. Debe existir un
modo mock (`VITE_MOCK_BRIDGE`) funcional que reproduzca el flujo completo sin créditos ni red.

- Verificación: build normal con y sin credenciales; build mock ejecutando el flujo de los
  tres pasos en Playwright.

### RF-14 · Calidad verificable de la entrega

El sistema debe pasar `npm run typecheck`, `npm run lint`, `npm test` (≥ 20 tests cubriendo
splitter de bloques, rangos de selección, parser de propuesta e historial), `npm run build` y
`npm run dist`, y debe incluir un smoke test de Playwright con capturas del flujo principal.

- Verificación: ejecución limpia en un clon del repo con `npm ci`.

### RF-15 · Documentación coherente con el estado real

El sistema debe entregarse con `README.md` y `BRD.md` completos y coherentes con el estado
real del código: nada documentado como existente si no lo está, y toda funcionalidad
existente documentada.

- Verificación: revisión cruzada en el release; los comandos del README se ejecutan tal cual.

### RF-16 · Perfil de voz por espacio/documento (v0.2)

El sistema debe permitir definir y persistir un **perfil de voz** por workspace y, opcionalmente,
por documento, con estos campos: registro, persona gramatical, longitud objetivo, léxico
preferido, lista de cosas a evitar y ejemplos. El perfil se enviará al agente como **contexto de
estilo separado del contenido**, nunca mezclado con el texto de los bloques, y el usuario podrá
ver exactamente qué se envía. El perfil sobrevive a reinicios y no modifica el `.md`.

- Verificación: definir un perfil, enviar una petición y comprobar en el snapshot del prompt que
  el perfil va en una sección de estilo distinta del contenido; reiniciar y comprobar
  persistencia.
- Regla: desactivar el perfil para una petición no lo borra.

### RF-17 · Sesión de foco (v0.2)

El sistema debe permitir iniciar una **sesión de foco** sobre un bloque o una sección, con nombre
editable (p. ej. "Introducción") y, opcionalmente, una duración. Mientras esté activa, el panel
de agente debe indicar el foco y agrupar el historial de esa área por separado. Cerrar el foco no
borra el historial ni el contenido. Solo puede haber una sesión de foco activa por documento.

- Verificación: iniciar foco en una sección, iterar dos veces, cerrarlo, reabrir la app y
  comprobar que el historial del foco sigue asociado a esa sección.
- Regla: cambiar de documento pausa el foco, no lo cierra.

### RF-18 · Bandeja de guidelines (v0.3)

El sistema debe permitir **capturar una instrucción de estilo** desde el composer o desde la
selección ("no uses adverbios", "frases de máximo 20 palabras") y guardarla en una bandeja por
workspace con texto, ejemplo de origen, fecha y estado (`nueva`, `en reglas`, `descartada`). La
bandeja debe permitir editar, descartar y reordenar; debe sugerir duplicados y persistir entre
reinicios.

- Verificación: capturar tres guidelines, editar una, descartar otra, reiniciar y comprobar
  estado y orden.
- Regla: una guideline capturada no se aplica sola; solo entra en contexto cuando forma parte
  del bloque de reglas o el usuario la invoca.

### RF-19 · Resumen en bloque de reglas (v0.3)

El sistema debe **consolidar** las guidelines en un bloque de reglas cuando se alcance un umbral
configurable (por defecto 8 guidelines `nueva`) o cuando el usuario lo pida. La consolidación
debe ser una operación asistida por modelo que muestre un **diff del bloque de reglas** antes de
guardarlo; el bloque resultante será editable a mano, versionado y aplicable como contexto a
cualquier petición.

- Verificación: con 8 guidelines, ejecutar "Consolidar", revisar el diff y aceptar; el bloque
  queda versionado y las guidelines pasan a `en reglas`.
- Regla: si la consolidación falla o produce un diff vacío, la bandeja queda intacta y se
  muestra error con reintento.

### RF-20 · Refactor de bloques no editados a mano (v0.3)

El sistema debe permitir aplicar el bloque de reglas a los bloques del documento que **no han
sido editados manualmente**, entendiendo por tales los que conservan el hash de su última versión
generada por el agente o restaurada. El resultado debe llegar como **propuestas por bloque con
diff**, nunca como escritura automática; debe indicar cuántos bloques se omiten por edición
manual y permitir aceptar o rechazar cada propuesta.

- Verificación: documento con 5 bloques, editar uno a mano, lanzar refactor → 4 propuestas y 1
  omitido; aceptar 2 y comprobar que solo esos dos cambian en disco.
- Regla: un bloque sin historial previo cuenta como no editado a mano y es elegible.

### RF-21 · Interfaz y menú nativo en español e inglés (v0.2)

El sistema debe soportar **español e inglés** en toda la UI y en el menú nativo: sin cadenas
hardcodeadas en componentes, con fechas y números formateados según el locale, y con el
contenido del documento intacto (nunca se traduce el texto del usuario). El idioma por defecto en
la primera ejecución será el del sistema si es `es` o `en`; en cualquier otro caso, inglés.

- Verificación: recorrer árbol, documento, menús, panel de agente y estados vacío/carga/error en
  ambos idiomas; comprobar que no queda texto sin traducir y que el documento no cambia.
- Regla: el idioma no altera el formato en disco ni el contenido de los metadatos.

### RF-22 · Selector de idioma persistido (v0.2)

El sistema debe ofrecer un **selector de idioma** (Español / English) en ajustes y en el menú,
persistir la elección en `settings.json` y aplicarla sin reiniciar la app, reconstruyendo el menú
nativo. La elección manual prevalece sobre la detección del sistema en arranques posteriores.

- Verificación: cambiar a inglés, reiniciar y comprobar que la UI y el menú nativo siguen en
  inglés; cambiar a español y comprobar que se aplica en caliente.
- Regla: si falta o es inválido el valor persistido, se aplica la detección del sistema con
  fallback a inglés.

### 6.16 Criterios de aceptación (literales)

Estos 22 criterios son la definición de "terminado" de v1 y se citan sin reinterpretación.

1. `npm run dist` genera `.app`/`.dmg` en `release/` y la app abre sin terminal.
2. Abrir carpeta por diálogo nativo; el árbol muestra solo `.md`/`.mdx` incluyendo subcarpetas y excluye `node_modules`, `.git`, `dist`; abrir archivo lo carga en <300 ms.
3. Toggle Render/Markdown con Cmd+E preservando posición aproximada; CodeMirror con resaltado, undo y atajos; autosave 800 ms + Cmd+S; indicador Guardando/Guardado; escritura atómica.
4. Render GFM (tablas, task lists, código, citas, enlaces) con tipografía editorial y resaltado de código.
5. Clic en párrafo selecciona bloque; clic en heading selecciona sección; Shift extiende rango contiguo; selección en modo edición mapea líneas a bloques; Esc limpia.
6. Panel de agente con conversación, selector de modelo, sesión por documento, streaming de tokens, cancelar e historial persistente entre reinicios.
7. El prompt incluye archivo, ruta de headings, bloque(s) y contrato de salida; el agente no puede ejecutar tools (verificado con prueba negativa).
8. Propuesta muestra diff antes/después; Aceptar aplica exactamente el reemplazo; Rechazar no toca el documento; Pedir cambios reabre el prompt; contrato roto = estado de error sin auto-apply.
9. Cada cambio aceptado o manual crea versión de bloque; flechas ‹ › navegan versiones en overlay; Restaurar crea nueva versión; persiste entre reinicios.
10. Comentarios anclados a bloque con badge, hilo, resolver/reabrir y borrar; persisten; muestran "bloque editado" si cambia el hash.
11. Atajos Cmd+O/Cmd+E/Cmd+S/Cmd+Enter/Esc; estados vacío/carga/error; accesibilidad AA (foco visible, roles, contraste, aria-live en streaming, navegación por teclado en árbol y panel).
12. Tokens de diseño (color, espaciado, tipografía, motion), layout de 3 paneles colapsables, responsive ≥1024 px con aviso bajo 900 px, dependencias solo permisivas.
13. Detección del host OpenCode embebido y listado real de modelos; estado de error con reintento; modo mock funcional sin créditos.
14. `npm run typecheck`, `npm run lint`, `npm test` (≥20 tests de splitter, rangos, parser de propuesta e historial), `npm run build` y `npm run dist` en verde; smoke Playwright con capturas.
15. README.md y BRD.md completos y coherentes con el estado real del código.
16. Perfil de voz por workspace/documento con registro, persona, longitud, léxico, cosas a evitar y ejemplos; se envía como contexto de estilo separado, se puede previsualizar y persiste entre reinicios.
17. Sesión de foco nombrada sobre un bloque o sección, con historial agrupado, pausa al cambiar de documento y persistencia al cerrar.
18. Bandeja de guidelines con captura, edición, descarte, reordenación, detección de duplicados y persistencia.
19. Consolidación de guidelines en bloque de reglas con diff previo, versión del bloque y estado `en reglas` para las guidelines incluidas.
20. Refactor de consistencia sobre bloques no editados a mano: propuestas por bloque con diff, omisión de bloques editados y nunca escritura automática.
21. UI y menú nativo en español e inglés, sin cadenas hardcodeadas, con locale en fechas/números y contenido del documento intacto.
22. Selector de idioma persistido en `settings.json`, aplicado sin reinicio y con detección del sistema en el primer arranque (fallback inglés).

Estado de criterios: **release actual = v1.0.6**; **v1.0 final = cierre de plataforma**.

| AC | Release actual | v1.0 final |
| --- | --- | --- |
| AC-1 | cumplido | cumplido |
| AC-2 | cumplido | cumplido |
| AC-3 | cumplido | cumplido |
| AC-4 | cumplido | cumplido |
| AC-5 | cumplido | cumplido |
| AC-6 | cumplido | cumplido |
| AC-7 | cumplido | cumplido |
| AC-8 | cumplido | cumplido |
| AC-9 | no cumplido | cumplido |
| AC-10 | cumplido | cumplido |
| AC-11 | parcial | cumplido |
| AC-12 | parcial | cumplido |
| AC-13 | cumplido | cumplido |
| AC-14 | cumplido | cumplido |
| AC-15 | cumplido | cumplido |
| AC-16 | no cumplido | cumplido |
| AC-17 | no cumplido | cumplido |
| AC-18 | no cumplido | cumplido |
| AC-19 | no cumplido | cumplido |
| AC-20 | no cumplido | cumplido |
| AC-21 | no cumplido | cumplido |
| AC-22 | no cumplido | cumplido |

AC-11: atajos implementados; auditoría AA formal pendiente. AC-12: tokens/layout implementados; responsive extremo no verificado.

**Matriz RF ↔ AC:** RF-1↔AC-1, RF-2↔AC-2, RF-3↔AC-3, RF-4↔AC-4, RF-5↔AC-5,
RF-6↔AC-6, RF-7↔AC-7, RF-8↔AC-8, RF-9↔AC-9, RF-10↔AC-10, RF-11↔AC-11,
RF-12↔AC-12, RF-13↔AC-13, RF-14↔AC-14, RF-15↔AC-15, RF-16↔AC-16, RF-17↔AC-17,
RF-18↔AC-18, RF-19↔AC-19, RF-20↔AC-20, RF-21↔AC-21, RF-22↔AC-22.

---

## 7. Requisitos no funcionales

### RNF-1 · Rendimiento

- Arranque en frío ≤ 2,5 s hasta árbol visible en MacBook Air M1.
- Apertura de archivo ≤ 300 ms hasta contenido pintado (≤ 200 KB).
- Escritura de bloque aceptada percibida ≤ 100 ms (diff + aplicación en renderer).
- El splitter de bloques debe procesar 200 KB en ≤ 50 ms en el hilo de UI (o moverse a
  worker si se supera; decisión de implementación, no de alcance).
- Streaming debe pintar tokens con coalescing por frame, sin más de 60 renders/s.
- Regla de memoria: no se cargan todos los documentos de la carpeta; solo el abierto y su
  árbol de metadatos.

### RNF-2 · Seguridad

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` en el renderer.
- Ninguna exposición de `ipcRenderer` directo: solo un bridge tipado por `contextBridge` con
  canales enumerados.
- El renderer no recibe rutas absolutas arbitrarias: las operaciones de disco se validan en
  el proceso principal contra la raíz de la carpeta abierta (prevención de path traversal).
- Render de Markdown sin HTML crudo por defecto; `dangerouslySetInnerHTML` prohibido para
  contenido del usuario. Enlaces externos abiertos con `shell.openExternal` y confirmación de
  esquema (`https`, `mailto`).
- Sin ejecución de contenido del documento (nada de scripts, iframes ni `file://` cargables
  desde el render).

### RNF-3 · Privacidad local

- El estado de workspace vive bajo `~/Library/Application Support/nrvn/`; los metadatos portables del documento
  viven en `<documento>.md.nrvn` junto al `.md`. El contenido `.md` solo cambia por ediciones aceptadas.
- No hay telemetría remota en v1. Los contadores de métricas de la sección 4 son locales y
  opcionales.
- La red se usa para peticiones al proveedor de modelo, consultar el catálogo de proveedores/modelos del host
  y OAuth device contra `https://opencode.ai/console` al conectar una cuenta.
- Los documentos nunca se suben a servidores de nrvn: no existen servidores de nrvn.

### RNF-4 · Integridad y recuperación de datos

- Escritura atómica obligatoria (temp + rename) en toda escritura de documento.
- Snapshot del bloque y del documento antes de aplicar cualquier propuesta aceptada o
  restauración de versión.
- Si el snapshot o la escritura fallan, el documento permanece intacto y se muestra error con
  reintento; nunca se aplica parcialmente.
- Los metadatos se escriben atómicamente; el sidecar portable y los datos de workspace permiten recuperar el estado.

### RNF-5 · Accesibilidad AA

- Contraste mínimo 4,5:1 para texto normal y 3:1 para texto grande y elementos de UI no
  textuales, en light y dark.
- Foco visible siempre (nunca `outline: none` sin reemplazo).
- Roles y nombres accesibles en árbol, paneles, overlays y composer; `aria-live="polite"`
  para el streaming y `assertive` para errores de guardado.
- Navegación completa por teclado, incluida selección de bloques en modo render.
- Respeto a `prefers-reduced-motion` (motion a 0 ms, sin pérdida funcional).

### RNF-6 · Portabilidad

- Código sin APIs específicas de macOS en la capa de producto, salvo: diálogo nativo, rutas
  de `Application Support` (via `app.getPath`), y el empaquetado.
- Ninguna dependencia de binarios exclusivos de macOS en el runtime del renderer.
- v1 solo se empaqueta y se prueba en macOS arm64; el resto de plataformas no se promete.

### RNF-7 · Licencias permisivas

- Solo dependencias MIT, ISC, BSD-2/3, Apache-2.0 y OFL para fuentes.
- Prohibidas GPL/AGPL/LGPL en runtime y en herramientas de build que se distribuyan.
- Toda dependencia nueva requiere verificación de licencia antes de entrar en `main`.
- Las fuentes se distribuyen bajo OFL con su texto de licencia incluido (hoy Inter y Newsreader; Lato como objetivo v3, con Inter como fallback).

### RNF-8 · Mantenibilidad y observabilidad

- TypeScript `strict`, sin `any` implícito; el bridge IPC es la única frontera no tipada y
  está tipada a mano en un módulo compartido.
- Logs locales rotativos en `~/Library/Logs/nrvn/` con nivel configurable; sin contenido de
  documentos en logs por defecto (solo rutas y longitudes).
- Errores del host OpenCode se traducen a mensajes accionables en UI (no stack traces).

### RNF-9 · Compatibilidad de datos

- El contenido del `.md` no recibe metadatos ni front-matter y no se reformatea globalmente; los metadatos portables
  se guardan en `<doc>.md.nrvn` junto al documento.
- Normalización de saltos de línea: se preserva el estilo detectado del archivo (LF o CRLF).
- Codificación: UTF-8; BOM preservado si existía.

---

### RNF-10 · Internacionalización (i18n)

- Toda cadena visible pasa por un catálogo de traducción (`es`, `en`); no hay texto hardcodeado
  en componentes ni en la plantilla del menú nativo.
- Fechas, números y duraciones se formatean con `Intl` según el locale activo.
- El contenido del usuario, las claves de bloque, las rutas y los identificadores de modelo
  nunca se traducen.
- El idioma activo se persiste en `settings.json`; el primer arranque detecta `es`/`en` del
  sistema y cae a inglés en cualquier otro caso.
- Cambiar el idioma no requiere reiniciar y no altera documentos ni metadatos.

### RNF-11 · Local-first y funcionamiento sin red

- La app debe ser plenamente usable como editor Markdown sin conexión: abrir carpeta, leer,
  editar, guardar, renderizar, seleccionar y navegar.
- Ninguna funcionalidad del núcleo puede depender de un servicio en ejecución ni de una cuenta.
- La ausencia de red solo afecta al agente; el error se comunica con reintento y el documento
  permanece intacto.
- No hay backend de nrvn ni sincronización obligatoria.

### RNF-12 · Privacidad del perfil de voz y las guidelines

- Voz y guidelines son objetivo no implementado; cuando existan, no se escribirán en el `.md`.
- Solo se envían al proveedor de modelo cuando forman parte del contexto de una petición.
- El usuario puede ver y borrar ambos conjuntos de datos por completo desde ajustes.
- No se incluyen en logs: los logs registran rutas y longitudes, no contenido de estilo.

## 8. Modelo de bloques y contrato de agente

### 8.1 Modelo de bloques

Un documento se divide en bloques con un splitter propio, **fence-aware** (respeta bloques de
código delimitados por ``` o ~~~, incluidas fences anidadas por longitud de backticks).

Tipos de bloque: `heading`, `paragraph`, `list`, `table`, `code`, `quote`, `hr`, `html`.

**Clave estable (block key):** `ruta de headings + tipo + ordinal`.

```
ruta = "H1 texto" / "H2 texto" / ...      (headings ancestros, normalizados)
key  = `${ruta}#${tipo}:${ordinal}`        (ordinal = índice del bloque de ese tipo bajo esa ruta)
```

Ejemplo: `Guía de estilo / Escritura#paragraph:3`.

**Hash de contenido:** SHA-256 truncado a 12 hex del texto normalizado del bloque (trim de
espacios finales, saltos normalizados). Sirve para detectar edición manual y para marcar
comentarios como "bloque editado".

**Jerarquía de sección:** un bloque `heading` de nivel *n* abarca hasta el siguiente heading
de nivel ≤ *n*. Clic en heading selecciona esa sección completa (heading incluido).

**Rangos:** Shift extiende la selección a todos los bloques contiguos entre el ancla y el
destino, en orden del documento. Un rango nunca incluye huecos.

**Renombrado de heading:** si un heading cambia de texto, las claves de sus descendientes
cambian. Mitigación v1: al aceptar una propuesta que reescribe un heading, el sistema
recalcula claves y **remapea** versiones y comentarios por hash de contenido del bloque
anterior (ver R-3). Si el remapeo es ambiguo, se conserva el historial bajo la clave antigua y
se muestra al usuario que el bloque fue reestructurado.

### 8.2 Contrato de agente (formato de marcadores)

El agente `nrvn-editor` responde **solo** con bloques delimitados. No usa herramientas.

```
<<<NRVN_BLOCK>>>
id: Guía de estilo / Escritura#paragraph:3
op: replace
---
<nuevo contenido Markdown del bloque, sin fences exteriores>
<<<NRVN_END>>>
```

Reglas del contrato:

- Un mensaje puede contener uno o varios bloques.
- `op` ∈ {`replace`, `insert_after`, `delete`}. `delete` no lleva cuerpo.
- `id` debe ser una clave existente en el contexto enviado (o, para `insert_after`, la clave
  del bloque tras el que se inserta).
- Cualquier texto fuera de los marcadores se trata como comentario del agente y se muestra
  aparte; no se aplica.

**Parseo tolerante** (requisito, no opcional):

- Se ignoran líneas en blanco y espacios alrededor de los marcadores.
- Los nombres de campo son case-insensitive (`ID:`, `Op:` aceptados); espacios alrededor de
  `:` ignorados.
- Campos desconocidos se ignoran; campos obligatorios ausentes invalidan el bloque.
- Un bloque con `id` no resoluble se invalida **solo a él**; el resto del mensaje sigue siendo
  aplicable si es válido.
- Falta de marcador de cierre, marcador de apertura duplicado o cuerpo vacío donde se espera
  contenido → bloque inválido.
- Si **todos** los bloques son inválidos → estado de error: se muestra la respuesta cruda, sin
  diff, sin acciones de aplicar.

**Aplicación:**

- El reemplazo se aplica sobre el texto exacto del bloque, preservando indentación externa y
  saltos de línea del archivo.
- `insert_after` crea un bloque nuevo con clave derivada y ordinal siguiente.
- Toda aplicación genera versión de bloque y snapshot previo (RF-9, RNF-4).

### 8.3 Límites de contexto (DECIDIDO)

- **Regla dura: el agente trabaja solo sobre la selección.** El prompt contiene únicamente la
  selección activa (bloque, sección o rango contiguo), la ruta de headings, la ruta del
  archivo y la instrucción. Nunca el documento completo por defecto.
- Los ajustes globales se hacen seleccionando explícitamente **todo el documento** (acción
  `Seleccionar documento completo`); entonces la selección es el documento y el agente opera
  sobre él como una única unidad de trabajo.
- Sin selección no hay envío: el composer muestra "Selecciona un bloque para trabajar" y el
  botón Enviar permanece deshabilitado.
- El contrato de respuesta solo puede referenciar claves de la selección. Una clave ajena
  invalida la propuesta entera.
- Límite de contexto configurable; si la selección lo excede, el sistema avisa y exige
  dividirla en lugar de truncar en silencio.

---

## 9. Arquitectura y flujo de datos

### 9.1 Stack (DECIDIDO)

| Capa | Tecnología |
| --- | --- |
| Shell de escritorio | Electron 45 (MIT) |
| UI | React 19 + TypeScript (strict) |
| Build | Vite |
| Empaquetado | electron-builder → `.app` / `.dmg` macOS arm64 |
| Agente | `@opencode/sdk` 2.2.3 embebido en el proceso principal |
| Editor Markdown | CodeMirror 6 |
| Render | react-markdown + remark-gfm + Shiki |
| Estado | Zustand |
| Primitivas accesibles | Radix (headless) |
| Iconos | lucide |
| Diff | jsdiff |
| Tests | Vitest + Playwright |
| Lint/format | Biome |

### 9.2 Procesos

**Proceso principal (main):**

1. Ciclo de vida de la ventana y menú nativo (atajos, "Abrir carpeta…").
2. Diálogo nativo de selección de carpeta.
3. Recorrido y filtrado del árbol (`.md`, `.mdx`, exclusiones).
4. Lectura/escritura de archivos con escritura atómica y validación de rutas.
5. Host de OpenCode embebido en memoria (sin servicio externo, sin terminal).
6. Persistencia de metadatos en `~/Library/Application Support/nrvn/`.
7. Logs locales.

**Preload:**

- `contextBridge` que expone un objeto `window.nrvn` con métodos tipados uno a uno sobre
  canales IPC enumerados (`nrvn:fs:*`, `nrvn:agent:*`, `nrvn:meta:*`, `nrvn:app:*`).
- Sin acceso a `ipcRenderer` desde el renderer; sin `require`.

**Renderer:**

- React + Zustand. Estado dividido en: `workspace` (raíz, árbol, archivo activo),
  `document` (texto, bloques, hash, dirty, selección), `agent` (hilo, stream, modelos),
  `meta` (versiones, comentarios), `ui` (paneles, overlays, toasts).
- El splitter de bloques corre en el renderer tras cada cambio de texto (debounced), no en
  cada token del stream.

### 9.3 Flujo de datos de una propuesta

```
Usuario selecciona bloque(s) / sección / documento completo
  → renderer construye contexto SOLO con la selección (archivo, ruta, texto, hash)
  → IPC nrvn:agent:send  (prompt + selección + id de sesión)
  → main: host OpenCode (sesión del documento, agente nrvn-editor)
  → stream de tokens  →  IPC events  →  renderer pinta
  → fin de stream: parser tolerante en renderer
      ├─ válido → estado "propuesta" con diff por bloque
      └─ inválido → estado "error" con texto crudo
  → Aceptar → IPC nrvn:fs:apply-block (snapshot + escritura atómica)
            → nueva versión de bloque → re-split → re-hash
  → Rechazar → sin cambios en disco
  → Pedir cambios → nuevo turno con contexto + propuesta rechazada
```

### 9.4 Persistencia (DECIDIDO)

```
~/Library/Application Support/nrvn/
  settings.json
  workspaces/
    <hash de la ruta raíz>/
      threads.json
      annotations.json   # historial, comentarios y críticas
      pending.json

<ruta del documento>.md.nrvn   # bundle portable junto al .md
```

Reglas:

- El sidecar contiene ruta/hash/savedAt del documento, threads, pending, history, comments, critiques, languages y provenance.
- Se escribe al guardar y se lee al abrir; escritura atómica mediante temporal + rename.
- Si se corrompe, se aparta como `.corrupt-<ts>`; el contenido `.md` no se toca.
- Application Support almacena caché/estado de workspace; el `.md` nunca recibe metadatos ni front-matter.

#### Objetivo no implementado

`versions/`, `voice.json`, `guidelines.jsonl`, `rules/` y `focus.json` son objetivos, no persistencia actual.

### 9.5 Sesiones de agente

- Una sesión de OpenCode por documento, creada de forma perezosa en el primer envío.
- Persistida entre reinicios (el hilo se rehidrata y se reutiliza la sesión si el host la
  reconoce; si no, se crea una nueva y se le reinyecta el resumen del hilo).
- Modelo seleccionable por el usuario y persistido por workspace; el agente `nrvn-editor` es
  fijo y no editable en v1.
- MCP del usuario desactivados en esa instancia (DECIDIDO).

### 9.6 Aislamiento y errores

- Si el host OpenCode falla al arrancar, la app sigue usable como editor Markdown; el panel de
  agente muestra error con reintento (AC-13).
- Si el SDK cambia su API de streaming, el adaptador en `main` aísla el impacto (ver R-1).
- El renderer nunca interpreta respuestas del agente como instrucciones ejecutables.

---

## 10. UX y sistema de diseño

> **v3 «Moon Silver / Pearl Grey» (implementado).** Esta sección describe el sistema de diseño
> aplicado al producto. v0.1.2 arrancó con v2 «Silver Lean» y la migración a v3 ya está aplicada:
> hoja blanca, Lato, paleta Mist/Moon Silver y números de línea en Markdown. La paleta
> *warm*/terracota queda **retirada**: no se usa en ningún componente ni se conserva como tema
> alternativo. El detalle completo está en [`docs/design-system.es.md`](docs/design-system.es.md).

### 10.1 Layout

**Titlebar.** Franja superior `titlebar` de 44 px a todo el ancho, declarada
`-webkit-app-region: drag` (con las zonas interactivas excluidas del arrastre). La ventana usa
`titleBarStyle: "hiddenInset"` y `trafficLightPosition {x:16, y:15}`, de modo que los semáforos
de macOS caen dentro de la franja. A la izquierda, tras los semáforos, el nombre `nrvn`; a la
derecha, el estado de guardado (`Guardado`, `Guardando…`, `Sin guardar`, `Error al guardar`;
`Borrador` cuando el documento no tiene ruta).

**Shell de tres paneles** debajo de la titlebar:

| Panel | Contenido | Ancho por defecto | Colapso |
| --- | --- | --- | --- |
| Rail | Acciones globales (iconos con tooltip) | 56 px | No colapsa |
| Izquierda | Árbol de carpeta (solo `.md`/`.mdx`), outline del documento | 248 px | Botón / asa |
| Centro | Documento con toggle Render ↔ Markdown | flexible, prosa máximo 720 px | No colapsa |
| Derecha | Panel de agente (shell): contexto de selección + composer | 380 px | Botón |

- Responsive: ≥ 1024 px los tres paneles; 900–1023 px árbol colapsado por defecto; < 900 px
  aviso claro de tamaño insuficiente (con opción de continuar en layout reducido).
- El overlay de versiones y el de comentarios se abren sobre el bloque, no como modal global.

### 10.2 Tipografía y tokens

**Tipografía.** **Lato** (OFL, empaquetada) para toda la UI y la prosa: clara, humanista y
sencilla, al estilo Slack. Pesos 400/700 e itálica 400. UI 12/13/14 px; prosa 16,5 px con altura
de línea 1,7; headings a peso 600; monoespaciada del sistema para código. Medida de línea 62–72
caracteres, sin tracking agresivo en prosa. Se **retira Newsreader** (serif); Inter se mantiene
solo como fallback del sistema si Lato no carga.

**Paleta (tokens `--color-*`).** Light y dark son conjuntos completos, no una inversión
automática. Sin gradientes ni glassmorphism.

| Token | Light | Dark |
| --- | --- | --- |
| `--color-bg` | `#F4F5F5` | `#191B1D` |
| `--color-surface` | `#FCFCFC` | `#202326` |
| `--color-elevated` | `#FFFFFF` | `#262A2D` |
| `--color-sunken` | `#ECEEEF` | `#151719` |
| `--color-ink` | `#202326` | `#ECEEF0` |
| `--color-ink-secondary` | `#485056` | `#C3C9CE` |
| `--color-muted` | `#70757A` | `#A0A7AE` |
| `--color-line` | `#E1E4E6` | `#30353A` |
| `--color-line-strong` | `#848B92` | `#6F7880` |
| `--color-accent` | `#6C8AA3` | `#A9C0D2` |
| `--color-accent-hover` | `#5B7C99` | `#C7D8E4` |
| `--color-accent-soft` | `#E6EDF2` | `rgba(169,192,210,.14)` |
| `--color-accent-text` | `#46647B` | `#C7D8E4` |
| `--color-selection-bg` | `#E6EDF2` | `#24313C` |
| `--color-selection-bar` | `#5B7C99` | `#A9C0D2` |
| `--color-pastel-blue` | `#E6EDF2` | — |
| `--color-pastel-sage` | `#E6EEE9` | — |
| `--color-pastel-lavender` | `#ECEAF2` | — |
| `--color-pastel-butter` | `#F4EFE1` | — |
| `--color-pastel-pearl` | `#F3F4F2` | — |
| `--color-danger` | `#A34A3C` | `#E08A7A` |
| `--color-success` | `#3F7358` | `#86B79A` |
| `--color-warning` | `#8A6A2F` | `#D6B26A` |

- **Acento y contraste.** `--color-accent` se usa en barras, fondos y anillo de foco; para
  texto pequeño y enlaces que deben cumplir AA se usa `--color-accent-text`
  (light `#46647B` / dark `#C7D8E4`), porque `--color-accent` no llega a 4,5:1 sobre `bg`.
- **Superficies.** Mist `#F4F5F5` es el fondo; Moon Silver `#ECEEEF` es la superficie hundida;
  Pearl `#F3F4F2` se usa como pastel neutro.
- **Radios:** 5 / 8 / 12 px (`--radius-sm|md|lg`).
- **Sombras:** `0 1px 2px rgba(16,24,40,.04)` (card) y `0 12px 32px rgba(16,24,40,.12)`
  (overlay).
- **Motion:** `--motion-fast: 120ms`, `--motion-base: 180ms`, easing estándar;
  `prefers-reduced-motion` desactiva transiciones no esenciales.
- **Foco:** anillo de 2 px en `--color-accent` con offset 2 px.
- **Espaciado:** escala base 4 px (`--space-1…12`).
- Sin colores hardcodeados en componentes; todo pasa por token.

### 10.3 Estados

| Superficie | Vacío | Carga | Error |
| --- | --- | --- | --- |
| Arranque | Documento nuevo sin título, vacío y en Render; no se reabre workspace ni árbol | — | — |
| Árbol | "Abre una carpeta para empezar" + Cmd+O | Skeleton de filas | "No se pudo leer la carpeta" + reintentar |
| Documento | Título vacío en Render con placeholder editorial "Empieza a escribir…" y CTA "Editar en Markdown" | Skeleton de prosa | "No se pudo abrir el archivo" + reintentar / abrir otro |
| Titlebar | `Borrador` si no hay ruta | `Guardando…` | `Error al guardar` |
| Panel de agente | "Selecciona un bloque o usa el documento completo" | Streaming con cursor y Cancelar | Contrato roto, host caído, sin modelo: mensaje + acción |

- Al arrancar **siempre** se abre un documento nuevo vacío: no se restaura el workspace anterior
  ni el árbol. "Reabrir reciente" solo está disponible desde el menú.
- Cmd+S sobre un documento sin título abre "Guardar como…" (IPC `saveDocumentAs`); guardar como
  adopta la carpeta elegida como raíz del workspace.

### 10.4 Selección

- Bloque seleccionado: banda pastel `--color-selection-bg` + barra interior de 2 px
  `--color-selection-bar`. La barra usa `padding-inline: 14px`, de modo que nunca pisa el texto.
- Sección seleccionada: mismo realce abarcando toda la sección, con el heading incluido.
- Rango: realce continuo sin huecos, con etiqueta "3 bloques".
- En modo Markdown: `cm-block-selected` pinta la misma banda + barra (no solo líneas de 1 px);
  la selección nativa usa `--color-selection-text` para contrastar con la banda.
- El foco de teclado conserva su anillo: seleccionar con el ratón no lo dibuja, navegar con
  flechas sí.
- Esc limpia; clic fuera del documento limpia (excepto si hay overlay abierto).

### 10.5 Atajos

Menú nativo (Electron) e in-app comparten los mismos comandos.

| Atajo | Acción | Prioridad Esc |
| --- | --- | --- |
| Cmd+N | Nuevo documento | — |
| Cmd+O | Abrir carpeta… | — |
| ⇧Cmd+O | Reabrir reciente | — |
| Cmd+S | Guardar ahora (sin título → Guardar como…) | — |
| ⇧Cmd+S | Guardar como… | — |
| Cmd+W | Cerrar documento | — |
| Cmd+E | Toggle Render ↔ Markdown (preserva posición aproximada) | — |
| ⇧Cmd+A | Seleccionar documento completo | — |
| ⇧Cmd+C | Copiar Markdown | — |
| Cmd+Enter | Enviar al agente desde el composer | — |
| Esc | Cerrar overlay → limpiar selección → cancelar generación | 1, 2, 3 |

### 10.6 Accesibilidad en interacción

- **Menús.** Nativos: `nrvn` (appMenu), Archivo, Editar, Ver, Ventana, Ayuda. In-app con Radix
  DropdownMenu (`@radix-ui/react-dropdown-menu` 2.2.1): Workspace, Archivo, Documento, Agente.
  Context menu Radix (`@radix-ui/react-context-menu` 2.4.1) en el árbol con Abrir, Revelar en
  Finder y Copiar ruta. Ítems de 32 px, iconos lucide de 15 px, atajos alineados y
  `aria-keyshortcuts` en cada ítem accionable.
- **Árbol** con `role="tree"`, `treeitem`, `aria-expanded`, navegación con flechas, Enter para
  abrir; en Render y en Markdown, `aria-current` marca el heading visible del outline.
- **Bloques** seleccionables con `tabindex` gestionado (roving) y Enter/Espacio para
  seleccionar; Shift+Enter extiende.
- **Streaming** con `aria-live="polite"`; al terminar, el foco no se mueve.
- **Guardado** anunciado con `role="status"`; errores con `aria-live="assertive"`.
- **Diálogos** con Radix, foco atrapado y restaurado.
- Contraste AA (4,5:1 texto, 3:1 UI): ver §RNF-5. La auditoría formal AA sigue pendiente; los
  tokens de texto y `--color-accent-text` están elegidos para cumplirla.

### 10.7 Componentes y patrones

| Componente | Especificación |
| --- | --- |
| **Titlebar** | 44 px a todo el ancho, arrastrable, semáforos macOS (`hiddenInset`, `trafficLightPosition {x:16,y:15}`), nombre `nrvn` y estado de guardado. |
| **Rail** | 56 px, iconos lucide de 15–16 px con tooltip y estado activo en accent-soft. |
| **Árbol** | 248 px; filas de 28 px, hover en sunken, selección en accent-soft, indentación de 16 px por nivel. |
| **Documento** | Prosa centrada con máximo 720 px; fondo surface; sin bordes duros. |
| **Agente** | 380 px; cabecera con modelo y estado, hilo scrolleable, composer fijo. |
| **Menús** | Nativos (Electron) e in-app con Radix: Workspace, Archivo, Documento, Agente; ítems de 32 px, atajos alineados, `aria-keyshortcuts`. |
| **Context menu** | Radix en el árbol: Abrir, Revelar en Finder, Copiar ruta. |
| **Segmented** | Render / Markdown en la cabecera del documento; control de dos posiciones, 28 px de alto. |
| **Botones** | Primario (accent sólido, texto blanco), secundario (borde line-strong, fondo surface), ghost (sin borde, hover sunken). Altura 28/32 px, radio 8. |
| **Inputs** | Fondo surface, borde line, foco con anillo de 2 px accent + offset 2; placeholder en muted. |
| **Badges de comentario** | Círculo de 18 px en el margen del bloque; accent-soft con texto accent-text; contador si hay hilo. |
| **Barra de selección** | Banda pastel `selection-bg` + barra interior de 2 px `selection-bar`; `padding-inline: 14px`. |
| **Estados** | Vacío con copy breve y CTA; carga con skeleton; error con mensaje accionable y reintento. |
| **Dark mode** | Conjunto completo de tokens, no inversión automática; mismo contraste AA. |
| **Atajos** | Ver §10.5; el texto de menús y tooltips se traduce con el idioma activo. |

**i18n de la UI.** Todo el copy de estos componentes se mantiene en catálogos `es`/`en` (RNF-10).
El selector de idioma vive en ajustes y en el menú; cambiarlo reconstruye el menú nativo sin
reiniciar (RF-22).

**Referencias visuales.** Los conceptos están en `docs/assets/design/`; las capturas reales de v0.9.0 están en `docs/assets/screenshots/v090/`.

---

## 11. Roadmap por fases

### v0.1.x — Histórico

Outcome: un editor Markdown local usable, con workspace, render, selección y menús, listo para
recibir la capa de agente.

| # | Iniciativa | Outcome | Estado |
| --- | --- | --- | --- |
| I-1 | Shell Electron + bridge tipado | App abre sin terminal en macOS arm64 | Hecho |
| I-2 | Árbol, lectura y escritura atómica con autosave | Editar sin miedo a perder datos | Hecho |
| I-3 | Splitter fence-aware + selección bloque/sección/rango | El usuario apunta exactamente a lo que quiere cambiar | Hecho |
| I-4 | Render GFM + toggle con CodeMirror | Leer y editar sin fricción | Hecho |
| I-5 | Menús nativos e in-app, titlebar, icono | Superficie de escritorio completa | Hecho |
| I-6 | Sistema de diseño v2 + modo mock | Base visual y de desarrollo | Hecho |
| I-7 | Migración a diseño v3 «Moon Silver / Pearl Grey» + Lato | Objetivo visual de producto | Hecho (ciclo histórico) |

### v0.2 — Histórico

Outcome: el usuario pide cambios a un bloque, ve propuestas, las acepta y conserva su voz.

| # | Iniciativa | Outcome esperado | Talla |
| --- | --- | --- | --- |
| I-8 | Host OpenCode embebido + agente `nrvn-editor` sin tools + streaming | El agente propone sin poder tocar nada | L |
| I-9 | Contrato de marcadores, parser tolerante, diff y decisión | Control total sobre el resultado | L |
| I-10 | Versiones por bloque + comentarios anclados | Continuidad y trazabilidad local | M |
| I-11 | Perfil de voz básico por espacio/documento (RF-16) | Estilo persistente separado del contenido | M |
| I-12 | Sesiones de foco (RF-17) | Iteración acotada por área con historial | M |
| I-13 | i18n ES/EN + selector persistido (RF-21, RF-22) | UI y menú nativo en dos idiomas | M |

Hito de salida: AC-6…AC-11, AC-13, AC-16, AC-17, AC-21 y AC-22 en verde.

### v0.3 — Histórico; alcance no entregado completo

Outcome: el usuario convierte correcciones repetidas en reglas y las aplica al documento sin
perder el control.

| # | Iniciativa | Outcome esperado | Talla |
| --- | --- | --- | --- |
| I-14 | Bandeja de guidelines (RF-18) | Capturar estilo sin interrumpir la escritura | M |
| I-15 | Resumen en bloque de reglas (RF-19) | Reglas reutilizables y versionadas | M |
| I-16 | Refactor de bloques no editados (RF-20) | Consistencia con propuestas, no automática | L |
| I-17 | Versionado de documento | Historial global y comparación | M |
| I-18 | Export y git acotado | Publicar y revisar sin salir de la app | M |

Hito de salida: AC-18, AC-19 y AC-20 en verde.

### v1.0.6 — 2026-11-04

Alcance cerrado: edición Render/Markdown, selección, agente y propuestas, operaciones de Render,
variante desde revisión, anotaciones/críticas, copias por idioma y metadatos `.nrvn`. Fuera de alcance: firma y
notarización Apple, Windows/Linux, auto-update, i18n completa de UI, auditoría AA formal y sync.

El empaquetado `npm run build`/`npm run dist` incrementa patch automáticamente; `NRVN_SKIP_VERSION_BUMP=1` lo evita.

### v1.0 — Plataforma posterior

- Windows/Linux empaquetados y verificados.
- Firma y notarización Apple; canal de actualización.
- i18n completa (revisión de copy) y accesibilidad auditada.
- Sync opcional opt-in; sin nube obligatoria ni multiusuario.

---

## 12. Riesgos y mitigaciones

| ID | Riesgo | Prob. | Impacto | Mitigación |
| --- | --- | --- | --- | --- |
| R-1 | **SDK de OpenCode joven**: cambios de API entre 2.x, comportamiento de streaming inestable. | Alta | Alto | Versión pinneada exacta (2.2.3); adaptador aislado en `main`; contrato interno propio (`send`/`stream`/`cancel`) que no expone tipos del SDK al renderer; plan de actualización con tests de integración del adaptador. |
| R-2 | **Contrato de streaming**: el modelo no respeta los marcadores o los mezcla con prosa. | Media | Alto | Parser tolerante; prompt con ejemplo few-shot y contrato explícito; estado de error sin auto-apply; métrica M-3 con umbral ≤ 5 %; "Pedir cambios" con reintento guiado. |
| R-3 | **Anclaje de bloques**: claves inestables al renombrar headings o reordenar. | Media | Alto | Hash de contenido para detección; remapeo por hash al aceptar cambios de heading; conservación del historial bajo clave antigua si el remapeo es ambiguo; tests de splitter y de renombrado. |
| R-4 | **Pérdida de datos** por autosave, aceptación o corrupción de metadatos. | Baja | Crítico | Escritura atómica; snapshot pre-aplicación; un archivo de metadatos por documento; recuperación con `.corrupt-*`; tests de fallo simulado. |
| R-5 | **Gatekeeper**: app sin firma bloqueada o con aviso alarmante. | Alta | Medio | Documentar el bypass en README; build `--dir` para desarrollo; firma en v1.0; no prometer instalación sin fricción. |
| R-6 | **Coste de créditos** durante desarrollo y pruebas. | Media | Medio | Modo mock completo por defecto en tests y Playwright; fixtures; límites de longitud de contexto; ninguna prueba automatizada llama a un proveedor real. |
| R-7 | **Licencias**: dependencia transitiva copyleft. | Baja | Alto | Lista permitida en CI; auditoría de `package-lock.json`; fuentes OFL con su licencia empaquetada. |
| R-8 | **Rendimiento del splitter** en documentos grandes. | Media | Medio | Medición con 200 KB; debounce; opción de worker si supera el umbral de RNF-1. |
| R-9 | **Alcance creep** (git, PDF, sync antes de tiempo). | Media | Medio | Fuera de alcance explícito en sección 5.3; cambios solo vía Changelog con aprobación. |
| R-10 | **Dependencia de credenciales del usuario** para demo/QA. | Media | Bajo | Modo mock + fixtures como camino por defecto de QA; documentar requisito de proveedor para uso real. |

---

## 13. Dependencias y licencias

### 13.1 Runtime (main)

| Dependencia | Versión | Licencia | Uso |
| --- | --- | --- | --- |
| electron | 45.x | MIT | Shell de escritorio |
| @opencode/sdk | 2.2.3 (pinneada) | MIT | Host de agente embebido |

### 13.2 Renderer

| Dependencia | Licencia | Uso |
| --- | --- | --- |
| react / react-dom | MIT | UI |
| zustand | MIT | Estado |
| @codemirror/* (v6) | MIT | Edición Markdown |
| react-markdown | MIT | Render |
| remark-gfm | MIT | GFM |
| shiki | MIT | Resaltado de código |
| @radix-ui/react-dropdown-menu 2.2.1 | MIT | Menús in-app |
| @radix-ui/react-context-menu 2.4.1 | MIT | Menú contextual del árbol |
| lucide-react | ISC | Iconos |
| diff (jsdiff) | BSD-3-Clause | Diff de propuestas |

### 13.3 Desarrollo

| Dependencia | Licencia | Uso |
| --- | --- | --- |
| typescript | Apache-2.0 | Tipos |
| vite | MIT | Build |
| electron-builder | MIT | Empaquetado |
| vitest | MIT | Tests unitarios |
| @playwright/test | Apache-2.0 | E2E |
| @biomejs/biome | MIT | Lint/format |

### 13.4 Fuentes

| Fuente | Licencia | Uso |
| --- | --- | --- |
| Lato | OFL-1.1 | UI y prosa (objetivo v3) |
| Inter | OFL-1.1 | Fallback de sistema hasta la migración a Lato |

### 13.5 Reglas de licencia

- Lista permitida: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, OFL-1.1, CC0.
- Cualquier otra licencia requiere revisión explícita y justificación escrita.
- El producto se distribuye bajo la licencia MIT (ver `LICENSE`, titular: rainbrth).
- Las licencias de fuentes y dependencias se incluyen en el paquete distribuido.

---

## 14. Preguntas abiertas

| # | Pregunta | Impacto | Dueño sugerido | Bloquea v1 |
| --- | --- | --- | --- | --- |
| Q-1 | ¿El hilo persistido debe reenviarse completo al host al reiniciar, o basta un resumen? | Coste de tokens y fidelidad del contexto. | Ingeniería (main) | No (decisión por defecto: resumen + últimos N turnos) |
| Q-2 | ¿Qué modelo de referencia se usa para M-1? | Comparabilidad de la métrica. | Producto | No |
| Q-3 | ¿Los cambios manuales crean versión en cada autosave o solo al cerrar el bloque (blur/cambio de archivo)? | Ruido en el historial. | Producto + Ingeniería | No (propuesta: versión por debounce de 5 s o al cambiar de bloque) |
| Q-4 | ¿Cmd+\ para colapsar paneles o solo botones? | Consistencia de atajos. | Diseño | No |
| Q-5 | ¿Cómo se comunica al usuario el primer arranque sin firma? | Fricción de instalación. | Producto | No |
| Q-6 | ¿Límite exacto de contexto por defecto (tokens/caracteres)? | Coste y calidad. | Ingeniería | No |
| Q-7 | ¿El remapeo de bloques al renombrar heading puede ser automático o requiere confirmación? | Confianza del usuario. | Producto | No (propuesta: automático con aviso) |
| Q-8 | ¿Cómo se define operativamente "bloque no editado a mano" para el refactor de consistencia? | Precisión de RF-20 y de M-10. | Producto + Ingeniería | No (propuesta: hash igual a la última versión del agente o restaurada) |
| Q-9 | ¿Qué formato tiene el perfil de voz: JSON estructurado, Markdown editable o formulario? | Portabilidad y facilidad de edición. | Producto + Diseño | No (propuesta: formulario con vista previa del prompt) |
| Q-10 | ¿Con qué modelo se resume el bloque de reglas y cómo se controla el coste? | Coste, calidad y latencia de RF-19. | Ingeniería | No |
| Q-11 | ¿Cuántas guidelines debe haber antes de consolidar y se puede forzar antes? | Ruido frente a utilidad de la bandeja. | Producto | No (propuesta: umbral 8, consolidación manual siempre disponible) |
| Q-12 | ¿La migración v2 → v3 es un reemplazo directo o conviven ambos temas durante un release? | Riesgo visual y de QA. | Diseño | No (propuesta: reemplazo directo, sin tema alternativo) |

---

## 15. Changelog

### v1.0.6 — 2026-11-04

- Alineación documental con el release actual y la persistencia real mediante sidecar portable `<doc>.md.nrvn`.
- El build/dist incrementa automáticamente el patch; `NRVN_SKIP_VERSION_BUMP=1` omite ese incremento.

### v1.0.0 — 2026-11-01 (release candidate)

- Estado y §11 actualizados para distinguir alcance cerrado de las limitaciones de plataforma.

### v0.1.0 — 2026-10-30

- Creación del BRD con el alcance completo de v1.
- Definidos 15 requisitos funcionales (RF-1…RF-15) mapeados 1:1 a 15 criterios de
  aceptación literales (AC-1…AC-15).
- Definidos 9 requisitos no funcionales (RNF-1…RNF-9).
- Documentados el modelo de bloques (clave estable, hash, secciones, rangos) y el contrato de
  agente con marcadores `<<<NRVN_BLOCK>>>` y parseo tolerante.
- Documentadas las decisiones de arquitectura: Electron 45, React 19, TypeScript, Vite,
  `@opencode/sdk` 2.2.3 embebido, agente `nrvn-editor` sin tools, persistencia en
  `Application Support/nrvn`, layout de tres paneles, estética editorial con Inter/Newsreader.
- Establecidos roadmap por fases (v0.1, v0.2, v0.3), riesgos, dependencias y preguntas
  abiertas.
- Estado: v0.1.0 en desarrollo; ningún criterio de aceptación verificado todavía.

### v0.1.1 — 2026-10-30 (decisión de alcance)

- **Regla de aislamiento reforzada:** el agente trabaja exclusivamente sobre la selección
  activa. El documento completo no se envía por defecto; los ajustes globales requieren la
  acción explícita `Seleccionar documento completo`. Una propuesta con claves fuera de la
  selección se invalida por completo (RF-7, RF-8, §8.3).
- El envío queda deshabilitado sin selección.

### v0.1.2 — 2026-10-30

Sistema de diseño v2 «Silver Lean», menús, arranque e icono. Alcance: Loop B1 (documentación y
UI; la integración de agente sigue pendiente en Loop B2).

- **Sistema de diseño v2 «Silver Lean»:** paleta fría (bg/surface/elevated/sunken, ink y
  líneas en gris azulado, acento `#5B7C99` / `#9DB8CC`), acentos pastel, semánticos y
  `--color-accent-text` para texto pequeño con AA. Retirada la paleta warm/terracota.
  Radios 5/8/12, sombras card/overlay, motion 120/180 ms, foco 2 px accent + offset 2, sin
  gradientes ni glassmorphism. Tipografía Inter (UI), Newsreader (prosa) y mono del sistema.
- **Layout:** titlebar de 44 px a todo el ancho con arrastre, semáforos macOS
  (`hiddenInset`, `trafficLightPosition {x:16,y:15}`), nombre `nrvn` y estado de guardado;
  debajo, rail 56 px + árbol + documento + agente 380 px. Responsive ≥1024 / 900–1023 /
  <900 conservado.
- **Menús:** menú nativo completo (`nrvn`, Archivo, Editar, Ver, Ventana, Ayuda) con Nuevo,
  Abrir carpeta…, Reabrir reciente, Guardar, Guardar como…, Copiar ruta, Revelar en Finder,
  Cerrar documento, Seleccionar documento completo, Copiar Markdown, toggle, zoom, devtools y
  fullscreen. Menús in-app con Radix DropdownMenu (Workspace, Archivo, Documento, Agente) y
  context menu Radix en el árbol (Abrir, Revelar en Finder, Copiar ruta).
- **Arranque:** documento nuevo vacío sin título en Render con placeholder "Empieza a
  escribir…" y CTA "Editar en Markdown"; no se reabre workspace ni árbol. `Borrador` en la
  titlebar. Cmd+S sin título abre "Guardar como…"; "Reabrir reciente" solo desde el menú.
- **Selección:** barra con `padding-inline: 14px`, banda pastel + barra interior de 2 px; en
  Markdown `cm-block-selected` con banda + barra y `--color-selection-text`; foco de teclado
  conserva anillo.
- **Icono:** `build/icon.icns` y `build/icon.png` integrados en electron-builder (`mac.icon`)
  y en el Dock en desarrollo; `README.md` como `extraResources` para la Ayuda.
- **Bugs corregidos:** doble diálogo al abrir carpeta desde el menú nativo; comandos
  `copy-path`/`reveal-path`; `#heading:0` fuera de la vista principal; nombre de archivo
  duplicado; tooltip en los iconos del rail.
- **Tests:** 67 tests unitarios (12 archivos), 1 test de rendimiento aislado en
  `tests/perf/` (`npm run test:perf`) y 2 flujos E2E (`editor.spec.ts`, `loop-b1.spec.ts`) con
  capturas 1400×900 en `docs/assets/screenshots/v090/`. `npm run dist` se ejecuta al cierre
  del loop.
- **Pendiente:** integración OpenCode, agente `nrvn-editor`, streaming, diff, versiones y
  comentarios (Loop B2).

### v0.1.3 — 2026-10-30 (evolución documental)

Bloque de documentación: visión de producto, diseño v3, i18n y alcance por fases. **No cambia
el código**: v0.1.2 sigue siendo el estado real.

- **Visión y principios:** iteración aislada, voz persistente, sesiones de foco, bandeja de
  guidelines, refactor de consistencia, versionado por bloque, comentarios anclados y
  local-first (§1.1, §1.2).
- **Usuarios:** añadidos PM/escritor que redacta con IA, editor técnico y revisor; nuevos casos
  de uso CU-7…CU-10 (§3).
- **Métricas:** añadidas M-8 (tiempo para iterar un bloque), M-9 (propuestas sin retoque), M-10
  (reducción de reescrituras completas), M-11 (consistencia de voz) y M-12 (retención de
  guidelines). M-6 pasa a 22 criterios (§4).
- **Alcance:** reestructurado en v0.1.x / v0.2 / v0.3 / v1.0; añadidos procesador de textos
  completo, generación de imágenes y chat generalista como fuera de alcance (§5).
- **Requisitos nuevos:** RF-16 perfil de voz, RF-17 sesión de foco, RF-18 bandeja de guidelines,
  RF-19 resumen en bloque de reglas, RF-20 refactor de bloques no editados, RF-21 i18n ES/EN y
  RF-22 selector de idioma; con AC-16…AC-22 y matriz actualizada (§6).
- **No funcionales nuevos:** RNF-10 i18n, RNF-11 local-first sin red y RNF-12 privacidad del
  perfil de voz y las guidelines (§7).
- **Diseño v3 «Moon Silver / Pearl Grey»:** paleta Mist/Moon Silver, tipografía Lato (se retira
  Newsreader), radios, sombras, motion, foco y componentes. Marcado como objetivo inmediato; el
  código sigue en v2 (§10, `docs/design-system.es.md`).
- **Persistencia:** añadidos `voice.json`, `guidelines.jsonl`, `rules/` y `focus.json` (§9.4).
- **Roadmap:** alineado con v0.1.x / v0.2 / v0.3 / v1.0 (§11); firma, Windows/Linux y sync
  opcional se mueven a v1.0.
- **Documentación bilingüe:** `README.md` / `README.es.md` y `BRD.md` / `BRD.en.md` con enlaces
  cruzados; nuevos `docs/design-system.md` / `docs/design-system.es.md`. Autor: rainbrth.
- **Preguntas abiertas:** Q-8…Q-12 (definición de "no editado a mano", formato del perfil de
  voz, modelo de resumen, umbral de guidelines, migración v2 → v3).
- **Estado:** v0.1.2 real; la capa de agente (OpenCode, propuestas, versiones, comentarios)
  sigue pendiente en Loop B2. i18n y v3 son trabajo planificado, no implementado.

### v0.1.4 — 2026-10-31 (visión, honestidad y estado B3)

Actualización documental y de posicionamiento. No cambia código ni amplía el alcance aprobado:
ordena la visión de autoría y corrige el estado real.

- **Visión de autoría:** nueva §1.1 ampliada y §1.3 «Estado real y honestidad». nrvn se define como
  herramienta para **revisar sin rendirse**, no para producir dumps; incluye memoria de área,
  bloqueo de edición humana, coherencia global, contexto conceptual, generación multi-fuente y
  procedencia exportable como dirección, no como estado.
- **Advertencia explícita:** herramienta personal, MIT y construida al 100 % con IA; la IA acelera
  pero puede erosionar confianza y autoría; no elimina sesgos ni garantiza calidad.
- **Artículo de producto:** nuevos `docs/editor-agentico.md` y `docs/editor-agentico.en.md` con
  enlaces cruzados y sección «Honestidad y límites».
- **Roadmap:** nuevo bloque «Editor Agentico — escritura y revisión con agentes» con IDs `EA-*`,
  prioridades P1–P3, dependencias y señales de aceptación; decisiones aplazadas D-7…D-10 y hito
  v0.4.
- **Estado histórico corregido:** en aquella revisión estaban implementados o en validación el editor, la selección, la hoja
  blanca con Lato, los números de línea en Markdown, el post-it, los conectores OpenCode
  local/embebido, el OAuth de OpenCode Console y las propuestas. Siguen sin implementarse
  guidelines, banco de reglas, refactor de consistencia, versionado de documento, contexto
  conceptual y generación multi-fuente.
- **README bilingüe:** estado, visión y enlaces a `docs/editor-agentico.*` y `ROADMAP.*`; se retira
  la descripción del panel de agente como «shell».
