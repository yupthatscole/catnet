// catnet — by cole (github.com/yupthatscole)
"use strict";
const assert = require("assert");
const path = require("path");
const G = require(path.join(__dirname, "../../web/js/signal-core.js"));

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok   " + name); } catch (e) { console.log("  FAIL " + name + "\n       " + e.message); process.exitCode = 1; }
}

test("perfect match scores 1, silence scores 0", () => {
  const t = [{ f: 3, a: 0.8, p: 1 }];
  assert.ok(Math.abs(G.similarity(t, t) - 1) < 1e-9);
  assert.strictEqual(G.similarity(t, [{ f: 3, a: 0, p: 0 }]), 0);
});

test("every level's target is reachable on the knob grid and starts unlocked", () => {
  for (let seed = 1; seed < 300; seed++) {
    for (const L of G.LEVELS) {
      const r = rng(seed * 100 + L.n);
      const target = G.makeTarget(r, L.k);
      assert.strictEqual(target.length, L.k);
      for (const c of target) for (const k of ["f", "a", "p"]) assert.ok(Math.abs(G.snap(c[k], k) - c[k]) < 1e-6, `${k}=${c[k]} off-grid`);
      const fs = target.map((c) => c.f).sort((a, b) => a - b);
      for (let i = 1; i < fs.length; i++) assert.ok(fs[i] - fs[i - 1] >= 1, "frequencies too close");
      const start = G.makeStart(r, target, L.free);
      assert.ok(G.similarity(target, start) < G.LOCK_AT, `level ${L.n} seed ${seed} starts already locked`);
      assert.ok(G.similarity(target, target.map((c) => ({ ...c }))) >= G.LOCK_AT);
    }
  }
});

test("lock tolerance is fair: one knob step off still locks, a big miss does not", () => {
  const t = [{ f: 4, a: 0.7, p: 2 }];
  assert.ok(G.similarity(t, [{ f: 4 + G.STEP.f, a: 0.7, p: 2 }]) >= G.LOCK_AT, "one frequency step should still lock");
  assert.ok(G.similarity(t, [{ f: 4, a: 0.7 - G.STEP.a, p: 2 }]) >= G.LOCK_AT);
  assert.ok(G.similarity(t, [{ f: 4, a: 0.7, p: 2 + G.STEP.p }]) >= G.LOCK_AT);
  assert.ok(G.similarity(t, [{ f: 4.5, a: 0.7, p: 2 }]) < G.LOCK_AT, "half a cycle off must not lock");
  assert.ok(G.similarity(t, [{ f: 4, a: 0.45, p: 2 }]) < G.LOCK_AT);
});

test("multi-oscillator matches are order independent", () => {
  const t = [{ f: 2, a: 0.8, p: 0 }, { f: 5, a: 0.3, p: 1 }];
  assert.ok(G.similarity(t, [t[1], t[0]]) > 0.999);
});

test("scoring and stars", () => {
  assert.ok(G.score(12, 60, 0.98) > G.score(1, 60, 0.98));
  assert.ok(G.score(3, 50, 0.95) > G.score(3, 10, 0.95));
  assert.strictEqual(G.stars(40, 60), 3);
  assert.strictEqual(G.stars(20, 60), 2);
  assert.strictEqual(G.stars(5, 60), 1);
  assert.strictEqual(G.MESSAGES.length, G.LEVELS.length);
  assert.strictEqual(G.scanLevel(0).k, 1);
  assert.strictEqual(G.scanLevel(20).k, 3);
});

console.log(`\n${passed} passed${process.exitCode ? ", SOME FAILED" : ""}`);
