// pcg64dxsm.d.ts
// Type definitions for PCG64DXSM

declare class PCG64DXSM {
  /**
   * Create a new PRNG.
   * - `new PCG64DXSM()` — auto-seed from `crypto.getRandomValues`
   * - `new PCG64DXSM(bytes)` — `Uint8Array` of length 16 (state only, inc=1) or 32 (state + inc)
   * - `new PCG64DXSM(state, inc)` — explicit 128-bit values (number, BigInt, or hex string)
   */
  constructor();
  constructor(bytes: Uint8Array | number[]);
  constructor(state: bigint | number | string, inc: bigint | number | string);

  /** Current position in the stream (number when safe, BigInt otherwise) */
  counter: bigint;

  /** Returns the next 64-bit value as BigInt */
  nextUint64(): bigint;

  /** Writes [lo32, hi32] of the next 64-bit value into `out` (length ≥ 2). No BigInt allocation. */
  nextUint64Pair(out: Uint32Array | Int32Array): void;

  /** Returns the next value as a float in [0, 1) — drop-in `Math.random()` replacement */
  nextFloat64(): number;
  /** Alias for `nextFloat64()` */
  random(): number;

  /**
   * Returns a random integer in [0, bound).
   * Number for bound ≤ 2^32, BigInt otherwise.
   */
  intBelow(bound: number | bigint): number | bigint;

  /** Returns a random integer in [min, max] (inclusive) */
  integer(min: number, max: number): number;

  /** Returns a random float in [min, max) (or [min, max] if inclusive) */
  real(min: number, max: number, inclusive?: boolean): number;

  /** Random boolean. No args = 50/50. One number = percentage 0..100. Two numbers = numer/denom. */
  bool(): boolean;
  bool(percentage: number): boolean;
  bool(numer: number | bigint, denom: number | bigint): boolean;

  /** Pick a random element from an array (optionally within [begin, end)) */
  pick<T>(array: T[] | ArrayLike<T>, begin?: number, end?: number): T;

  /** Fisher-Yates shuffle in place. For maximum speed pass a Uint32Array. */
  shuffle<T extends any[] | Uint32Array | Int32Array>(array: T): T;

  /** Returns k random elements from a population (without replacement) */
  sample<T>(population: T[], k: number): T[];

  /** Roll one die with N sides (returns 1..N) */
  die(sides: number): number;

  /** Roll `count` dice, each with `sides` sides */
  dice(sides: number, count: number): number[];

  /** Generate a v4 UUID */
  uuid4(): string;

  /** Random alphanumeric string of the given length (or from a custom pool) */
  string(length: number): string;
  string(pool: string, length: number): string;

  /** Random hex string of the given length (lowercase by default) */
  hex(length: number, upper?: boolean): string;

  /** Random date in [start, end] */
  date(start: Date, end: Date): Date;

  /** Advance the stream by `delta` steps (positive or negative) */
  advance(delta: number | bigint): this;

  /** Jump to exact logical position from the original seed */
  seek(pos: number | bigint): this;

  /** Reset to position 0 */
  reset(): this;

  /** Current logical position (number when safe, BigInt otherwise) */
  pos(): number | bigint;

  /** Create a new RNG advanced by `jumps × JUMP_DISTANCE`.
   *  Note: the returned RNG is a transient handle into the parent's scratch state.
   *  It's valid until the next call to `jumped()` on the same parent.
   *  Call `.clone()` on it if you need a persistent copy. */
  jumped(jumps: number | bigint): PCG64DXSM;

  /** Full clone with its own WASM-side state (caller owns it) */
  clone(): PCG64DXSM;

  /** Serialize state to a JSON-friendly object */
  getState(): { state: string; inc: string; counter: string };

  /** Restore state from a {state, inc, counter?} object */
  setState(obj: { state: bigint | number | string; inc: bigint | number | string; counter?: bigint | number | string }): void;

  /** Explicitly release WASM memory (optional — FinalizationRegistry handles it otherwise) */
  destroy(): void;

  /** Build from explicit {state, inc} */
  static fromSeed(opts: { state: bigint | number | string; inc: bigint | number | string }): PCG64DXSM;

  /** Auto-seeded via crypto.getRandomValues */
  static fromRandom(): PCG64DXSM;

  /**
   * Initialize the WASM module.
   * Required in browsers. In Node, this runs automatically when you `import` the package.
   *
   * Accepts:
   *  - a URL or string (browser): `await PCG64DXSM.init(new URL('./pcg64dxsm.wasm', import.meta.url))`
   *  - a fetch response / promise: `await PCG64DXSM.init(fetch('./pcg64dxsm.wasm'))`
   *  - an ArrayBuffer or Uint8Array
   */
  static init(source: URL | string | Response | Promise<Response> | ArrayBuffer | Uint8Array): Promise<typeof PCG64DXSM>;

  /** Synchronous init from bytes (Node only, avoid in browsers for >4KB WASM) */
  static initSync(bytes: ArrayBuffer | Uint8Array): typeof PCG64DXSM;
}

export default PCG64DXSM;
export { PCG64DXSM };
