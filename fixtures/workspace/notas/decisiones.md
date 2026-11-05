# Decisiones

Registro breve de las decisiones tomadas durante el desarrollo. Cada entrada explica el
contexto, la alternativa descartada y la consecuencia esperada.

## Bloques

Un documento se divide en bloques atómicos. La clave de un bloque combina la ruta de
headings, el tipo y un ordinal. Esta decisión permite referirse a un fragmento sin depender
de sus números de línea, que cambian con cualquier edición.

> Las claves estables son la base del historial, los comentarios y las propuestas del
> agente. Si la clave cambia sin control, todo lo que cuelga de ella se pierde.

## Selección

La selección vive fuera de los componentes de render. Así el panel de agente, el editor y
el resaltado leen el mismo estado sin duplicar lógica.

- Un clic selecciona un bloque.
- Un clic en un heading selecciona la sección.
- Shift+clic extiende el rango.
- Esc limpia la selección.

## Pendientes

- [x] Definir el contrato de marcadores.
- [ ] Integrar el host de OpenCode.
- [ ] Diseñar el diff por bloque.

La prioridad es no bloquear el trabajo manual mientras el agente no está conectado. Todo lo
que se pueda hacer sin red debe funcionar sin red.

## Contexto

El prompt del agente nunca incluye el documento completo: solo la ruta, la selección y la
instrucción. Esta restricción se revisa en cada propuesta y se prueba de forma negativa.
