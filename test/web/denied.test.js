// catnet — by cole (github.com/yupthatscole)
"use strict";
const assert = require("assert");
const path = require("path");
const D = require(path.join(__dirname, "../../web/js/denied-rules.js"));

function rng(seed) {
  let s = seed >>> 0 || 1;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = (n) => Math.floor(r() * n);
  r.pick = (a) => a[Math.floor(r() * a.length)];
  r.chance = (p) => r() < p;
  r.shuffle = (a) => a.slice();
  return r;
}

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok   " + name); } catch (e) { console.log("  FAIL " + name + "\n       " + e.message); process.exitCode = 1; }
}

test("calendar", () => {
  assert.strictEqual(D.fmtDate(D.DAY1), "02 NOV 1987");
  assert.strictEqual(D.fmtDate(D.DAY1 + 6), "08 NOV 1987");
  for (let n = 0; n < 4000; n += 37) {
    const { y, m, d } = D.fromOrdinal(n);
    assert.strictEqual(D.ordinal(y, m, d), n);
  }
});

test("clean visitors never violate any rule (7 days x 3000)", () => {
  for (let day = 1; day <= 7; day++) {
    const rules = D.dayRules(day);
    const r = rng(day * 101);
    for (let i = 0; i < 3000; i++) {
      const v = D.generate(r, rules, { clean: true });
      const vs = D.check(v, rules);
      assert.deepStrictEqual(vs.map((x) => x.code), [], `day ${day} visitor ${i}: ${JSON.stringify(vs)} ${JSON.stringify(v.docs)}`);
      assert.strictEqual(D.verdict(v, rules), "approve");
    }
  }
});

test("every forgery is detected by check() (7 days x 5000)", () => {
  const seen = {};
  for (let day = 1; day <= 7; day++) {
    const rules = D.dayRules(day);
    const r = rng(day * 7919);
    for (let i = 0; i < 5000; i++) {
      const v = D.generate(r, rules, { forge: 1 });
      const codes = D.check(v, rules).map((x) => x.code);
      assert.ok(v.forged.length >= 1, "forge:1 must forge something");
      for (const f of v.forged) {
        seen[f] = (seen[f] || 0) + 1;
        assert.ok(codes.includes(D.FORGERY_CODE[f]), `day ${day}: forgery ${f} not detected (got ${codes}) docs=${JSON.stringify(v.docs)}`);
      }
      assert.notStrictEqual(D.verdict(v, rules), "approve", `forged visitor approved: ${v.forged}`);
    }
  }
  for (const f of Object.keys(D.FORGERY_CODE)) assert.ok(seen[f] > 0, "forgery never generated: " + f);
});

test("each violation can be found by inspecting its field pair", () => {
  for (let day = 1; day <= 7; day++) {
    const rules = D.dayRules(day);
    const r = rng(day * 31337);
    for (let i = 0; i < 2000; i++) {
      const v = D.generate(r, rules, { forge: 1 });
      for (const x of D.check(v, rules)) {
        assert.ok(D.inspect(v, rules, x.pair[1], x.pair[0]), `pair ${x.pair} not inspectable`);
      }
      assert.strictEqual(D.inspect(v, rules, "id.name", "id.name"), null);
    }
  }
});

test("watchlisted faces must be detained (days 4-7)", () => {
  for (let day = 4; day <= 7; day++) {
    const rules = D.dayRules(day);
    const r = rng(day);
    const list = D.watchlist(r, rules);
    assert.strictEqual(list.length, rules.watch);
    for (let i = 0; i < 200; i++) {
      const v = D.generate(r, rules, { watch: list[i % list.length] });
      assert.strictEqual(D.verdict(v, rules), "detain");
      assert.ok(D.sameFace(v.traits, list[i % list.length].traits));
    }
  }
});

test("story visitors get the verdict the story intends", () => {
  const expect = { pell: "deny", wren: "approve", pell2: "approve", tuft: "deny", odo: "deny", juniper: "deny", ambrose: "deny",
    kip: "deny", varga: "approve", sato: "deny", grell: "approve", wren_final: "deny" };
  for (const day of Object.keys(D.STORY)) {
    const rules = D.dayRules(+day);
    for (const s of D.STORY[day]) {
      for (let seed = 1; seed < 200; seed++) {
        const r = rng(seed * 13 + +day);
        const v = D.generate(r, rules, { clean: true, overrides: Object.assign({ story: s.key }, s.overrides || {}) });
        v.story = s.key;
        if (s.key === "tuft") v.docs = {};
        if (s.tweak) s.tweak(v, rules.today, rules);
        assert.strictEqual(D.verdict(v, rules), expect[s.key], `day ${day} ${s.key} seed ${seed}: ${JSON.stringify(D.check(v, rules))}`);
      }
    }
  }
});

test("dialogue covers every personality", () => {
  for (const p of ["nervous", "gruff", "chatty", "formal", "weary", "cryptic", "cheerful"]) {
    const L = D.LINES[p];
    assert.ok(L.greet.length && L.confront.length && L.approved.length && L.denied.length);
    assert.ok(typeof L.purpose("WORK") === "string" && typeof L.stay(2) === "string");
  }
  assert.strictEqual(D.HEADLINES.length, 7);
  assert.ok(Object.keys(D.ENDINGS).length >= 7);
});

console.log(`\n${passed} passed${process.exitCode ? ", SOME FAILED" : ""}`);
