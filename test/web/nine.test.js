// catnet — by cole (github.com/yupthatscole)
"use strict";
const assert = require("assert");
const path = require("path");
const N = require(path.join(__dirname, "../../web/js/nine-core.js"));

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
  r.shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  return r;
}
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok   " + name); } catch (e) { console.log("  FAIL " + name + "\n       " + e.stack.split("\n").slice(0, 3).join("\n       ")); process.exitCode = 1; }
}

function playTurn(s, r) {
  for (let guard = 0; guard < 20 && s.rolled.length && !s.turnOver && s.enemy && s.enemy.hp > 0; guard++) {
    const it = s.enemy.intent;
    const incoming = it.k === "atk" ? Math.max(0, it.v - s.enemy.weak) * (it.n || 1) : 0;
    let best = null;
    s.kit.forEach((k, ai) => {
      const c = N.condOf(k.id, k.lvl);
      s.rolled.forEach((v, di) => {
        if (c === "pair") {
          const dj = s.rolled.findIndex((w, j) => j !== di && w === v);
          if (dj < 0 || !N.canUse(s, ai, di, dj)) return;
          const val = v * (k.lvl > 1 ? 4 : 3);
          const sc = val + (val >= s.enemy.hp + s.enemy.block ? 50 : 0);
          if (!best || sc > best.sc) best = { sc, ai, di, dj };
          return;
        }
        if (!N.canUse(s, ai, di)) return;
        let sc = 0;
        const id = k.id;
        if (["swipe", "pounce", "bite", "flick"].includes(id)) {
          const dmg = id === "swipe" ? v + (k.lvl > 1 ? 2 : 0) : id === "pounce" ? v + 4 : id === "bite" ? v + (k.lvl > 1 ? 3 : 1) : v;
          sc = dmg + (dmg >= s.enemy.hp + s.enemy.block ? 50 : 0) + (id === "flick" && incoming ? 2 : 0);
        } else if (id === "hiss" || id === "loaf") {
          const b = id === "hiss" ? v + (k.lvl > 1 ? 2 : 0) : v * (k.lvl > 1 ? 3 : 2);
          sc = Math.min(b, Math.max(0, incoming - s.block)) * 1.2 - (id === "loaf" ? 2 : 0);
        } else if (["groom", "nap", "purr"].includes(id)) {
          sc = s.hp < s.maxHp * 0.6 ? 6 : 1;
        } else if (id === "knead") {
          sc = v <= 2 ? 3 : 0.5;
        }
        if (!best || sc > best.sc) best = { sc, ai, di };
      });
    });
    if (!best || best.sc <= 0) break;
    const ev = N.use(s, best.ai, best.di, r, best.dj);
    assert.ok(ev, "use() refused a move canUse() allowed");
  }
}

function playRun(seed, coat = "tuft") {
  const r = rng(seed);
  const s = N.newRun(coat, seed, r);
  let fights = 0;
  for (let step = 0; step < 2000 && !s.over; step++) {
    const node = N.currentNode(s);
    if (node === "event") {
      const ev = N.EVENTS[s.events[s.room]];
      ev.choices[0][1](s);
      if (s.pendingUpgrade) { const k = s.kit.find((x) => x.lvl < 2); if (k) N.upgrade(s, k.id); s.pendingUpgrade = false; }
      N.advanceEvent(s);
      continue;
    }
    N.startFight(s, r);
    fights++;
    for (let t = 0; t < 200 && !s.over; t++) {
      playTurn(s, r);
      if (s.enemy.hp <= 0) break;
      N.enemyAct(s, r);
    }
    if (s.over) break;
    assert.ok(s.enemy.hp <= 0, "fight did not end");
    N.winFight(s);
    if (!s.over) {
      const rw = N.rewards(s, r);
      assert.strictEqual(rw.length, 3);
      N.takeReward(s, rw[0].t === "heal" && s.hp > s.maxHp * 0.7 ? rw[1] : rw[0]);
    }
  }
  assert.ok(s.over, "run did not finish");
  return { won: s.won, room: s.room, score: N.score(s), fights, s };
}

test("conditions", () => {
  assert.ok(N.fits("even", 4) && !N.fits("even", 3));
  assert.ok(N.fits("min:5", 6) && !N.fits("min:5", 4));
  assert.ok(N.fits("max:2", 1) && !N.fits("max:2", 3));
  assert.strictEqual(N.condLabel("min:5"), "5+");
});

test("abilities do what they say", () => {
  const r = rng(1);
  const s = N.newRun("tuft", 1, r);
  N.startFight(s, r);
  s.rolled = [4, 6, 2];
  const hp = s.enemy.hp;
  N.use(s, 0, 0, r); // swipe 4
  assert.strictEqual(s.enemy.hp, hp - 4);
  N.use(s, 2, 0, r); // hiss 6
  assert.strictEqual(s.block, 6);
  s.hp = 10;
  N.use(s, 3, 0, r); // groom even 2 -> heal 1
  assert.strictEqual(s.hp, 11);
  assert.strictEqual(N.use(s, 0, 0, r), null, "no dice left");
});

test("pairs need two equal dice; fright locks 4+ abilities", () => {
  const r = rng(2);
  const s = N.newRun("midnight", 2, r);
  N.startFight(s, r);
  s.rolled = [3, 3, 5, 1];
  const z = s.kit.findIndex((k) => k.id === "zoomies");
  assert.strictEqual(N.use(s, z, 0, r, 2), null);
  const hp = s.enemy.hp;
  assert.ok(N.use(s, z, 0, r, 1));
  assert.strictEqual(s.enemy.hp, Math.max(0, hp - 9));
  const s2 = N.newRun("tuft", 3, r);
  s2.kit.push({ id: "pounce", lvl: 1 });
  N.startFight(s2, r);
  s2.status.fright = true;
  N.startTurn(s2, r);
  assert.ok(s2.locked.includes(1) && s2.locked.includes(4));
});

test("1500 simulated runs finish without errors, balance in range", () => {
  for (const coat of ["tuft", "ginger", "midnight"]) {
    let wins = 0, beatVacuum = 0, total = 0;
    const n = 500;
    for (let i = 1; i <= n; i++) {
      const res = playRun(i * 7 + coat.length, coat);
      if (res.won) wins++;
      if (res.room >= 1) beatVacuum++;
      total += res.score;
    }
    const wr = wins / n, vr = beatVacuum / n;
    console.log(`       ${coat}: win ${(wr * 100).toFixed(1)}%  past room 1 ${(vr * 100).toFixed(1)}%  avg score ${Math.round(total / n)}`);
    assert.ok(vr > 0.45, `${coat}: room 1 too hard (${vr})`);
    assert.ok(wr > 0.05 && wr < 0.8, `${coat}: win rate out of range (${wr})`);
  }
});

test("state survives a JSON round trip (saves)", () => {
  const r = rng(9);
  const s = N.newRun("tuft", 9, r);
  N.startFight(s, r);
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepStrictEqual(copy, s);
});

console.log(`\n${passed} passed${process.exitCode ? ", SOME FAILED" : ""}`);
