/**
 * SHA-256 síncrono en TypeScript puro.
 *
 * `crypto.subtle` es asíncrono y el splitter de bloques es síncrono, así que
 * implementamos el algoritmo completo aquí (sin dependencias externas).
 * Vectores estándar verificados en `tests/unit/hash.test.ts`.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_HASH = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function padMessage(bytes: Uint8Array): Uint8Array {
  const bitLength = bytes.length * 8;
  // 1 byte 0x80 + ceros + 8 bytes de longitud, hasta múltiplo de 64.
  const padding = (56 - ((bytes.length + 1) % 64) + 64) % 64;
  const total = bytes.length + 1 + padding + 8;
  const buffer = new Uint8Array(total);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;
  const view = new DataView(buffer.buffer);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  view.setUint32(total - 8, high, false);
  view.setUint32(total - 4, low, false);
  return buffer;
}

function compress(state: Uint32Array, block: Uint8Array, offset: number, w: Uint32Array): void {
  const view = new DataView(block.buffer, block.byteOffset + offset, 64);
  for (let t = 0; t < 16; t += 1) {
    w[t] = view.getUint32(t * 4, false);
  }
  for (let t = 16; t < 64; t += 1) {
    const w15 = w[t - 15];
    const w2 = w[t - 2];
    const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
    const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
    w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
  }

  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];
  let f = state[5];
  let g = state[6];
  let h = state[7];

  for (let t = 0; t < 64; t += 1) {
    const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
    const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const temp2 = (S0 + maj) >>> 0;

    h = g;
    g = f;
    f = e;
    e = (d + temp1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temp1 + temp2) >>> 0;
  }

  state[0] = (state[0] + a) >>> 0;
  state[1] = (state[1] + b) >>> 0;
  state[2] = (state[2] + c) >>> 0;
  state[3] = (state[3] + d) >>> 0;
  state[4] = (state[4] + e) >>> 0;
  state[5] = (state[5] + f) >>> 0;
  state[6] = (state[6] + g) >>> 0;
  state[7] = (state[7] + h) >>> 0;
}

/** SHA-256 de un string UTF-8 en hex minúsculas. */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const padded = padMessage(bytes);
  const state = new Uint32Array(INITIAL_HASH);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    compress(state, padded, offset, w);
  }

  let hex = "";
  for (let i = 0; i < state.length; i += 1) {
    hex += state[i].toString(16).padStart(8, "0");
  }
  return hex;
}

/** Normaliza saltos de línea y espacios finales antes de hashear. */
export function normalizeForHash(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/** Hash estable de bloque: SHA-256 del texto normalizado, truncado a 12 hex. */
export function hashBlock(raw: string): string {
  return sha256Hex(normalizeForHash(raw)).slice(0, 12);
}
