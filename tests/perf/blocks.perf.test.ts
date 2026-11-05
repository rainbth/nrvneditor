import { describe, expect, it } from "vitest";
import { splitBlocks } from "../../src/lib/blocks";

describe("splitBlocks (rendimiento)", () => {
  it("procesa ~200 KB en menos de 50 ms (mediana de 5)", () => {
    const chunk =
      "# Heading\n\nUn párrafo con texto suficiente para simular prosa real.\n\n- item uno\n- item dos\n\n";
    const markdown = chunk.repeat(Math.ceil((200 * 1024) / chunk.length));
    expect(markdown.length).toBeGreaterThan(200 * 1024 - 200);

    const samples: number[] = [];
    let blocks: ReturnType<typeof splitBlocks> = [];
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const start = performance.now();
      blocks = splitBlocks(markdown);
      samples.push(performance.now() - start);
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted[Math.floor(sorted.length / 2)];
    const diagnostics = {
      min: Number(min.toFixed(2)),
      median: Number(median.toFixed(2)),
      max: Number(max.toFixed(2)),
    };
    console.log(`[nrvn] split 200KB ms=${JSON.stringify(diagnostics)}`);

    expect(blocks.length).toBeGreaterThan(1000);
    expect.soft(median, `mediana de 5 muestras ${JSON.stringify(diagnostics)}`).toBeLessThan(50);
  });
});
