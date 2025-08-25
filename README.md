# PCG64DXSM.js

A high-quality, deterministic, and fast **pseudo-random number generator (PRNG)** for JavaScript based on **PCG64‑DXSM**.

PCG (Permuted Congruential Generator) is a family of modern PRNGs with strong statistical properties, small state size, and excellent equidistribution compared to older generators like XorShift64\* and Mersenne Twister. This implementation is written in **vanilla JavaScript** and works in **both Node.js and the browser**.

---

## ✨ Features

- **PCG64‑DXSM core** — 128‑bit state, 128‑bit increment.
- **Period**: full period of `2^128` with independent streams via `inc`.
- **Advance & Seek** — jump forward/backward by any offset, or seek to exact position.
- **Deterministic & Replayable** — save/restore full generator state.
- **Convenient Object API** (all on the engine instance):
  - `random()` – drop‑in replacement for `Math.random()`.
  - `integer(min, max)` – inclusive integer range.
  - `real(min, max, inclusive)` – float range `[min,max)` or `[min,max]`.
  - `bool()` / `bool(pct)` / `bool(num, den)` – probability booleans.
  - `pick(array[, begin[, end]])`, `picker(array[, begin[, end]])`.
  - `shuffle(array)`, `sample(array, k)`.
  - `die(sides)`, `dice(sides, count)`.
  - `uuid4()`, `string(len)` / `string(pool,len)`, `hex(len[, upper])`, `date(start,end)`.
- **Node.js & Browser support** (UMD wrapper).
- **BigInt math** ensures correctness of the 128‑bit LCG core.

---

## 🚀 Installation

```bash
npm install pcg64dxsm
```

or copy `pcg64dxsm.js` into your project.

---

## 🖥 Usage (Node.js)

```js
var PCG64DXSM = require('pcg64dxsm');

var rng = new PCG64DXSM(); // automatic entropy (WebCrypto)

console.log(rng.random());        // like Math.random()
console.log(rng.integer(1, 6));   // dice roll
console.log(rng.uuid4());         // random UUID v4
```

Manual entropy:

```js
var crypto = require('crypto');
var bytes = Uint8Array.from(crypto.randomBytes(32)); // 32 bytes = 16 state + 16 inc
var rng = new PCG64DXSM(bytes);
```

> **Node shim (if needed)**: on older Node versions without `globalThis.crypto`:
>
> ```js
> if (!globalThis.crypto) {
>   globalThis.crypto = require('crypto').webcrypto;
> }
> ```

---

## 🌐 Usage (Browser)

```html
<script src="pcg64dxsm.js"></script>
<script>
  var rng = new PCG64DXSM(); // auto‑seeded via window.crypto.getRandomValues
  console.log(rng.integer(1, 100));
  console.log(rng.string(16)); // random string
</script>
```

---

## 📦 API Overview

### Core

- `new PCG64DXSM([bytes | state, inc])`
- `rng.random()` → float in `[0,1)`
- `rng.nextUint64()` → raw 64‑bit `BigInt`
- `rng.nextFloat64()` → float in `[0,1)`

### Helpers

- `rng.integer(min, max)`
- `rng.real(min, max, inclusive)`
- `rng.bool()` / `rng.bool(percentage)` / `rng.bool(numer, denom)`
- `rng.pick(array[, begin[, end]])`
- `rng.picker(array[, begin[, end]])`
- `rng.shuffle(array)`
- `rng.sample(array, k)`
- `rng.die(sides)`, `rng.dice(sides,count)`
- `rng.uuid4()`
- `rng.string(len)` / `rng.string(pool, len)`
- `rng.hex(len[, upper])`
- `rng.date(start, end)`

### State & Position

- `rng.getState()` → `{ state, inc, counter }`
- `rng.setState(obj)` → restore from object
- `rng.clone()`
- `rng.advance(n)` → move forward/backward by `n` steps (`number` or `BigInt`)
- `rng.seek(pos)` → jump to exact logical position from seed (`number` or `BigInt`)
- `rng.pos()` → current logical position (**returns **``** when safe, otherwise **``)
- `rng.reset()` → `seek(0)`
- `rng.jumped(k)` → new engine advanced by `k * JUMP_DISTANCE`

---

## 📖 Examples with `advance`, `seek`, `pos`

```js
var PCG64DXSM = require('pcg64dxsm');
var rng = new PCG64DXSM();

console.log("Initial pos:", rng.pos());

// roll twice
var a = rng.integer(1, 6);
var b = rng.integer(1, 6);
console.log("Rolled:", a, b);
console.log("Pos after two rolls:", rng.pos());

// go back one step
rng.advance(-1);
console.log("Pos after rewind:", rng.pos());

// re-roll → identical to previous `b`
var b2 = rng.integer(1, 6);
console.log("Re-rolled b:", b2);

// reset to beginning
rng.seek(0);
console.log("Pos after reset:", rng.pos());
var a2 = rng.integer(1, 6);
console.log("First roll after reset:", a2);
```

Sample output:

```
Initial pos: 0
Rolled: 3 5
Pos after two rolls: 2
Pos after rewind: 1
Re-rolled b: 5
Pos after reset: 0
First roll after reset: 3
```

---

## 🎛 Seeding & Entropy

You can initialize the engine in several ways:

- **Automatic entropy** — `new PCG64DXSM()` uses WebCrypto to fetch 32 bytes (16 for `state`, 16 for `inc`).
- **Manual bytes** — `new PCG64DXSM(u8)` where `u8` is a `Uint8Array` of length **16** (state; `inc=1`) or **32** (state + inc).
- **Explicit seed pair** — `new PCG64DXSM(state, inc)` with decimal or hex strings/BigInts.
- **From object** — `PCG64DXSM.fromSeed({ state, inc })`.

**What are **``** and **``**?**

- `state` is the internal state of the LCG; changing it changes the starting point of the sequence.
- `inc` is the constant increment (must be odd). Different `inc` values produce **independent streams** with the same period `2^128`.

> **Note:** PCG64DXSM is **not** a cryptographic PRNG. For keys/tokens, prefer WebCrypto / Node `crypto`.

---

## ⚖️ Advantages vs. Alternatives

- **vs. Math.random()**

  - Deterministic (reproducible sequences).
  - Much larger state and period.
  - Stronger statistical properties.
  - Same easy interface (`random()`).

- **vs. XorShift64\***

  - PCG64DXSM has 128‑bit state vs 64‑bit.
  - Superior low‑bit randomness and distribution.
  - Multiple independent streams (`inc`).
  - Built‑in jump/seek support.
  - Slightly slower (BigInt math).

- **vs. Mersenne Twister (MT19937)**

  - MT19937 has period `2^19937−1` but suffers from correlation issues in high dimensions.
  - PCG64DXSM, introduced in **2021 by Melissa O’Neill**, uses permutation (DXSM) to improve quality without large state.
  - PCG64DXSM avoids the lattice structure problems and is lighter in memory (128‑bit state vs 19937‑bit).
  - Typically faster for many practical workloads while delivering stronger statistical results on low bits.

- **vs. older PCG64**

  - PCG64DXSM is the improved successor to PCG64.
  - Provides better equidistribution and fixes weaknesses in some output bits.
  - Now the recommended default in scientific libraries (e.g., NumPy adopted PCG64DXSM).

- **vs. Cryptographic RNG (e.g., **``**)**

  - PCG64DXSM is **not** a CSPRNG.
  - Great for simulations, games, Monte‑Carlo, procedural generation.
  - For cryptography/keys → use WebCrypto or Node’s crypto.

---

## ❌ Limitations

- Not a cryptographically secure PRNG.
- BigInt arithmetic may be slower than native 32/64‑bit ops.
- Generating very long strings/arrays one element at a time (e.g., `rng.string(1e6)`) can be less efficient than batching.

---

## 🔧 Development

- Pure JavaScript, no dependencies.
- Works with Node.js (>=14; add the WebCrypto shim above if needed).
- Tested with modern browsers.
- UMD build exports the class for both environments.

---

## 📜 License

MIT License

---

## 📚 References & Further Reading

- Melissa O’Neill, *PCG: A Family of Better Random Number Generators* (original PCG paper, 2014) — [http://www.pcg-random.org](http://www.pcg-random.org)
- Melissa O’Neill, notes on PCG64DXSM permutation (2021) — see PCG site above for updates.
- NumPy Documentation: [BitGenerators – PCG64DXSM](https://numpy.org/doc/stable/reference/random/bit_generators/pcg64dxsm.html)
- PractRand / TestU01: statistical test suites often referenced in PRNG design.

