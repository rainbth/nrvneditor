# Roadmap — nrvn

[English](ROADMAP.en.md) | [Español](ROADMAP.md)

**Estado:** v1.0.6. Las operaciones Render implementadas, «variante desde revisión», comentarios/críticas y copias por idioma están disponibles; las variantes libres V-01…V-07 y el resto de pendientes siguen fuera.
**Fecha:** 2026-11-04 · **Autor:** rainbrth · **Licencia:** MIT (open source)

Este documento es la vista priorizada del producto. El alcance y los requisitos viven en
[`BRD.md`](BRD.md) ([English](BRD.en.md)); la visión de escritura y revisión con agentes, en
[`docs/editor-agentico.md`](docs/editor-agentico.md) ([English](docs/editor-agentico.en.md)); el
sistema de diseño, en [`docs/design-system.es.md`](docs/design-system.es.md)
([English](docs/design-system.md)). Aquí no se redefine el alcance: se ordena y se mide.

## Cómo se usa este documento

1. Cada fila es un ítem accionable con un ID estable (`P0-03`). Los IDs no se renumeran.
2. El orden de las secciones es el orden de prioridad: P0 primero. Dentro de una sección, se
   ejecuta de arriba abajo salvo que una dependencia indique lo contrario.
3. `Estado` solo cambia cuando la señal de aceptación de la fila se cumple y queda registrada.
4. Un ítem nuevo entra con prioridad explícita y dueño. Si no tiene señal medible, no entra.
5. Las decisiones que bloquean varias filas se resuelven en la sección **Decisiones aplazadas**,
   no en conversaciones sueltas.

**Leyenda de prioridades**

| Prioridad | Significado | Criterio de entrada |
| --- | --- | --- |
| **P0 — Core** | Sin esto no hay producto. | El flujo seleccionar → pedir → aceptar no funciona sin la pieza. |
| **P1 — Esencial** | Producto usable a diario. | Su ausencia fuerza al usuario a salir de la app o a repetir trabajo. |
| **P2 — Alto valor** | Multiplica el valor del núcleo. | Convierte correcciones repetidas en activos reutilizables. |
| **P3 — Crecimiento** | Amplía superficies de uso. | Aumenta adopción sin cambiar el modelo de producto. |
| **P4 — Plataforma** | Distribución y extensibilidad. | Requiere infraestructura de release o de terceros. |
| **P5 — Nice to have** | Opcional, sin promesa de fecha. | No condiciona la propuesta de valor. |

**Leyenda de estados**

| Estado | Significado |
| --- | --- |
| `hecho` | Verificado con la señal de aceptación cumplida en el estado actual. |
| `parcial` | Implementado en parte; huecos concretos documentados en la fila. |
| `en curso` | Trabajo activo en el bloque B4; no se anuncia como disponible. |
| `siguiente` | Próximo en la cola, sin trabajo iniciado. |
| `más tarde` | Aprobado en el alcance, sin fecha asignada. |
| `explorar` | Idea validada por el usuario, sin decisión de producto. |

---

## P0 — Core

Sin estas piezas no existe el producto: un editor local que abre Markdown, deja seleccionar una
unidad de trabajo y acepta o rechaza propuestas de un agente que no puede tocar nada.

| ID | Feature | Outcome / valor | Depende de | Estado | Señal de aceptación |
| --- | --- | --- | --- | --- | --- |
| P0-01 | Editor Markdown con hoja blanca y render GFM | Leer y editar con estética editorial, sin vista de código permanente | — | `hecho` | Fixture con headings, listas, tablas, task lists, código y citas se renderiza sin errores; toggle Render ↔ Markdown conserva la posición aproximada. |
| P0-02 | Apertura de workspace MD | Trabajar sobre la carpeta real del usuario, sin importar archivos | — | `hecho` | Diálogo nativo abre carpeta; el árbol muestra solo `.md`/`.mdx`, incluye subcarpetas y excluye `node_modules`, `.git` y `dist`. |
| P0-03 | Persistencia en disco con autosave y escritura atómica | Nunca perder contenido por un fallo de guardado | P0-01, P0-02 | `hecho` | Autosave a los 800 ms; matar el proceso durante la escritura deja el archivo original íntegro. |
| P0-04 | Selección por bloque y por sección | Apuntar exactamente a lo que se quiere cambiar | P0-01 | `hecho` | Clic en párrafo selecciona un bloque; clic en heading selecciona la sección hasta el siguiente heading de nivel ≤; Esc limpia. |
| P0-05 | Selección multilínea expandida a bloques completos | Que un arrastre o Shift nunca produzca una selección parcial | P0-04 | `hecho` | Seleccionar tres párrafos contiguos devuelve exactamente tres claves completas, sin fragmentos; cubierto por test e2e. |
| P0-06 | Hoja blanca, tipografía Lato y paleta pastel de selección | Objetivo visual v3 aplicado al documento real | P0-01 | `hecho` | Documento y paneles usan tokens v3 y Lato; la banda de selección usa `selection-bg`/`selection-bar`; sin restos de v2 ni de la paleta warm. |
| P0-07 | Laterales reabribles | Recuperar espacio de lectura sin perder acceso a árbol y agente | P0-01 | `hecho` | Los paneles laterales se pueden colapsar y reabrir. |
| P0-08 | Conector OpenCode embebido | El agente funciona dentro de la app, sin terminal ni servicio externo | P0-01 | `hecho` | La app arranca el host, lista los modelos reales de la configuración del usuario y muestra error con reintento si la detección falla. |
| P0-09 | Conector con servicio OpenCode local | Reutilizar una instancia de OpenCode ya en ejecución | P0-08 | `hecho` | El conector local y el host embebido están disponibles. |
| P0-10 | Conector con API compatible (OpenAI-compatible) | Usar proveedores alternativos sin depender del SDK de OpenCode | P0-08, P0-14 | `explorar` | Un endpoint compatible configurado en ajustes produce streaming y propuestas válidas con el mismo contrato de marcadores. |
| P0-11 | Agente `nrvn-editor` sin tools | El agente propone texto y no puede ejecutar nada | P0-08 | `hecho` | Agente configurado sin herramientas. |
| P0-12 | Streaming con cancelación | Ver la respuesta mientras se genera y poder pararla | P0-11 | `hecho` | Los tokens se pintan con coalescing por frame; Cancelar deja el mensaje parcial marcado como cancelado y el documento intacto. |
| P0-13 | Propuestas con diff y Aceptar / Rechazar / Pedir cambios | Control total sobre el resultado del agente | P0-12 | `hecho` | Propuestas revisables mediante diff y decisión explícita. |
| P0-14 | Contexto limitado a la selección | El agente no ve ni toca lo que el usuario no seleccionó | P0-04, P0-11 | `hecho` | El prompt contiene archivo, ruta de headings, bloques seleccionados e instrucción; una clave fuera de la selección invalida la propuesta completa. |
| P0-15 | Versionado por bloque | Volver atrás sin perder historia | P0-13 | `siguiente` | Tres propuestas aceptadas generan tres versiones navegables; restaurar crea una cuarta; el historial sobrevive a reinicios. |
| P0-16 | Persistencia local de metadatos | Hilos, comentarios y anotaciones con sidecar portable y caché local | P0-15 | `hecho` | El sidecar portable `<doc>.md.nrvn` junto al `.md` conserva estado, con caché en `Application Support`; los metadatos no modifican el `.md`. |
| P0-17 | Modo mock sin créditos | Desarrollar y probar el flujo completo sin red | P0-13 | `hecho` | `npm run mock` reproduce selección, streaming, propuesta y aceptación sin credenciales; Playwright corre sobre ese build. |
| P0-18 | Recuperación ante fallo del agente | La app sigue siendo un editor usable si el host falla | P0-08 | `siguiente` | Host caído muestra error accionable con reintento; abrir, editar y guardar siguen funcionando. |

---

## P1 — Esencial

Lo que convierte el núcleo en una herramienta de escritura diaria: revisar, mantener la voz,
concentrarse y trabajar en dos idiomas.

| ID | Feature | Outcome / valor | Depende de | Estado | Señal de aceptación |
| --- | --- | --- | --- | --- | --- |
| P1-01 | Comentarios anclados a bloques | Revisar por elemento con hilo y resolución, sin editar el texto | P0-16 | `hecho` | Comentario creado, respondido, resuelto y borrado persiste tras reiniciar; si el hash del bloque cambia, se marca "bloque editado". |
| P1-02 | Perfil de voz y tono por workspace/documento | Estilo persistente separado del contenido | P0-14 | `siguiente` | El prompt muestra el perfil en una sección de estilo distinta del contenido; desactivarlo para una petición no lo borra. |
| P1-03 | Sesiones de foco por área | Iterar un bloque o sección con historial agrupado | P1-02 | `siguiente` | Foco nombrado sobre una sección agrupa su historial; cambiar de documento lo pausa; cerrarlo no borra contenido ni historia. |
| P1-04 | Historial de conversación por documento | Retomar el trabajo donde se dejó | P0-16 | `hecho` | Abrir el documento A muestra su hilo; el de B no aparece; el hilo persiste tras reiniciar la app. |
| P1-05 | Selector de fuente de render | Ajustar la lectura sin tocar el sistema de diseño | P0-06 | `hecho` | Selector de tipografía de lectura disponible. |
| P1-06 | Números de línea en modo Markdown | Ubicar referencias y errores con precisión | P0-01 | `hecho` | Modo Markdown muestra numeración alineada; el render no la muestra; el número corresponde a la línea real del archivo. |
| P1-07 | Atajos de teclado del documento | Operar sin ratón las acciones de archivo y vista | P0-02, P0-03 | `hecho` | Cmd+O, Cmd+E, Cmd+S y Esc funcionan en el orden de prioridad definido (overlay → selección → generación). |
| P1-08 | Outline del documento | Navegar secciones largas sin scroll | P0-04 | `hecho` | Outline de headings con navegación disponible. |
| P1-09 | Accesibilidad AA | Uso completo por teclado y con lector de pantalla | P0-06, P1-07 | `siguiente` | axe-core sin violaciones críticas en árbol, documento y panel; recorrido completo por teclado; foco visible en light y dark. |
| P1-10 | i18n ES/EN de la UI y menú nativo | Producto en el idioma del usuario | P1-09 | `más tarde` | Cero cadenas hardcodeadas; fechas y números con `Intl`; cambiar idioma no altera el documento. |
| P1-11 | Selector de idioma persistido | Preferencia estable sin reiniciar | P1-10 | `más tarde` | La elección se guarda en `settings.json`, se aplica en caliente y reconstruye el menú nativo. |
| P1-12 | Envío con Cmd+Enter | Enviar al agente sin soltar el teclado | P0-13 | `hecho` | Cmd+Enter envía con contexto válido (selección o documento explícito); sin contexto el composer lo explica y no se envía nada. |

---

## P2 — Alto valor

Convierte correcciones repetidas en activos del workspace y da profundidad al historial.

| ID | Feature | Outcome / valor | Depende de | Estado | Señal de aceptación |
| --- | --- | --- | --- | --- | --- |
| P2-01 | Bandeja de guidelines | Capturar una instrucción de estilo en el momento | P1-02 | `más tarde` | Capturar, editar, descartar y reordenar persiste tras reiniciar; se sugieren duplicados; nada se aplica solo. |
| P2-02 | Consolidación en bloque de reglas | Convertir guidelines dispersas en reglas reutilizables | P2-01 | `más tarde` | Al alcanzar el umbral, "Consolidar" muestra diff del bloque de reglas; aceptarlo lo versiona y marca las guidelines incluidas. |
| P2-03 | Refactor de consistencia de bloques no editados | Aplicar reglas al documento sin pisar trabajo manual | P2-02, P0-15 | `más tarde` | Documento con 5 bloques y 1 editado a mano genera 4 propuestas y 1 omisión; aceptar 2 cambia solo esos 2 en disco. |
| P2-04 | Versionado de documento | Historial global y punto de retorno por documento | P0-15 | `más tarde` | Cada guardado relevante crea una entrada de documento; restaurar crea una versión nueva y no borra las anteriores. |
| P2-05 | Comparar versiones | Ver qué cambió entre dos puntos | P2-04 | `más tarde` | Vista lado a lado o diff unificado entre dos versiones de bloque o documento, sin escribir en disco. |
| P2-06 | Búsqueda global del workspace | Encontrar texto en todos los documentos | P0-02 | `más tarde` | Búsqueda devuelve archivo, bloque y coincidencia; abrir un resultado selecciona el bloque correspondiente. |
| P2-07 | Plantillas de documento | Empezar con estructura y voz ya definidas | P2-02 | `más tarde` | Crear documento desde plantilla aplica estructura y perfil de voz; la plantilla no contamina el `.md` con metadatos. |
| P2-08 | Command palette | Ejecutar cualquier acción sin recordar atajos | P1-07 | `más tarde` | Toda acción de menú es invocable por nombre; el listado se filtra por texto y respeta el idioma activo. |

---

## P3 — Crecimiento

Amplía salidas y superficies de trabajo sin cambiar el modelo de producto.

| ID | Feature | Outcome / valor | Depende de | Estado | Señal de aceptación |
| --- | --- | --- | --- | --- | --- |
| P3-01 | Export PDF / HTML / MDX | Publicar o compartir el documento | P0-01 | `más tarde` | Export genera un archivo legible con el mismo contenido renderizado; el `.md` original no se modifica. |
| P3-02 | Integración git (diff y commit) | Revisar y registrar cambios en el repo del usuario | P2-04 | `más tarde` | Diff de trabajo visible por documento; commit solo con confirmación explícita y sin tocar archivos ajenos. |
| P3-03 | Pestañas y multi-ventana | Trabajar varios documentos a la vez | P1-04 | `más tarde` | Abrir un segundo documento no pierde selección ni hilo del primero; cada ventana mantiene su estado. |
| P3-04 | Pegar imágenes | Insertar capturas sin salir del editor | P0-03 | `más tarde` | Pegar una imagen crea el archivo en la carpeta elegida e inserta el enlace Markdown; deshacer revierte ambos. |
| P3-05 | Tablas editables | Editar tablas sin pelear con el Markdown | P0-01 | `más tarde` | Añadir fila o columna actualiza el bloque y genera versión; el render y el Markdown quedan sincronizados. |
| P3-06 | Enlaces internos entre documentos | Conectar notas del workspace | P2-06 | `más tarde` | Un enlace a otro `.md` abre el documento y selecciona el heading destino; enlaces rotos se marcan. |
| P3-07 | Estadísticas de documento | Ver volumen y progreso de escritura | P0-01 | `más tarde` | Panel con palabras, bloques y tiempo de sesión, calculado localmente y sin enviar datos. |

---

## P4 — Plataforma

Distribución, confianza y extensibilidad. Requieren infraestructura que hoy no existe.

| ID | Feature | Outcome / valor | Depende de | Estado | Señal de aceptación |
| --- | --- | --- | --- | --- | --- |
| P4-01 | Windows / Linux empaquetados | Ampliar la base de usuarios | P0-18 | `explorar` | Build instalable en cada plataforma abre, edita y guarda con el mismo checklist de AC que macOS. |
| P4-02 | Firma y notarización Apple | Instalación sin fricción de Gatekeeper | P4-01 | `explorar` | `.dmg` notarizado abre sin aviso manual en una máquina limpia. |
| P4-03 | Auto-update | Entregar correcciones sin reinstalar | P4-02 | `explorar` | Una versión publicada se detecta, descarga y aplica con confirmación del usuario. |
| P4-04 | Modo remoto / API compatible gestionada | Usar nrvn con un endpoint corporativo o alojado | P0-10 | `explorar` | Configuración de endpoint, credencial y modelo funciona sin cambios en el contrato de propuestas. |
| P4-05 | API de plugins | Permitir extensiones sin tocar el núcleo | P2-08 | `explorar` | Un plugin de ejemplo añade un comando a la palette y se puede desinstalar sin dejar estado. |
| P4-06 | Temas | Adaptar la interfaz al gusto del usuario | P0-06 | `explorar` | Un tema alternativo cambia tokens sin romper contraste AA ni el render del documento. |
| P4-07 | Backup y restauración | Recuperar workspace y metadatos | P0-16 | `explorar` | Exportar e importar un workspace restaura árbol, versiones e hilos sin duplicar archivos. |

---

## P5 — Nice to have

Opcional. Sin fecha ni promesa. No condiciona la propuesta de valor.

| ID | Feature | Outcome / valor | Depende de | Estado | Señal de aceptación |
| --- | --- | --- | --- | --- | --- |
| P5-01 | Sync opcional | Continuar en otra máquina | P4-07 | `explorar` | Sync opt-in, cifrado y desactivable; sin sync el producto funciona igual. |
| P5-02 | Colaboración en tiempo real | Revisar un documento entre varias personas | P5-01 | `explorar` | Dos clientes ven cambios y comentarios sin conflicto destructivo. |
| P5-03 | App móvil de lectura | Leer y comentar fuera del escritorio | P5-01 | `explorar` | La app móvil abre el workspace sincronizado en solo lectura con comentarios. |
| P5-04 | Dictado por voz | Redactar sin teclado | P0-03 | `explorar` | El dictado inserta texto en el bloque activo y se puede deshacer por partes. |
| P5-05 | Marketplace de temas | Descubrir y compartir temas | P4-06 | `explorar` | Instalar un tema desde el marketplace lo aplica y permite desinstalarlo. |
| P5-06 | Generación de imágenes (flujo externo) | Ilustrar un documento sin convertir el editor en generador | P3-04 | `explorar` | La imagen se genera en un flujo aparte y se inserta como enlace; la generación inline queda fuera de alcance. |
| P5-07 | Publicación a CMS | Publicar el documento donde vive el contenido | P3-01 | `explorar` | Publicar un documento crea o actualiza una entrada y devuelve su URL; el `.md` local no cambia. |

---

## Editor Agentico — escritura y revisión con agentes

Este bloque ordena la visión que describe [`docs/editor-agentico.md`](docs/editor-agentico.md)
([English](docs/editor-agentico.en.md)): usar la IA para escribir y revisar sin perder la autoría,
la memoria de las decisiones y la coherencia del documento. No sustituye a P0–P5: los
complementa. Los IDs `EA-*` son nuevos y no se renumeran; las prioridades usan la misma escala
P0–P5.

**Definición de hecho del bloque:** cada delta cabe en una iteración, se revisa como propuesta con
diff, preserva las decisiones humanas y tiene una señal de aceptación verificable. Ningún ítem de
este bloque aplica cambios solo ni simula autoría humana.

### P1 — Autoría y control

| ID | Feature | Outcome / valor | Depende de | Estado | Señal de aceptación |
| --- | --- | --- | --- | --- | --- |
| EA-P1-01 | Memoria de área — captura | Guardar por bloque/sección las decisiones humanas, las instrucciones y el "por qué está así" | P1-02, P0-16 | `más tarde` | En una sección se registran dos decisiones con su motivo; ambas persisten tras reiniciar y se listan en el panel del área. |
| EA-P1-02 | Memoria de área — uso en prompt y panel | Que el agente de esa área reciba y respete su memoria | EA-P1-01, P0-14 | `más tarde` | El snapshot del prompt de esa sección incluye las decisiones del área y no las de otras secciones; desactivarlas para una petición no las borra. |
| EA-P1-03 | Bloqueo de edición humana | Que una pasada global nunca pise un bloque marcado "no tocar" o "solo sugerencias" | P2-03, P0-15 | `más tarde` | Documento con 5 bloques, 2 marcados "no tocar": el refactor genera 3 propuestas y 2 omisiones; aceptar todo no modifica los 2 bloqueados. |
| EA-P1-04 | Sugerencias y preguntas por bloque | Explorar variaciones, mejoras, riesgos y preguntas sin reescribir | P0-14, P1-02 | `más tarde` | Sobre un bloque se muestran al menos 3 sugerencias tipadas (variación, mejora, pregunta); ninguna modifica el texto hasta que el usuario elige una. |
| EA-P1-05 | Coherencia global | Comprobar cómo encaja la sección en el documento y proponer deltas | P1-02, P0-15 | `más tarde` | En un documento con una contradicción y una promesa sin cumplir, el análisis señala ambas con su sección y propone un delta por hallazgo, no una reescritura. |
| EA-P1-06 | Criterio de cierre de foco | Cerrar un área con historial y un "hecho" explícito | P1-03 | `más tarde` | Un foco se cierra con un criterio escrito; su historial queda agrupado y reabrirlo recupera el criterio y las decisiones del área. |

### P2 — Contexto, fuentes y procedencia

| ID | Feature | Outcome / valor | Depende de | Estado | Señal de aceptación |
| --- | --- | --- | --- | --- | --- |
| EA-P2-01 | Contexto conceptual relacionado | Sugerir secciones relacionadas mientras se edita, explicando la relación | P0-15 | `más tarde` | Al editar una sección, el panel sugiere al menos 2 secciones relacionadas con una frase de relación; el índice se calcula localmente y se puede desactivar. |
| EA-P2-02 | Draft multi-fuente — ingesta y outline | Convertir 2–5 fuentes en un outline revisable antes de generar | P0-02, P0-16 | `más tarde` | Se importan 3 fuentes (MD, URL, texto), se extrae un outline editable y cada entrada conserva su fuente de origen. |
| EA-P2-03 | Draft multi-fuente — borrador con citas y procedencia | Generar un borrador por bloques con origen explícito | EA-P2-02, EA-P2-05 | `más tarde` | Cada bloque generado muestra su cita o fuente; aceptar el borrador marca los bloques como generados y conserva la trazabilidad. |
| EA-P2-04 | Reglas y guidelines por área | Aplicar reglas consolidadas al ámbito de un área sin pisar trabajo manual | P2-01, P2-02, P2-03, EA-P1-01 | `más tarde` | Una regla consolidada se aplica solo a los bloques elegibles del área; los bloques con memoria humana o marcados "no tocar" quedan fuera y se informa de cuántos. |
| EA-P2-05 | Procedencia y honestidad | Marcar generado, reescrito y aceptado, con metadatos de autoría IA | P0-15, P0-16 | `más tarde` | Cada bloque guarda su origen (`humano`, `agente`, `aceptado`) y el panel lo muestra; borrar metadatos no altera el `.md` ni simula autoría humana. |
| EA-P2-06 | Export con procedencia | Exportar sin perder quién escribió qué | P3-01, EA-P2-05 | `más tarde` | El export incluye la procedencia por bloque o un anexo equivalente; el `.md` original no se modifica. |

### P3 — Riesgo y trazabilidad

| ID | Feature | Outcome / valor | Depende de | Estado | Señal de aceptación |
| --- | --- | --- | --- | --- | --- |
| EA-P3-01 | Revisión de riesgos | Detectar afirmaciones sin fuente, datos inventados, compromisos y contradicciones | EA-P1-05, EA-P2-05 | `explorar` | Sobre un fixture con una cifra sin fuente, una promesa y una contradicción, el informe encuentra los 3 casos y no reescribe el documento. |
| EA-P3-02 | Trazabilidad afirmación → fuente o decisión | Rastrear cada afirmación hasta su origen | EA-P2-03, EA-P2-05 | `explorar` | Seleccionar una afirmación muestra su fuente o la decisión humana asociada; si no existe ninguna, se marca como "sin respaldo". |

### Fuera de alcance de este bloque

- **Reescritura automática del documento.** Todo cambio llega como propuesta con diff.
- **Simular autoría humana.** La procedencia IA se conserva y se puede exportar.
- **Garantizar calidad o eliminar sesgos.** El producto reduce fricción y hace visibles las
  decisiones; no promete un resultado correcto.
- **Chat generalista.** El agente sigue trabajando sobre el documento y su contexto, no como
  asistente abierto.

---


---

## B5 — Operativa de Render

Objetivo: que Render sea la superficie de trabajo del agente, no solo de lectura. Cada acción
respeta el modelo de bloques, se puede deshacer y nunca aplica una propuesta sin confirmación.

| ID | Prioridad | Feature | Outcome / valor | Depende de | Estado | Señal de aceptación |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | P0 | Barra de formato en Render | Formatear sin salir de la lectura | P0-04 | `hecho` | Formato por elemento disponible en Render. |
| R-02 | P0 | Insertar contenido | Crear estructura sin editar Markdown a mano | R-01 | `parcial` | Menú Insertar (párrafo, sección, bloque de agente, imagen, separador, tabla), `+` en hover y `Enter` al final insertan en la posición correcta y conservan los offsets. |
| R-03 | P1 | Párrafo nuevo pendiente | Dejar un hueco listo para describir al agente | R-02, R-05 | `hecho` | El bloque vacío muestra borde discontinuo y badge “Pendiente de editar”; queda seleccionado, el composer se enfoca y el chip dice “Editando párrafo nuevo”; escribir o aplicar limpia el estado. |
| R-04 | P1 | Imagen junto al documento | Insertar imágenes portables sin romper el Markdown | P0-03 | `siguiente` | El diálogo copia PNG/JPG/WebP/GIF/SVG saneado al directorio del documento con nombre único, sin sobrescribir y con límite de tamaño; se inserta `![alt](archivo)` y se renderiza con `nrvn-asset://`. |
| R-05 | P0 | Burbuja de propuesta anclada | Revisar el cambio donde ocurre, no en un panel lejano | P0-14 | `hecho` | La burbuja aparece encima o debajo del párrafo, muestra preview/diff, streaming con Detener y Aplicar/Rechazar/Pedir cambios; al aplicar queda “Aplicado · Deshacer”. |
| R-06 | P1 | Rail lateral de avisos | Ver estado del documento sin tapar el texto | R-05, V-04, C-01, ML-04 | `siguiente` | El rail de 56 px muestra propuesta, párrafo pendiente, comentario, crítica y traducción desactualizada; al clic expande tarjeta y en pantallas estrechas se colapsa a iconos. |
| R-07 | P1 | Acciones de bloque en hover | Descubrir operaciones sin menús escondidos | R-01 | `parcial` | El hover muestra insertar debajo, comentar, versiones, pedir al agente y criticar; teclado y foco accesibles; no roba la selección. |
| R-08 | P1 | Contexto compacto | Reducir ruido en el panel | P0-14 | `hecho` | El chip muestra solo “Editando párrafo: “20 caracteres…””, “Editando sección: “Principios””, “Editando N bloques…” o “Editando documento completo”; sin ruta, tipo, caracteres ni excerpt largo. |
| R-09 | P1 | Undo/redo en Render | Revertir cualquier operación de la página | R-01, R-02, R-05 | `hecho` | Formatear, insertar, aplicar y borrar se deshacen con Cmd+Z y se rehacen con Cmd+Shift+Z; la selección se conserva. |
| R-10 | P0 | Integridad de bloques e imágenes | Que una operación no corrompa offsets ni lea fuera del workspace | P0-04 | `parcial` | Tras cada cambio se re-splitea y rehashea; imágenes fuera del workspace o con magic bytes inválidos se rechazan con error accionable. |
| R-11 | P0 | Edición inline en Render | Escribir donde se lee, sin cambiar de vista | R-01 | `hecho` | Clic en párrafo/heading coloca el caret en el render; Enter divide el bloque, Backspace al inicio lo une, Shift+Enter crea salto suave; Esc sale sin guardar y Cmd+Enter confirma; el cambio crea versión y marca edición humana. |
| R-12 | P0 | Serialización y fallback | Markdown como fuente de verdad, sin romper sintaxis | R-11 | `hecho` | El bloque editado se serializa a Markdown y se re-renderiza; tablas, código, HTML y frontmatter muestran “Editar en Markdown”; la sintaxis no editada no se normaliza. |
| R-13 | P1 | Formato durante la edición inline | Aplicar marcas sin salir del caret | R-01, R-11 | `hecho` | Cmd+B/I/K y la toolbar aplican marcas sobre la selección; el resultado se ve al confirmar; undo/redo conserva la selección. |
| R-14 | P1 | Convivencia con agente y anotaciones | Editar sin que una propuesta pise el caret | R-05, R-11 | `hecho` | Con el caret activo la burbuja espera; al salir se reancla, se actualizan clave/hash y las anotaciones quedan como “bloque editado”. |
| R-15 | P1 | Zoom de página y fit to screen | Ajustar la lectura sin cambiar el zoom del sistema | R-11 | `siguiente` | Cmd+= / Cmd+- / Cmd+0 ajustan solo la página (50–200%), “Ajustar al ancho” ocupa el canvas con márgenes y la posición se conserva; burbujas y gutter se recalculan sin saltos. |
| R-16 | P1 | Ajustes de vista | Adaptar la hoja a lectura, escritura o revisión | R-15 | `siguiente` | Ancho de página (estrecho/cómodo/amplio), tamaño de fuente de render, altura de línea, modo lectura, modo enfoque y pantalla completa se aplican al instante y persisten por workspace. |
| R-17 | P1 | Operaciones básicas de bloque | Mover y reorganizar sin cortar y pegar Markdown | R-01 | `parcial` | Mover arriba/abajo, duplicar, borrar, copiar/cortar/pegar bloques funciona con teclado y crea una versión; nunca parte un bloque ni pierde offsets. |
| R-18 | P1 | Buscar y reemplazar en el documento | Encontrar y corregir sin salir del render | P0-01 | `siguiente` | Cmd+F abre búsqueda con resaltado, siguiente/anterior y contador; reemplazar respeta bloques y no toca código ni frontmatter salvo confirmación. |
| R-19 | P2 | Corrección ortográfica | Evitar erratas sin abandonar la escritura | R-11 | `siguiente` | El spellcheck se activa desde Ver, subraya solo texto editable, respeta idioma del documento y se puede desactivar por workspace. |
| R-20 | P2 | Barra de estado | Saber el volumen y el estado del documento | P0-03, P3-07 | `siguiente` | La barra muestra palabras, caracteres, bloques, tiempo de lectura y estado de guardado; se actualiza sin recalcular el render completo. |
| R-21 | P0 | Reanclaje de selección tras edición | Que el área de edición siga a los párrafos nuevos | R-05, R-11 | `hecho` | Si una edición convierte 1 párrafo en 3, al aplicar la selección pasa a cubrir los 3 bloques nuevos; el chip muestra “Editando 3 bloques” y el siguiente prompt incluye los 3. Si se borran todos, la selección se limpia; undo restaura la selección anterior. |
| R-22 | P1 | Revisores y audiencias personalizados | Que cada usuario defina su propio criterio | R-12 | `siguiente` | Se puede crear un revisor y una audiencia propios con nombre, rol y descripción libre (ejemplo precargado). Se guardan en local, aparecen en el selector y en el chip de audiencia, y se pueden editar o borrar sin afectar a los de serie. |
| R-23 | P1 | Extender y reducir narrativa | Alargar o condensar un párrafo sin perder la voz | R-11 | `hecho` | Dos acciones por bloque piden al agente una versión extendida (~1,6–2,2×) o condensada (~40–60 %) que conserva intención, tono, voz, significado y formato; el resultado llega como propuesta con diff y nunca se aplica solo. |
| R-24 | P2 | Zoom de página | Ajustar la lectura sin cambiar el zoom del sistema | R-11 | `hecho` | Controles y atajos (⌘= / ⌘- / ⌘0) ajustan la hoja entre 50 % y 200 % en pasos del 10 %, se persisten y recalculan burbujas, gutter y `+` sin descolocar. |

## B6 — Variantes e historial por bloque

Objetivo: explorar alternativas con criterio y conservar cada versión. Una variante aplicada es
una versión nueva, nunca un reemplazo silencioso.

La única variante implementada es «variante desde revisión» (C-05); los ejes V-01…V-07 siguen pendientes.

| ID | Prioridad | Feature | Outcome / valor | Depende de | Estado | Señal de aceptación |
| --- | --- | --- | --- | --- | --- | --- |
| V-01 | P0 | Ejes de variación | Variar una dimensión sin perder el contenido | R-05 | `más tarde` | Extensión, Detalle, Tono, Estructura, Ejemplos, Audiencia y Libre generan 3 variantes etiquetadas; Extensión conserva el contenido semántico y Detalle marca los claims nuevos. |
| V-02 | P0 | Ver variantes tras aplicar | Elegir una alternativa sin volver a empezar | V-01 | `más tarde` | Tras Aplicar, la burbuja ofrece Ver variantes, 3 tarjetas con etiqueta, criterio, preview y Aplicar esta; Comparar, Regenerar eje y Cambiar eje funcionan. |
| V-03 | P0 | Contrato de variantes | Parseo fiable y ámbito respetado | V-01 | `más tarde` | El parser valida `<<<NRVN_VARIANT axis label>>>`, exige 3 variantes distintas y rechaza claves fuera de la selección. |
| V-04 | P0 | Historial por bloque | Volver a cualquier versión y saber su origen | P0-15 | `más tarde` | Flechas ‹ › en el margen, overlay con fecha/origen (agente/manual/restaurada), Restaurar crea una versión nueva y todo persiste tras reiniciar. |
| V-05 | P1 | Bloqueo de edición humana | Proteger lo que el usuario ya decidió | V-04, EA-P1-03 | `más tarde` | Un bloque marcado “no tocar” o “solo sugerencias” queda excluido de refactors y actualizaciones; se informa del número de omisiones. |
| V-06 | P1 | Variantes de documento y traducción | Explorar alternativas globales o de idioma | V-01, ML-05 | `más tarde` | Documento completo y traducciones ofrecen literal/natural/formal con preview y aplicación versionada. |
| V-07 | P2 | Variantes persistentes y comparación | Recuperar y comparar propuestas anteriores | V-02, V-04 | `más tarde` | Las variantes quedan en el hilo y se comparan lado a lado; aplicar una conserva las demás en historial. |

## B7 — Comentarios y críticas

Objetivo: revisar sin reescribir. Comentarios y críticas son anotaciones; solo se convierten en
cambios cuando el usuario los manda al agente.

| ID | Prioridad | Feature | Outcome / valor | Depende de | Estado | Señal de aceptación |
| --- | --- | --- | --- | --- | --- | --- |
| C-01 | P0 | Comentarios anclados a bloque | Revisar por elementos con hilo y resolución | P0-15 | `hecho` | Badge, hilo, resolver/reabrir, borrar y “bloque editado” si cambia el hash; persisten entre reinicios. |
| C-02 | P1 | Críticas por bloque | Detectar problemas narrativos sin proponer texto | R-07 | `hecho` | “Criticar” abre burbuja anclada con dimensión, severidad, detalle y pregunta accionable; badge lavanda con número; máximo 5 críticas. |
| C-03 | P1 | Contrato de crítica | Salida estructurada y sin invenciones | C-02 | `hecho` | `<<<NRVN_CRITIQUE ...>>>` valida dimensión/severidad; claims sin respaldo se marcan; nunca modifica el documento. |
| C-04 | P1 | Volver a pedir y caducidad | Repetir el análisis cuando cambia el bloque | C-02 | `más tarde` | “Volver a pedir” regenera y conserva la tanda anterior; si cambia el hash, la crítica queda “desactualizada”. |
| C-05 | P0 | Crítica → instrucción | Convertir una crítica en edición controlada | C-02, P0-14 | `hecho` | Al elegir una crítica, el composer se rellena con una instrucción editable; el texto no cambia hasta Aplicar. |
| C-06 | P2 | Modo Crítico en el panel | Separar edición y revisión | C-02 | `más tarde` | El panel alterna Editar/Criticar, mantiene historiales separados y filtra por severidad. |

## B8 — Multilenguaje

Objetivo: mantener el original canónico y producir copias editables por idioma. Traducir no es
reescribir: no se añaden ideas y el original nunca se modifica.

| ID | Prioridad | Feature | Outcome / valor | Depende de | Estado | Señal de aceptación |
| --- | --- | --- | --- | --- | --- | --- |
| ML-01 | P0 | Conjunto de idiomas | Original + copias hermanas portables | P0-02, P0-16 | `hecho` | `documento.md` + `documento.en.md` + manifest en app data con sourceHash; los `.md` no llevan frontmatter ajeno. |
| ML-02 | P1 | Modo y flip | Cambiar de idioma sin perder el punto de lectura | ML-01 | `hecho` | Píldoras ES · EN · +, `Cmd+[`/`Cmd+]`, árbol agrupado con badge y conservación del ancla de bloque. |
| ML-03 | P1 | Primera copia automática | Crear el idioma nuevo con un clic | ML-01 | `hecho` | Al añadir idioma se genera y guarda el archivo nuevo sin sobrescribir; cancelable, deshacer y eliminar; actualizaciones existentes piden confirmación. |
| ML-04 | P1 | Sincronización por bloque | Actualizar solo lo que cambió y respetar lo humano | ML-03, V-05 | `hecho` | sourceHash por bloque, “Actualizar traducción” traduce solo bloques cambiados; bloques editados a mano quedan bloqueados y no se pisan. |
| ML-05 | P0 | Contrato de traducción | Traducción fiel, con ámbito y glosario | ML-03 | `más tarde` | `<<<NRVN_TRANSLATION lang block>>>` y `<<<NRVN_DOCUMENT_TRANSLATION lang>>>`; conserva tono, glosario y estructura; términos dudosos se marcan. |
| ML-06 | P2 | Variantes de traducción | Ajustar literalidad sin rehacer todo | V-06, ML-05 | `más tarde` | Literal/natural/formal generan 3 variantes por bloque y se aplican como versión; el rail avisa de traducción desactualizada. |
| ML-07 | P0 | Seguridad del original | Que traducir nunca dañe la fuente | ML-01 | `hecho` | Ninguna operación de traducción modifica el original ni sobrescribe una traducción existente sin confirmación. |

## Decisiones aplazadas

| ID | Decisión | Dueño | Criterio para cerrarla | Impacto si no se cierra |
| --- | --- | --- | --- | --- |
| D-1 | Alcance y momento del i18n de UI | Producto + Diseño | Se cierra cuando P1-09 esté verde y exista catálogo `es`/`en` sin cadenas hardcodeadas. | P1-10 y P1-11 quedan bloqueadas; el producto sigue solo en español. |
| D-2 | Formato del perfil de voz | Producto + Diseño | Se elige entre formulario con vista previa, Markdown editable o JSON al validar P1-02. | No se puede definir la UI de voz ni su persistencia. |
| D-3 | Umbral de guidelines para consolidar | Producto | Se fija con datos de uso de P2-01; propuesta inicial: 8 `nueva`, con consolidación manual siempre disponible. | P2-02 no tiene disparador claro. |
| D-4 | Definición operativa de "no editado a mano" | Producto + Ingeniería | Se cierra al implementar P2-03; propuesta: hash igual a la última versión de agente o restaurada. | El refactor de consistencia no es verificable. |
| D-5 | Modelo para resumir reglas | Ingeniería | Se elige al implementar P2-02, midiendo coste y calidad del diff. | La consolidación puede ser cara o imprecisa. |
| D-6 | Firma Apple | Producto + Release | Se cierra al planificar P4-02, con cuenta de desarrollador y proceso de notarización definidos. | No hay instalación sin fricción ni auto-update. |
| D-7 | Ámbito y formato de la memoria de área | Producto + Ingeniería | Se cierra al implementar EA-P1-01: decidir si vive por bloque, por sección o en ambos, y si es texto libre o campos. | EA-P1-02 y EA-P2-04 no tienen contrato estable. |
| D-8 | Método del contexto conceptual | Ingeniería | Se elige al implementar EA-P2-01 entre embeddings locales y similitud léxica, midiendo coste, privacidad y calidad. | La señal de aceptación no es comparable entre métodos. |
| D-9 | Formato de citas y procedencia en el export | Producto + Diseño | Se cierra con EA-P2-06: decidir entre notas por bloque, anexo de fuentes o ambas. | La exportación puede perder trazabilidad. |
| D-10 | Criterio operativo de "foco cerrado" | Producto | Se define al implementar EA-P1-06; propuesta: criterio escrito por el usuario + última decisión registrada. | EA-P1-06 no es verificable. |
| D-11 | Ejes de variantes por defecto | Producto | Se fija al implementar V-01; propuesta inicial: Extensión y Detalle primero, después Tono, Estructura, Ejemplos y Audiencia. | La burbuja de variantes no tiene orden ni copy estable. |
| D-12 | Formato y persistencia de críticas | Producto + Ingeniería | Se cierra al implementar C-02/C-03: structured items vs prosa, y si se conservan todas las tandas o solo la vigente. | El rail y el historial no tienen contrato. |
| D-13 | Criterio de bloqueo de edición humana | Producto + Ingeniería | Se cierra al implementar V-05: por marca explícita, por hash manual o ambos. | El refactor y las traducciones no saben qué bloques proteger. |
| D-14 | Ubicación y formato del manifest de idiomas | Ingeniería | Se cierra al implementar ML-01: app data vs sidecar; ruta, versión y migración. | Las traducciones no se pueden emparejar de forma fiable. |
| D-15 | Cómo medir un "claim nuevo" | Producto + Ingeniería | Se define al implementar V-01/ML-05: diff semántico, marcado del agente o revisión humana. | Las variantes de detalle y las traducciones no se pueden validar. |
| D-16 | Fallback de bloques complejos en edición inline | Producto + Ingeniería | Se cierra al implementar R-12: qué bloques se editan inline (párrafo, heading, ítem de lista) y cuáles abren Markdown (tabla, código, HTML, frontmatter). | La edición inline podría romper sintaxis no representable. |
| D-17 | Momento de commit y undo en edición inline | Producto + Ingeniería | Se cierra al implementar R-11/R-13: blur, Esc, Cmd+Enter, y undo nativo vs pila de la app. | El caret y el historial pueden desincronizarse. |
| D-18 | Semántica del zoom de página | Producto + Ingeniería | Se cierra al implementar R-15: zoom CSS de la hoja vs zoom de la app; impacto en caret, burbujas y gutter. | El zoom puede romper hit-testing o descuadrar overlays. |
| D-19 | Alcance de buscar y reemplazar | Producto | Se cierra al implementar R-18: solo texto visible, bloques completos, regex y reemplazo global. | Reemplazar podría tocar código/frontmatter o dejar bloques inconsistentes. |
| D-20 | Política de reanclaje de selección | Producto + Ingeniería | Se cierra al implementar R-21: crecer al insertar, colapsar al borrar, conservar al reemplazar y restaurar con undo. | El área de edición puede quedar obsoleta y el siguiente prompt apuntar a bloques equivocados. |

## No haremos

Fuera de la visión. No entran en el roadmap aunque un usuario los pida.

- **Procesador de textos completo.** nrvn itera bloques Markdown; no compite con Word o Docs.
- **Chat generalista.** El agente trabaja sobre el documento y el contexto que el usuario elige,
  no como asistente abierto.
- **Generación de imágenes dentro del editor.** Se admite un flujo externo (P5-06); nunca un
  generador inline que escriba en el documento.
- **WYSIWYG inline.** El modelo de bloques más CodeMirror cubre la necesidad con menos riesgo.

## Hitos sugeridos

### v0.2 — Capa de agente y voz

- Conector OpenCode embebido, agente `nrvn-editor` sin tools y streaming con cancelación.
- Propuestas con diff, Aceptar / Rechazar / Pedir cambios y versionado por bloque.
- Comentarios anclados y perfil de voz básico.
- Acabado v3: hoja blanca, Lato, números de línea, selector de fuente y laterales reabribles.
- Salida: P0 completo y P1-01…P1-08 en verde.

### v0.3 — Render y variantes

- Implementados R-01, R-02 parcial, R-03, R-05, R-07 parcial, R-08, R-09, R-10 parcial, R-11, R-12, R-13, R-14, R-17 parcial y R-21.
- Pendientes R-04, R-06, R-15, R-16, R-18, R-19 y R-20; V-01…V-07 pendientes y solo existe «variante desde revisión».

### v0.4 — Revisión y multilenguaje

- Implementados C-01, C-02, C-03, C-05 y ML-01…ML-04 + ML-07.
- Pendientes C-04, C-06, ML-05 y ML-06.

### v0.5 — Consistencia y Editor Agentico

- Bandeja de guidelines y consolidación en bloque de reglas con diff.
- Refactor de consistencia sobre bloques no editados, siempre como propuesta.
- Versionado de documento, i18n ES/EN y comparación de versiones.
- Memoria de área, coherencia global, contexto conceptual y borrador multi-fuente con citas.
- Procedencia por bloque y export que la preserve.
- Salida: P2-01…P2-04 y EA-P1-01…EA-P1-06, EA-P2-01…EA-P2-06 en verde.

### v1.0.6 — 2026-11-04

- Cerrados para esta release: editor Render/Markdown, selección, OpenCode y propuestas, operaciones de Render, variante desde revisión, anotaciones/críticas y copias por idioma.
- Pendientes fuera de esta release: firma/notarización Apple, Windows/Linux, auto-update, i18n completa de UI, auditoría AA formal, sync y variantes libres V-01…V-07.

### v1.1 — Plataforma (posterior)

- Export PDF/HTML/MDX e integración git acotada.
- Windows/Linux empaquetados, firma y notarización Apple.
- Auto-update y backup/restore.
- Accesibilidad auditada y copy revisado en ambos idiomas.
- Salida: checklist de AC del BRD completo en macOS arm64.
