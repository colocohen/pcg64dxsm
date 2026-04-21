# PCG64DXSM.js

A high-quality, deterministic, fast **pseudo-random number generator (PRNG)** for JavaScript, based on **PCG64-DXSM**. Version 2 is a complete rewrite with a **WebAssembly core** — dramatically faster than the original BigInt implementation while keeping a drop-in API and bit-for-bit output.

PCG (Permuted Congruential Generator) is a family of modern PRNGs with strong statistical properties, compact state, and excellent equidistribution compared to older generators like XorShift64\* or Mersenne Twister. This package is **bit-compatible with NumPy's `PCG64DXSM`** bit generator, and works in **Node.js (ESM and CJS) and all modern browsers**.

---

## ✨ Features

- **PCG64-DXSM core** — 128-bit state, 128-bit increment, full period `2^128`, independent streams via `inc`.
- **WebAssembly-accelerated** — ~16× faster than pure-BigInt JavaScript on a realistic mixed workload.
- **NumPy-compatible output** — same `state`/`inc` produces the same sequence as `numpy.random.PCG64DXSM`.
- **Advance & seek** — jump forward/backward by any offset, or seek to exact logical position.
- **Deterministic & replayable** — serialize and restore full generator state.
- **Automatic memory management** — WASM-side state is released by `FinalizationRegistry` when the JS wrapper is garbage-collected.
- **Universal distribution** — ESM, CommonJS, and browser IIFE builds in one package, plus TypeScript definitions.
- **Zero runtime dependencies**.
- **Convenient object API** (all methods on the engine instance):
  - `random()` / `nextFloat64()` — float in `[0, 1)`.
  - `nextUint64()` — raw 64-bit BigInt.
  - `integer(min, max)` — inclusive integer range.
  - `real(min, max, inclusive)` — float range.
  - `intBelow(n)` — `[0, n)` with unbiased Lemire rejection.
  - `bool()` / `bool(pct)` / `bool(num, den)`.
  - `pick(array[, begin[, end]])`, `sample(array, k)`.
  - `shuffle(array)` — **27× faster on `Uint32Array`** than on plain arrays.
  - `die(sides)`, `dice(sides, count)`.
  - `uuid4()`, `string(len)` / `string(pool, len)`, `hex(len)`, `date(start, end)`.
  - `advance(delta)`, `seek(pos)`, `pos()`, `reset()`, `jumped(k)`, `clone()`.

---

## 🚀 Installation

```bash
npm install pcg64dxsm
```

---

## 🖥 Usage (Node.js, ESM — recommended)

```js
import PCG64DXSM from 'pcg64dxsm';

const rng = new PCG64DXSM();              // auto-seed via crypto.getRandomValues
console.log(rng.random());                 // like Math.random()
console.log(rng.integer(1, 6));            // dice roll
console.log(rng.uuid4());                  // random UUID v4
```

## 🖥 Usage (Node.js, CommonJS)

```js
const PCG64DXSM = require('pcg64dxsm');

const rng = new PCG64DXSM();
console.log(rng.random());
```

The WASM module is automatically loaded when you import/require the package; no `await init(...)` is needed in Node.

## 🌐 Usage (Browser — native ESM)

Modern browsers support ES modules directly. Point your `import` at the package and initialize the WASM once:

```html
<script type="module">
  import PCG64DXSM from './node_modules/pcg64dxsm/pcg64dxsm.js';
  // or from a CDN: https://cdn.jsdelivr.net/npm/pcg64dxsm/pcg64dxsm.js

  // One-time WASM load — returns when ready.
  await PCG64DXSM.init(new URL('./node_modules/pcg64dxsm/pcg64dxsm.wasm', import.meta.url));

  const rng = new PCG64DXSM();
  console.log(rng.integer(1, 100));
</script>
```

## 🌐 Usage (Browser — legacy `<script>` tag)

For sites without a module setup, use the IIFE build which exposes `window.PCG64DXSM`:

```html
<script src="pcg64dxsm.browser.js"></script>
<script>
  (async () => {
    await PCG64DXSM.init('./pcg64dxsm.wasm');
    const rng = new PCG64DXSM();
    console.log(rng.integer(1, 100));
  })();
</script>
```

---

## ⚡ Performance

Measured on Node 22, single core, compared against a pure-BigInt reference implementation of the same algorithm:

| Task | BigInt | This package (WASM) | Speedup |
|---|---|---|---|
| `nextUint64` × 1,000,000 | 372 ms | 75 ms | **5.0×** |
| `shuffle(Uint32Array[39])` × 100,000 | 1621 ms | 61 ms | **26.7×** |
| Monte-Carlo inner loop (50 draws × 1000 seeds, `jumped` + `shuffle`) | 400 seeds/sec | **6,556 seeds/sec** | **16.4×** |

Bit-for-bit validated against the NumPy `PCG64DXSM` bit generator and against the v1 pure-BigInt implementation.

### Performance tip: use `Uint32Array` for `shuffle`

`shuffle()` on a typed array runs fully inside WASM, touching no JS objects. On a plain `Array`, it has to copy each element into and out of WASM memory:

```js
// Slow-ish: ~7× faster than BigInt
const balls = [];
for (let i = 1; i <= 39; i++) balls.push(i);
rng.shuffle(balls);

// Fastest: ~27× faster than BigInt
const balls = new Uint32Array(39);
for (let i = 0; i < 39; i++) balls[i] = i + 1;
rng.shuffle(balls);
```

---

## 📦 API

### Construction

```js
new PCG64DXSM()                      // crypto entropy (32 bytes)
new PCG64DXSM(uint8array)            // 16 bytes = state (inc=1), 32 bytes = state + inc
new PCG64DXSM(state, inc)            // numbers, BigInts, or hex strings
PCG64DXSM.fromSeed({ state, inc })   // object form
PCG64DXSM.fromRandom()               // alias for new PCG64DXSM()
```

### Core output

```js
rng.random()         // float in [0, 1)   — Math.random replacement
rng.nextFloat64()    // same as random()
rng.nextUint64()     // BigInt in [0, 2^64)
rng.nextUint64Pair(out)  // writes [lo32, hi32] to out:Uint32Array(2) — no BigInt allocation
```

### Helpers

```js
rng.integer(min, max)                // inclusive integer
rng.real(min, max, inclusive)        // float
rng.intBelow(n)                      // unbiased [0, n)
rng.bool()                           // 50/50
rng.bool(75)                         // 75%
rng.bool(1, 6)                       // 1-in-6
rng.pick([...], begin, end)
rng.shuffle(array)                   // in-place, returns the array
rng.sample([...], k)
rng.die(6), rng.dice(6, 3)
rng.uuid4()
rng.string(16)
rng.string('abc123', 8)
rng.hex(32, true)                    // 32 uppercase hex chars
rng.date(new Date(2020,0,1), new Date())
```

### Positioning

```js
rng.getState()                       // { state, inc, counter } — all strings
rng.setState({ state, inc, counter })
rng.clone()                          // independent copy with its own WASM state
rng.advance(n)                       // forward (n>0) or backward (n<0); number or BigInt
rng.seek(pos)                        // absolute position from original seed
rng.pos()                            // current logical position
rng.reset()                          // seek(0)
rng.jumped(k)                        // advanced by k * JUMP_DISTANCE (see note)
```

### Lifecycle

```js
rng.destroy()   // optional: release WASM state immediately (32 bytes)
                // Otherwise FinalizationRegistry handles it when the wrapper is GC'd.
```

---

## 📖 Examples

### Reproducible sequences

```js
import PCG64DXSM from 'pcg64dxsm';

const rng = new PCG64DXSM('0x1234567890ABCDEF', '0xCAFEBABE');
const dice = [];
for (let i = 0; i < 5; i++) dice.push(rng.integer(1, 6));
// → same five values every run

rng.reset();
// ...will now reproduce the exact same sequence.
```

### Rewind and replay

```js
const rng = new PCG64DXSM();

const a = rng.integer(1, 6);
const b = rng.integer(1, 6);

rng.advance(-1);               // rewind one draw
const b2 = rng.integer(1, 6);  // === b

rng.seek(0);                   // back to the very start
const a2 = rng.integer(1, 6);  // === a
```

### Independent streams via `jumped`

Useful for Monte Carlo: jump by enormous multiples of `JUMP_DISTANCE` to get streams that will never overlap within any realistic simulation.

```js
const master = new PCG64DXSM(seedBytes);
for (let i = 0; i < 1000; i++) {
  const worker = master.jumped(i).clone();   // independent stream
  // ...use worker
}
```

> **Note on `jumped()` memory:** for performance, `rng.jumped(k)` returns a *transient* RNG backed by a scratch slot owned by the parent. It's valid until the next call to `jumped()` on the same parent. If you need it to persist beyond that, call `.clone()` on the returned RNG (as above). The common pattern `rng.jumped(k).shuffle(arr)` — use immediately, then discard — is fully supported.

### Cross-check with NumPy

```js
const rng = new PCG64DXSM(0x1234n, 0xABCDn);
console.log(rng.nextUint64().toString(16));
```

```python
import numpy as np
bg = np.random.PCG64DXSM(0)
st = bg.state
st['state']['state'] = 0x1234
st['state']['inc']   = 0xABCD | 1   # inc must be odd
# also perform the same canonical seeding step: state = (state + inc) * MUL + inc
MUL = 0xDA942042E4DD58B5
st['state']['state'] = ((0x1234 + (0xABCD | 1)) * MUL + (0xABCD | 1)) & ((1 << 128) - 1)
bg.state = st
print(hex(bg.random_raw()))   # matches JS output
```

---

## 🎛 Seeding & Entropy

- **Automatic** — `new PCG64DXSM()` pulls 32 bytes from `crypto.getRandomValues` (or Node's `crypto` as fallback).
- **Bytes** — `new PCG64DXSM(u8)` where `u8` is `Uint8Array(16)` (state only; `inc = 1`) or `Uint8Array(32)` (state + inc).
- **Explicit pair** — `new PCG64DXSM(state, inc)` where each is a number, BigInt, or hex string like `'0xDEADBEEF'`.
- **From object** — `PCG64DXSM.fromSeed({ state, inc })`.

### What are `state` and `inc`?

- `state` is the internal LCG state — controls *where* in the sequence you start.
- `inc` is the stream selector — must be odd. Different `inc` values produce **independent streams**, each with period `2^128`.

> PCG64DXSM is **not** a cryptographic PRNG. For keys, tokens, or any security-sensitive output, use `crypto.getRandomValues` or Node's `crypto` directly.

---

## ⚖️ vs. alternatives

- **vs. `Math.random()`** — deterministic, reproducible, much better statistical quality, same drop-in `random()` method.
- **vs. XorShift64★** — 128-bit state (vs 64), independent streams, stronger low-bit randomness, built-in jump/seek.
- **vs. Mersenne Twister (MT19937)** — smaller state (16 bytes vs ~2.5 KB), faster per draw, no high-dimensional lattice issues, and now the NumPy default.
- **vs. pure-BigInt PCG64DXSM (v1 of this package)** — identical output, 5–27× faster, lower allocation pressure.
- **vs. cryptographic RNG** — not a CSPRNG. Use `crypto.getRandomValues`/Node `crypto` for secrets.

---

## ❌ Limitations

- Not cryptographically secure.
- Requires a runtime that supports WebAssembly + BigInt + FinalizationRegistry — i.e., Node ≥ 18 and all evergreen browsers since 2021.
- The `.wasm` file (≈5 KB) must be reachable from the JS file; bundlers may need a loader rule for `.wasm` assets if you aren't using the default resolution.

---

## 🛠 Migrating from v1.x

v2 keeps the public API identical. If you used v1:

- No changes needed to `rng.nextUint64()`, `rng.random()`, `rng.shuffle()`, `rng.jumped()`, etc. — they return and behave the same.
- `rng.pos()` still returns `number` when safe, `BigInt` otherwise.
- For maximum speed, change shuffled arrays to `Uint32Array` where feasible.
- If you were using v1 in a Web Worker or browser via `<script>`, either switch to ESM (`pcg64dxsm.js`) or use the new `pcg64dxsm.browser.js` IIFE build and call `await PCG64DXSM.init('./pcg64dxsm.wasm')` once.

---

## 📜 License

MIT

---

## 📚 References

- Melissa O'Neill, *PCG: A Family of Better Random Number Generators* — <https://www.pcg-random.org>
- NumPy documentation, [`PCG64DXSM` bit generator](https://numpy.org/doc/stable/reference/random/bit_generators/pcg64dxsm.html)
- PractRand / TestU01 — statistical test suites commonly used in PRNG design.
