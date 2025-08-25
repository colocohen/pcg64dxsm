(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    // Node.js
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    // AMD
    define([], factory);
  } else {
    // Browser global
    var api = factory();
    root.PCG64DXSM = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis
   : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // ===== Constants =====
  var MUL = 15750249268501108917n; // 0xDA942042E4DD58B5n
  var MASK64 = (1n << 64n) - 1n;
  var MOD128 = 1n << 128n;
  var MASK128 = MOD128 - 1n;
  var JUMP_DISTANCE = 210306068529402873165736369884012333109n; // NumPy PCG64DXSM

  // Modular inverse of MUL mod 2^128 (exists because MUL is odd)
  var INV_MUL = modInvPow2(MUL, 128n);

  // ===== Constructor =====
  function PCG64DXSM(seedOrBytes, incMaybe) {
    if (!(this instanceof PCG64DXSM)) return new PCG64DXSM(seedOrBytes, incMaybe);

    var st, inc;

    if (typeof seedOrBytes === 'undefined') {
      var bytes = new Uint8Array(32);
      var cr = getCrypto();
      if (!cr || !cr.getRandomValues) throw new Error('PCG64DXSM(): crypto.getRandomValues נדרש או ספקו bytes');
      cr.getRandomValues(bytes);
      st = bytesToBigInt(bytes.subarray(0, 16));
      inc = bytesToBigInt(bytes.subarray(16));
    } else if (isByteArray(seedOrBytes)) {
      var b = normalizeBytes(seedOrBytes);
      if (b.length !== 16 && b.length !== 32) throw new Error('bytes חייב להיות 16 או 32 בייט');
      if (b.length === 16) {
        st = bytesToBigInt(b);
        inc = 1n; // will be forced odd
      } else {
        st = bytesToBigInt(b.subarray(0, 16));
        inc = bytesToBigInt(b.subarray(16));
      }
    } else if (typeof seedOrBytes !== 'undefined' && typeof incMaybe !== 'undefined') {
      st = toBigInt(seedOrBytes);
      inc = toBigInt(incMaybe);
    } else {
      throw new Error('בנאי: ספקו כלום (אנטרופיה אוטו), Uint8Array(16|32), או (state, inc)');
    }

    this.state = to128(st);
    this.inc   = forceOdd(to128(inc));

    // Keep canonical seed to enable seek/reset
    this._seedState = this.state;
    this._seedInc   = this.inc;

    // Canonical seeding: state += inc; one draw to mix (not counted)
    this.state = to128(this.state + this.inc);
    this._next64_raw();
    this.counter = 0n; // logical position from start
  }

  // ===== Static helpers =====
  PCG64DXSM.fromSeed = function (opts) {
    if (!opts || opts.state === undefined || opts.inc === undefined) {
      throw new Error('fromSeed({state, inc}) נדרש');
    }
    return new PCG64DXSM(toBigInt(opts.state), toBigInt(opts.inc));
  };
  PCG64DXSM.fromRandom = function () { return new PCG64DXSM(); };

  // ===== State I/O =====
  PCG64DXSM.prototype.clone = function () {
    var g = Object.create(PCG64DXSM.prototype);
    g.state = this.state; g.inc = this.inc;
    g._seedState = this._seedState; g._seedInc = this._seedInc;
    g.counter = this.counter;
    return g;
  };
  PCG64DXSM.prototype.getState = function () {
    return { state: hex128(this.state), inc: hex128(this.inc), counter: this.counter.toString() };
  };
  PCG64DXSM.prototype.setState = function (o) {
    if (!o || o.state === undefined || o.inc === undefined) throw new Error('setState דורש {state, inc}');
    this.state = to128(toBigInt(o.state));
    this.inc   = forceOdd(to128(toBigInt(o.inc)));
    if (o.counter !== undefined) this.counter = BigInt(o.counter);
  };

  // ===== Core draws =====
  PCG64DXSM.prototype.nextUint64 = function () { this.counter += 1n; return this._next64_raw(); };
  PCG64DXSM.prototype.nextFloat64 = function () {
    var x = this.nextUint64();
    var top53 = Number((x >> 11n) & ((1n << 53n) - 1n));
    return top53 / 9007199254740992; // 2^53
  };
  PCG64DXSM.prototype.random = function () {
    return this.nextFloat64();
  };
  PCG64DXSM.prototype.intBelow = function (bound) {
    if (typeof bound !== 'bigint') bound = BigInt(bound);
    if (bound <= 0n) throw new Error('bound חייב להיות חיובי');
    // Lemire 128->64 rejection
    var x = this.nextUint64();
    var m = x * bound;       // 128-bit product
    var l = m & MASK64;      // low 64
    if (l < bound) {
      var t = (-bound & MASK64) % bound;
      if (l < t) {
        while (true) {
          var y = this.nextUint64();
          var m2 = y * bound;
          if ((m2 & MASK64) >= t) return (m2 >> 64n);
        }
      }
    }
    return (m >> 64n);
  };

  // ===== Positioning: advance / seek / pos / reset / jumped =====
  PCG64DXSM.prototype._advanceSigned = function (delta, a, c) {
    var accMult = 1n, accPlus = 0n;
    var curMult = a,  curPlus = c;
    var d = delta;
    while (d > 0n) {
      if ((d & 1n) === 1n) {
        accMult = to128(accMult * curMult);
        accPlus = to128(accPlus * curMult + curPlus);
      }
      curPlus = to128((curMult + 1n) * curPlus);
      curMult = to128(curMult * curMult);
      d >>= 1n;
    }
    this.state = to128(accMult * this.state + accPlus);
    return this;
  };

  PCG64DXSM.prototype.advance = function (delta) {
    // accepts number or bigint, positive or negative
    var dd = (typeof delta === 'bigint') ? delta : BigInt(Math.trunc(delta));
    if (dd === 0n) return this;
    if (dd > 0n) {
      this._advanceSigned(dd, MUL, this.inc);
    } else {
      var cback = to128((-INV_MUL * this.inc) & MASK128);
      this._advanceSigned(-dd, INV_MUL, cback);
    }
    this.counter += dd;
    return this;
  };

  PCG64DXSM.prototype.seek = function (pos) {
    // accepts number or bigint
    var p = (typeof pos === 'bigint') ? pos : BigInt(Math.trunc(pos));
    this.state = this._seedState;
    this.inc   = this._seedInc;
    // canonical seed step
    this.state = to128(this.state + this.inc);
    this._next64_raw();
    this.counter = 0n;
    if (p !== 0n) this.advance(p);
    return this;
  };

  // Return current logical position: number when safe, otherwise BigInt
  PCG64DXSM.prototype.pos = function () {
    var abs = this.counter >= 0n ? this.counter : -this.counter;
    var MAX_SAFE = 9007199254740991n; // Number.MAX_SAFE_INTEGER
    if (abs <= MAX_SAFE) return Number(this.counter);
    return this.counter; // BigInt when out of safe range
  };

  PCG64DXSM.prototype.reset = function () { return this.seek(0n); };
  PCG64DXSM.prototype.jumped = function (jumps) {
    var j = (typeof jumps === 'bigint') ? jumps : BigInt(jumps);
    var g = this.clone();
    g.advance(JUMP_DISTANCE * j);
    return g;
  };

  // ===== Internal core (output-before-advance + DXSM permutation) =====
  PCG64DXSM.prototype._next64_raw = function () {
    var state = this.state;
    this.state = to128(state * MUL + this.inc); // LCG step (mod 2^128)
    var hi = (state >> 64n) & MASK64;
    var lo = (state & MASK64) | 1n; // force odd
    // DXSM (fast minimal impl)
    hi ^= (hi >> 32n);
    hi = (hi * MUL) & MASK64;
    hi ^= (hi >> 48n);
    hi = (hi * lo) & MASK64;
    return hi;
  };

  // ===== Object-style Random API =====
  PCG64DXSM.prototype.integer = function (min, max) {
    var a = Number(min), b = Number(max);
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('integer(min,max): מספרים תקינים');
    if (Math.floor(a) !== a || Math.floor(b) !== b) throw new Error('integer(): שלמים בלבד');
    if (b < a) { var t=a; a=b; b=t; }
    if (a < -9007199254740992 || b > 9007199254740992) throw new Error('טווח מחוץ ל±2^53');
    var range = BigInt(b - a + 1);
    var offset = BigInt(a);
    var v = this.intBelow(range) + offset;
    return Number(v);
  };

  PCG64DXSM.prototype.real = function (min, max, inclusive) {
    var a = Number(min), b = Number(max);
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('real(min,max): מספרים תקינים');
    if (b < a) { var t=a; a=b; b=t; }
    var closed = !!inclusive;
    var x = this.nextFloat64(); // [0,1)
    if (closed && x === 0) x = Number.MIN_VALUE; // [0,1] בקירוב
    return a + x * (b - a + (closed ? Number.EPSILON : 0));
  };

  PCG64DXSM.prototype.bool = function (a, b) {
    if (typeof a === 'undefined') {
      return this.intBelow(2n) === 1n;
    }
    if (typeof b === 'undefined') {
      var p = Number(a);
      if (!(p >= 0 && p <= 100)) throw new Error('bool(percentage): 0..100');
      return Number(this.intBelow(100n)) < p;
    }
    var num = BigInt(a), den = BigInt(b);
    if (!(den > 0n && num >= 0n && num <= den)) throw new Error('bool(numer,denom) לא חוקי');
    return this.intBelow(den) < num;
  };

  PCG64DXSM.prototype.pick = function (array, begin, end) {
    if (!Array.isArray(array)) throw new Error('pick: דרוש מערך');
    var s = (begin == null) ? 0 : Math.max(0, Math.floor(begin));
    var e = (end   == null) ? array.length : Math.min(array.length, Math.floor(end));
    if (e <= s) throw new Error('pick: טווח ריק');
    var idx = Number(this.intBelow(BigInt(e - s))) + s;
    return array[idx];
  };

  PCG64DXSM.prototype.picker = function (array, begin, end) {
    var self = this;
    if (!Array.isArray(array)) throw new Error('picker: דרוש מערך');
    var s = (begin == null) ? 0 : Math.max(0, Math.floor(begin));
    var e = (end   == null) ? array.length : Math.min(array.length, Math.floor(end));
    if (e <= s) throw new Error('picker: טווח ריק');
    return function(){ return self.pick(array, s, e); };
  };

  PCG64DXSM.prototype.shuffle = function (array) {
    if (!Array.isArray(array)) throw new Error('shuffle: דרוש מערך');
    for (var i = array.length - 1; i > 0; i--) {
      var j = Number(this.intBelow(BigInt(i + 1)));
      var tmp = array[i]; array[i] = array[j]; array[j] = tmp;
    }
    return array;
  };

  PCG64DXSM.prototype.sample = function (population, k) {
    if (!Array.isArray(population)) throw new Error('sample: דרוש מערך');
    var n = Math.max(0, Math.min(population.length, Math.floor(k)));
    var copy = population.slice();
    this.shuffle(copy);
    return copy.slice(0, n);
  };

  PCG64DXSM.prototype.die = function (sideCount) {
    var s = Math.max(1, Math.floor(sideCount));
    return this.integer(1, s);
  };

  PCG64DXSM.prototype.dice = function (sideCount, dieCount) {
    var s = Math.max(1, Math.floor(sideCount));
    var n = Math.max(0, Math.floor(dieCount));
    var out = new Array(n);
    for (var i = 0; i < n; i++) out[i] = this.integer(1, s);
    return out;
  };

  PCG64DXSM.prototype.uuid4 = function () {
    var b = randomBytesFromEngine(this, 16);
    b[6] = (b[6] & 0x0f) | 0x40; // version
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    return (
      hexBytes(b.subarray(0,4)) + '-' +
      hexBytes(b.subarray(4,6)) + '-' +
      hexBytes(b.subarray(6,8)) + '-' +
      hexBytes(b.subarray(8,10)) + '-' +
      hexBytes(b.subarray(10,16))
    );
  };

  // string(len) or string(pool,len)
  PCG64DXSM.prototype.string = function (a, b) {
    var DEFAULT_POOL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';
    var pool, len;
    if (typeof a === 'string') { pool = a; len = b; }
    else { pool = DEFAULT_POOL; len = a; }
    var n = Math.max(0, Math.floor(len));
    var out = '';
    for (var i = 0; i < n; i++) {
      var idx = Number(this.intBelow(BigInt(pool.length)));
      out += pool.charAt(idx);
    }
    return out;
  };

  // hex(len[, upper=false])
  PCG64DXSM.prototype.hex = function (length, upper) {
    var alphabet = (upper ? '0123456789ABCDEF' : '0123456789abcdef');
    var n = Math.max(0, Math.floor(length));
    var out = '';
    for (var i = 0; i < n; i++) {
      var nyb = Number(this.intBelow(16n));
      out += alphabet.charAt(nyb);
    }
    return out;
  };

  PCG64DXSM.prototype.date = function (start, end) {
    if (!(start instanceof Date) || !(end instanceof Date))
      throw new Error('date(start,end): חייב Date');
    var a = start.getTime(), b = end.getTime();
    if (b < a) { var t=a; a=b; b=t; }
    var span = BigInt(b - a + 1);
    var off = Number(this.intBelow(span));
    return new Date(a + off);
  };

  // ===== Utilities =====
  function to128(x) { if (typeof x !== 'bigint') x = BigInt(x); return x & MASK128; }
  function forceOdd(x) { return x | 1n; }
  function toBigInt(x) {
    if (typeof x === 'bigint') return x;
    if (typeof x === 'number') return BigInt(x);
    if (typeof x === 'string') {
      var s = x.trim().toLowerCase();
      if (s.startsWith('0x')) return BigInt(s);
      if (/^[0-9]+$/.test(s)) return BigInt(s);
      if (/^[0-9a-f]+$/.test(s)) return BigInt('0x' + s);
      throw new Error('מחרוזת bigint לא חוקית: ' + x);
    }
    throw new Error('לא ניתן להמיר ל‑BigInt: ' + (typeof x));
  }
  function bytesToBigInt(buf) {
    var x = 0n;
    for (var i = 0; i < buf.length; i++) x = (x << 8n) | BigInt(buf[i]);
    return x;
  }
  function hex128(x) {
    var s = x.toString(16);
    if (s.length < 32) s = '0'.repeat(32 - s.length) + s;
    return '0x' + s;
  }
  function getCrypto() {
    try {
      if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) return globalThis.crypto;
    } catch (e) {}
    return undefined;
  }
  function isByteArray(x) {
    return x && (x instanceof Uint8Array || (Array.isArray(x) && x.every(function (v){ return (v|0)===v && v>=0 && v<=255; })));
  }
  function normalizeBytes(x) {
    if (x instanceof Uint8Array) return x;
    return Uint8Array.from(x);
  }
  function hexBytes(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) {
      var h = u8[i].toString(16);
      if (h.length < 2) h = '0' + h;
      s += h;
    }
    return s;
  }
  function randomBytesFromEngine(engine, n) {
    var out = new Uint8Array(n);
    var i = 0;
    while (i < n) {
      var v = engine.nextUint64(); // BigInt
      for (var k = 0; k < 8 && i < n; k++) {
        out[i++] = Number((v >> BigInt((7 - k) * 8)) & 0xFFn);
      }
    }
    return out;
  }

  // Modular inverse of odd a modulo 2^k using Hensel/Newton lifting
  function modInvPow2(a, kBits) {
    // a is odd ⇒ inverse exists
    var inv = 1n; // inverse mod 2
    var bits = 1n;
    while (bits < kBits) {
      var mod = (1n << bits);
      // refine to twice bits (Newton step): inv' = inv * (2 - a*inv) mod 2^(2*bits)
      var mod2 = (1n << (bits * 2n));
      var prod = (a * inv) & (mod2 - 1n);
      inv = (inv * ((2n - prod) & (mod2 - 1n))) & (mod2 - 1n);
      bits *= 2n;
      if (bits > kBits) bits = kBits;
    }
    // Ensure exactly modulo 2^kBits
    var modk = (1n << kBits);
    var prod2 = (a * inv) & (modk - 1n);
    inv = (inv * ((2n - prod2) & (modk - 1n))) & (modk - 1n);
    return inv & (modk - 1n);
  }

  return PCG64DXSM;
});
