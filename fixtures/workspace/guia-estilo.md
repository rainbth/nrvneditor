# Guía de estilo

Esta guía reúne las decisiones de escritura del proyecto **nrvn**. Está pensada para que
cualquier persona que edite documentación encuentre rápido el criterio acordado, sin tener
que reconstruirlo a partir de ejemplos dispersos.

La pauta general es simple: escribir en presente, en segunda persona y con frases cortas.
Cuando dudes, prioriza la claridad sobre la elegancia. La documentación se lee mientras se
trabaja, no en una sobremesa.

## Principios

Nuestros principios se apoyan en tres ideas: *precisión*, **consistencia** y respeto por el
tiempo de quien lee. Una frase imprecisa obliga a releer; una inconsistencia obliga a
comparar; y ambas cosas consumen el recurso más escaso del proyecto.

- Escribe para alguien que acaba de llegar.
- Prefiere ejemplos verificables antes que adjetivos.
- Mantén un único término para cada concepto.
- Evita las abreviaturas que solo entiende el equipo.

1. Abre el documento que vas a editar.
2. Identifica la sección afectada.
3. Propón el cambio más pequeño que resuelva el problema.
4. Revisa el resultado en modo Render.

## Escritura

La escritura técnica no es una variante decorativa de la prosa literaria: es una herramienta
de trabajo. Cada párrafo debería poder recortarse sin que el resto pierda sentido. Si un
párrafo depende de otro para entenderse, probablemente sean el mismo párrafo.

Escribimos en voz activa siempre que sea posible. «El sistema guarda el archivo» es mejor que
«el archivo es guardado por el sistema». La voz activa dice quién hace qué y evita ambigüedades
cuando hay varios componentes implicados.

Los ejemplos deben poder copiarse y ejecutarse. Si un ejemplo no funciona, es un error de la
documentación, no del lector. Cuando el ejemplo dependa del entorno, dilo antes de mostrarlo.

Evita los adverbios de relleno. «Rápidamente» casi nunca aporta: si algo es rápido, el lector
lo notará; si no lo es, el adverbio no lo arregla.

### Tono

El tono es cercano pero no informal. Tratamos al lector de tú, sin exclamaciones y sin
humor forzado. La cercanía se demuestra explicando el porqué de una decisión, no añadiendo
signos de exclamación.

### Longitud

- Párrafos de tres a cinco frases.
- Secciones de entre diez y veinte líneas.
- Títulos de menos de sesenta caracteres.

> La documentación no se escribe para demostrar lo que sabemos,
> se escribe para que otra persona pueda hacer su trabajo.
> Si el lector necesita preguntarnos, la documentación falló.

## Formato

| Elemento | Uso recomendado | Ejemplo |
| --- | --- | --- |
| Negrita | Conceptos clave | **bloque** |
| Cursiva | Énfasis suave | *opcional* |
| Código en línea | Identificadores | `splitBlocks` |

Antes de publicar, comprueba estas tareas:

- [x] Revisar la ortografía
- [x] Verificar que los enlaces responden
- [ ] Leer el documento en voz alta
- [ ] Confirmar que el ejemplo se ejecuta

Puedes consultar la [documentación externa](https://example.com) o volver a la sección de
[escritura](#escritura) de esta misma guía.

## Código

Los bloques de código llevan siempre un lenguaje declarado. Si no lo lleva, el resaltado
degrada y el lector pierde una pista sobre el contexto.

```ts
export interface Block {
  key: string;
  type: BlockType;
  startLine: number;
  endLine: number;
}

export function isHeading(block: Block): boolean {
  return block.type === "heading";
}
```

Los comandos se documentan completos, con su ruta de trabajo y sin prefijos innecesarios.

```bash
cd ~/work/nrvn
npm run test:unit
npm run typecheck
```

---

## Referencias

Para profundizar, revisa las siguientes fuentes:

- [Markdown Guide](https://example.com/markdown)
- [GitHub Flavored Markdown](https://example.com/gfm)
- [Guía de estilo de Google](https://example.com/style)

La consistencia importa más que la preferencia personal. Si una regla de esta guía choca con
una costumbre local, gana la guía; si la guía no dice nada, decide y anótalo en las notas de
decisiones.
