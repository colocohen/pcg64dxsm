// pcg64dxsm.browser.js — Browser IIFE build
// Use via <script src="pcg64dxsm.browser.js"></script>, then:
//   await PCG64DXSM.init('./pcg64dxsm.wasm');
//   const rng = new PCG64DXSM();
//
// Prefer the ESM build (pcg64dxsm.js) for modern browsers with module support.
// This file exists for legacy pages or simple demos without a build step.

(function (root) {
  'use strict';

  const MASK64 = (1n << 64n) - 1n;
  const MASK128 = (1n << 128n) - 1n;
  const MUL_BIG = 0xDA942042E4DD58B5n;
  const JUMP_DIST = 210306068529402873165736369884012333109n;

  let W = null;
  let mem = null;

  const WASM_IMPORTS = {
    env: {
      abort: function (_m, _f, line, col) { throw new Error('WASM abort ' + line + ':' + col); },
      'Date.now': function () { return Date.now(); },
      seed: function () { return Date.now(); },
    },
  };

  function initSync(bytes) {
    const mod = new WebAssembly.Module(bytes);
    const inst = new WebAssembly.Instance(mod, WASM_IMPORTS);
    W = inst.exports;
    mem = W.memory;
    return PCG64DXSM;
  }

  async function initAsync(src) {
    if (typeof src === 'string' || src instanceof URL) src = fetch(src);
    if (src && typeof src.then === 'function') {
      const resolved = await src;
      if (resolved instanceof Response) {
        try {
          const { instance } = await WebAssembly.instantiateStreaming(resolved.clone(), WASM_IMPORTS);
          W = instance.exports; mem = W.memory;
          return PCG64DXSM;
        } catch (_) {
          const bytes = await resolved.arrayBuffer();
          const { instance } = await WebAssembly.instantiate(bytes, WASM_IMPORTS);
          W = instance.exports; mem = W.memory;
          return PCG64DXSM;
        }
      }
      src = resolved;
    }
    if (src instanceof Response) {
      const { instance } = await WebAssembly.instantiateStreaming(src, WASM_IMPORTS);
      W = instance.exports; mem = W.memory;
      return PCG64DXSM;
    }
    const { instance } = await WebAssembly.instantiate(src, WASM_IMPORTS);
    W = instance.exports; mem = W.memory;
    return PCG64DXSM;
  }

  function splitU128(x) { x = x & MASK128; return [x & MASK64, (x >> 64n) & MASK64]; }
  function splitU256(x) {
    const M = (1n << 256n) - 1n; x = x & M;
    return [x & MASK64, (x >> 64n) & MASK64, (x >> 128n) & MASK64, (x >> 192n) & MASK64];
  }
  function bytesToBigInt(buf) {
    let x = 0n;
    for (let i = 0; i < buf.length; i++) x = (x << 8n) | BigInt(buf[i]);
    return x;
  }
  function getRandomBytes(n) {
    const out = new Uint8Array(n);
    if (root.crypto && root.crypto.getRandomValues) { root.crypto.getRandomValues(out); return out; }
    throw new Error('PCG64DXSM: crypto.getRandomValues unavailable');
  }

  const _cleanup = new FinalizationRegistry(function (ptr) {
    if (ptr && W) W.free_state(ptr);
  });

  class PCG64DXSM {
    constructor(seedOrBytes, incMaybe) {
      if (!W) throw new Error('PCG64DXSM: WASM not initialized. Call `await PCG64DXSM.init("./pcg64dxsm.wasm")` first.');
      this._ptr = W.alloc_state() >>> 0;
      if (!this._ptr) throw new Error('WASM allocation failed');
      _cleanup.register(this, this._ptr, this);

      let seedBig, incBig;
      if (typeof seedOrBytes === 'undefined') {
        const bytes = getRandomBytes(32);
        seedBig = bytesToBigInt(bytes.subarray(0, 16));
        incBig = bytesToBigInt(bytes.subarray(16));
      } else if (seedOrBytes instanceof Uint8Array || Array.isArray(seedOrBytes)) {
        const b = seedOrBytes instanceof Uint8Array ? seedOrBytes : Uint8Array.from(seedOrBytes);
        if (b.length !== 16 && b.length !== 32) throw new Error('seed bytes must be 16 or 32');
        seedBig = bytesToBigInt(b.subarray(0, 16));
        incBig = b.length === 32 ? bytesToBigInt(b.subarray(16)) : 1n;
      } else if (typeof incMaybe !== 'undefined') {
        seedBig = BigInt(seedOrBytes);
        incBig = BigInt(incMaybe);
      } else {
        throw new Error('constructor: nothing, Uint8Array(16|32), or (state, inc)');
      }

      this._seedStateBig = seedBig & MASK128;
      this._seedIncBig = incBig & MASK128;
      const [sLo, sHi] = splitU128(seedBig);
      const [iLo, iHi] = splitU128(incBig);
      W.init_state(this._ptr, sLo, sHi, iLo, iHi);
      this.counter = 0n;
      this._scratchPtr = 0;
      this._isScratch = false;
    }

    nextUint64() { this.counter += 1n; return W.next_u64(this._ptr) & MASK64; }
    nextUint64Pair(out) {
      this.counter += 1n;
      const v = W.next_u64(this._ptr) & MASK64;
      out[0] = Number(v & 0xFFFFFFFFn);
      out[1] = Number(v >> 32n);
    }
    nextFloat64() {
      this.counter += 1n;
      const v = W.next_u64(this._ptr) & MASK64;
      return Number(v >> 11n) / 9007199254740992;
    }
    random() { return this.nextFloat64(); }

    intBelow(bound) {
      let bu;
      if (typeof bound === 'bigint') {
        if (bound <= 0n) throw new Error('bound must be positive');
        if (bound > MASK64) return this._intBelowBig(bound);
        bu = bound;
      } else {
        if (typeof bound !== 'number' || bound <= 0 || !Number.isFinite(bound)) throw new Error('bound must be positive number or BigInt');
        bu = BigInt(Math.floor(bound));
      }
      this.counter += 1n;
      const r = W.int_below(this._ptr, bu) & MASK64;
      return bu <= 0xFFFFFFFFn ? Number(r) : r;
    }

    _intBelowBig(bound) {
      this.counter += 1n;
      const x = W.next_u64(this._ptr) & MASK64;
      const m = x * bound;
      const l = m & MASK64;
      if (l < bound) {
        const t = ((-bound) & MASK64) % bound;
        if (l < t) {
          while (true) {
            this.counter += 1n;
            const y = W.next_u64(this._ptr) & MASK64;
            const m2 = y * bound;
            if ((m2 & MASK64) >= t) return m2 >> 64n;
          }
        }
      }
      return m >> 64n;
    }

    shuffle(array) {
      const n = array.length;
      if (n <= 1) return array;
      const bufPtr = W.alloc_u32_array(n) >>> 0;
      const view = new Uint32Array(mem.buffer, bufPtr, n);
      if (array instanceof Uint32Array || array instanceof Int32Array) {
        view.set(array);
        W.shuffle_u32(this._ptr, bufPtr, n);
        array.set(view);
      } else {
        for (let i = 0; i < n; i++) view[i] = array[i] >>> 0;
        W.shuffle_u32(this._ptr, bufPtr, n);
        for (let i = 0; i < n; i++) array[i] = view[i];
      }
      W.free_buffer(bufPtr);
      this.counter += BigInt(n - 1);
      return array;
    }

    advance(delta) {
      let d = typeof delta === 'bigint' ? delta : BigInt(Math.trunc(delta));
      if (d === 0n) return this;
      if (d < 0n) { this._advanceBackwardBig(-d); this.counter += d; return this; }
      const [w0, w1, w2, w3] = splitU256(d);
      W.advance(this._ptr, w0, w1, w2, w3);
      this.counter += d;
      return this;
    }

    _advanceBackwardBig(dd) {
      function modInvPow2(a, kBits) {
        let inv = 1n, bits = 1n;
        while (bits < kBits) {
          const mod2 = 1n << (bits * 2n);
          const prod = (a * inv) & (mod2 - 1n);
          inv = (inv * ((2n - prod) & (mod2 - 1n))) & (mod2 - 1n);
          bits *= 2n;
          if (bits > kBits) bits = kBits;
        }
        const modk = 1n << kBits;
        const prod2 = (a * inv) & (modk - 1n);
        return (inv * ((2n - prod2) & (modk - 1n))) & (modk - 1n);
      }
      const invMul = modInvPow2(MUL_BIG, 128n);
      const incBig = this._getIncBig();
      const cback = (-invMul * incBig) & MASK128;
      let accMult = 1n, accPlus = 0n, curMult = invMul, curPlus = cback;
      let d = dd;
      while (d > 0n) {
        if (d & 1n) {
          accMult = (accMult * curMult) & MASK128;
          accPlus = (accPlus * curMult + curPlus) & MASK128;
        }
        curPlus = ((curMult + 1n) * curPlus) & MASK128;
        curMult = (curMult * curMult) & MASK128;
        d >>= 1n;
      }
      const s = this._getStateBig();
      const s2 = (accMult * s + accPlus) & MASK128;
      const [sLo, sHi] = splitU128(s2);
      const [iLo, iHi] = splitU128(incBig);
      W.set_state(this._ptr, sLo, sHi, iLo, iHi);
    }

    _getStateBig() {
      return ((W.get_state_hi(this._ptr) & MASK64) << 64n) | (W.get_state_lo(this._ptr) & MASK64);
    }
    _getIncBig() {
      return ((W.get_inc_hi(this._ptr) & MASK64) << 64n) | (W.get_inc_lo(this._ptr) & MASK64);
    }

    clone() {
      const g = Object.create(PCG64DXSM.prototype);
      g._ptr = W.alloc_state() >>> 0;
      W.clone_state(g._ptr, this._ptr);
      g._seedStateBig = this._seedStateBig;
      g._seedIncBig = this._seedIncBig;
      g.counter = this.counter;
      g._scratchPtr = 0;
      g._isScratch = false;
      _cleanup.register(g, g._ptr, g);
      return g;
    }

    jumped(jumps) {
      if (this._isScratch) {
        const j = typeof jumps === 'bigint' ? jumps : BigInt(jumps);
        const g = this.clone();
        g.advance(JUMP_DIST * j);
        return g;
      }
      if (!this._scratchPtr) {
        this._scratchPtr = W.alloc_state() >>> 0;
        _cleanup.register(this, this._scratchPtr, this._scratchToken = {});
      }
      W.clone_state(this._scratchPtr, this._ptr);
      const j = typeof jumps === 'bigint' ? jumps : BigInt(jumps);
      const delta = JUMP_DIST * j;
      const [w0, w1, w2, w3] = splitU256(delta);
      W.advance(this._scratchPtr, w0, w1, w2, w3);

      const g = Object.create(PCG64DXSM.prototype);
      g._ptr = this._scratchPtr;
      g._scratchPtr = 0;
      g._isScratch = true;
      g._seedStateBig = this._seedStateBig;
      g._seedIncBig = this._seedIncBig;
      g.counter = this.counter;
      return g;
    }

    seek(pos) {
      const p = typeof pos === 'bigint' ? pos : BigInt(Math.trunc(pos));
      const [sLo, sHi] = splitU128(this._seedStateBig);
      const [iLo, iHi] = splitU128(this._seedIncBig);
      W.init_state(this._ptr, sLo, sHi, iLo, iHi);
      this.counter = 0n;
      if (p !== 0n) this.advance(p);
      return this;
    }
    reset() { return this.seek(0n); }

    pos() {
      const abs = this.counter >= 0n ? this.counter : -this.counter;
      if (abs <= 9007199254740991n) return Number(this.counter);
      return this.counter;
    }

    getState() {
      return {
        state: '0x' + this._getStateBig().toString(16).padStart(32, '0'),
        inc: '0x' + this._getIncBig().toString(16).padStart(32, '0'),
        counter: this.counter.toString(),
      };
    }
    setState(o) {
      if (!o || o.state === undefined || o.inc === undefined) throw new Error('setState needs {state, inc}');
      const s = typeof o.state === 'bigint' ? o.state : BigInt(o.state);
      const i = typeof o.inc === 'bigint' ? o.inc : BigInt(o.inc);
      const [sLo, sHi] = splitU128(s);
      const [iLo, iHi] = splitU128(i);
      W.set_state(this._ptr, sLo, sHi, iLo, iHi);
      if (o.counter !== undefined) this.counter = BigInt(o.counter);
    }

    destroy() {
      if (this._isScratch) return;
      if (this._ptr) { _cleanup.unregister(this); W.free_state(this._ptr); this._ptr = 0; }
      if (this._scratchPtr) { _cleanup.unregister(this._scratchToken); W.free_state(this._scratchPtr); this._scratchPtr = 0; }
    }

    integer(min, max) {
      const a = Number(min), b = Number(max);
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('integer(min,max): finite numbers');
      let lo = a, hi = b;
      if (hi < lo) { const t = lo; lo = hi; hi = t; }
      const span = BigInt(hi - lo + 1);
      const offset = BigInt(lo);
      return Number(BigInt(this.intBelow(span)) + offset);
    }

    real(min, max, inclusive) {
      const a = Number(min), b = Number(max);
      let lo = a, hi = b;
      if (hi < lo) { const t = lo; lo = hi; hi = t; }
      const x = this.nextFloat64();
      if (inclusive && x === 0) return lo;
      return lo + x * (hi - lo + (inclusive ? Number.EPSILON : 0));
    }

    bool(a, b) {
      if (typeof a === 'undefined') return this.intBelow(2) === 1;
      if (typeof b === 'undefined') {
        const p = Number(a);
        if (!(p >= 0 && p <= 100)) throw new Error('bool(percentage): 0..100');
        return this.intBelow(100) < p;
      }
      const num = BigInt(a), den = BigInt(b);
      if (!(den > 0n && num >= 0n && num <= den)) throw new Error('bool(numer,denom) invalid');
      return BigInt(this.intBelow(den)) < num;
    }

    pick(array, begin, end) {
      if (!Array.isArray(array) && !ArrayBuffer.isView(array)) throw new Error('pick: array required');
      const s = begin == null ? 0 : Math.max(0, Math.floor(begin));
      const e = end == null ? array.length : Math.min(array.length, Math.floor(end));
      if (e <= s) throw new Error('pick: empty range');
      return array[this.intBelow(e - s) + s];
    }

    sample(population, k) {
      if (!Array.isArray(population)) throw new Error('sample: array required');
      const n = Math.max(0, Math.min(population.length, Math.floor(k)));
      const copy = population.slice();
      this.shuffle(copy);
      return copy.slice(0, n);
    }

    die(sides) { return this.integer(1, Math.max(1, Math.floor(sides))); }
    dice(sides, count) {
      const s = Math.max(1, Math.floor(sides));
      const n = Math.max(0, Math.floor(count));
      const out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = this.integer(1, s);
      return out;
    }

    uuid4() {
      const b = new Uint8Array(16);
      for (let i = 0; i < 16; i += 8) {
        const v = this.nextUint64();
        for (let k = 0; k < 8; k++) b[i + k] = Number((v >> BigInt((7 - k) * 8)) & 0xFFn);
      }
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const hex = function (u) { return u.toString(16).padStart(2, '0'); };
      return (
        Array.from(b.subarray(0, 4), hex).join('') + '-' +
        Array.from(b.subarray(4, 6), hex).join('') + '-' +
        Array.from(b.subarray(6, 8), hex).join('') + '-' +
        Array.from(b.subarray(8, 10), hex).join('') + '-' +
        Array.from(b.subarray(10, 16), hex).join('')
      );
    }

    string(a, b) {
      const DEFAULT_POOL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';
      let pool, len;
      if (typeof a === 'string') { pool = a; len = b; } else { pool = DEFAULT_POOL; len = a; }
      const n = Math.max(0, Math.floor(len));
      let out = '';
      for (let i = 0; i < n; i++) out += pool.charAt(this.intBelow(pool.length));
      return out;
    }

    hex(length, upper) {
      const alphabet = upper ? '0123456789ABCDEF' : '0123456789abcdef';
      const n = Math.max(0, Math.floor(length));
      let out = '';
      for (let i = 0; i < n; i++) out += alphabet.charAt(this.intBelow(16));
      return out;
    }

    date(start, end) {
      if (!(start instanceof Date) || !(end instanceof Date)) throw new Error('date(start,end): Date required');
      let a = start.getTime(), b = end.getTime();
      if (b < a) { const t = a; a = b; b = t; }
      const off = Number(BigInt(this.intBelow(BigInt(b - a + 1))));
      return new Date(a + off);
    }
  }

  PCG64DXSM.fromSeed = function (opts) {
    if (!opts || opts.state === undefined || opts.inc === undefined) throw new Error('fromSeed({state, inc}) required');
    return new PCG64DXSM(BigInt(opts.state), BigInt(opts.inc));
  };
  PCG64DXSM.fromRandom = function () { return new PCG64DXSM(); };
  PCG64DXSM.init = initAsync;
  PCG64DXSM.initSync = initSync;

  root.PCG64DXSM = PCG64DXSM;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
