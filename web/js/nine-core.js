// catnet — by cole (github.com/yupthatscole)
"use strict";
(function (root) {
  const HP_PER_LIFE = 3;
  const TUNE = { hp: 0.42, atk: 0.4, atk0: 1.15, atkAdd: 1, bossHeal: 3, rewardHeal: 5 };

  const ABILITIES = {
    swipe: { name: "swipe", cond: "any", text: (l) => `deal ■${l > 1 ? "+2" : ""} damage`, use: (s, v, l) => [hit(s, v + (l > 1 ? 2 : 0))] },
    pounce: { name: "pounce", cond: (l) => (l > 1 ? "min:4" : "min:5"), text: () => "deal ■+4 damage", use: (s, v) => [hit(s, v + 4)] },
    hiss: { name: "hiss", cond: "any", text: (l) => `block ■${l > 1 ? "+2" : ""}`, use: (s, v, l) => [guard(s, v + (l > 1 ? 2 : 0))] },
    groom: { name: "groom", cond: "even", text: (l) => (l > 1 ? "heal ■" : "heal half ■"), use: (s, v, l) => [heal(s, l > 1 ? v : Math.ceil(v / 2))] },
    bite: { name: "bite", cond: "odd", text: (l) => `deal ■+${l > 1 ? 3 : 1} damage`, use: (s, v, l) => [hit(s, v + (l > 1 ? 3 : 1))] },
    nap: { name: "nap", cond: "max:2", text: (l) => `heal ${l > 1 ? 5 : 3}`, use: (s, v, l) => [heal(s, l > 1 ? 5 : 3)] },
    flick: { name: "tail flick", cond: "max:3", text: (l) => `deal ■, enemy hits ${l > 1 ? 4 : 2} softer`, use: (s, v, l) => { s.enemy.weak += l > 1 ? 4 : 2; return [hit(s, v), { t: "weak", v: l > 1 ? 4 : 2 }]; } },
    knead: { name: "knead", cond: "any", text: (l) => (l > 1 ? "reroll ■, +1" : "reroll ■"), reroll: true, use: (s, v, l, r) => {
      const nv = Math.min(6, 1 + r.int(6) + (l > 1 ? 1 : 0));
      s.rolled.push(nv);
      return [{ t: "reroll", from: v, to: nv }];
    } },
    purr: { name: "purr", cond: "six", text: (l) => `heal ${l > 1 ? 6 : 4}, block ${l > 1 ? 6 : 4}`, use: (s, v, l) => [heal(s, l > 1 ? 6 : 4), guard(s, l > 1 ? 6 : 4)] },
    zoomies: { name: "zoomies", cond: "pair", text: (l) => `two equal dice: deal ■ ×${l > 1 ? 4 : 3}`, use: (s, v, l) => [hit(s, v * (l > 1 ? 4 : 3))] },
    loaf: { name: "loaf", cond: "min:3", text: (l) => `block ■×${l > 1 ? 3 : 2}, then your turn ends`, endsTurn: true, use: (s, v, l) => [guard(s, v * (l > 1 ? 3 : 2))] },
  };
  const STARTERS = {
    tuft: { name: "tuft", lives: 9, dice: 3, kit: ["swipe", "pounce", "hiss", "groom"], blurb: "the original. balanced, fluffy, determined." },
    ginger: { name: "ginger", lives: 6, dice: 4, kit: ["swipe", "bite", "hiss"], blurb: "one more die, three fewer lives. all teeth.", unlock: "beat the vacuum" },
    midnight: { name: "midnight", lives: 5, dice: 4, kit: ["knead", "zoomies", "hiss"], blurb: "rerolls and doubles. high risk, high zoomies.", unlock: "finish a run" },
  };

  function condOf(ab, lvl) { const c = ABILITIES[ab].cond; return typeof c === "function" ? c(lvl) : c; }
  function condLabel(c) {
    if (c === "any") return "any";
    if (c === "even") return "even";
    if (c === "odd") return "odd";
    if (c === "six") return "6";
    if (c === "pair") return "pair";
    const [k, n] = c.split(":");
    return k === "min" ? `${n}+` : `${n}-`;
  }
  function fits(c, v) {
    if (c === "any") return true;
    if (c === "even") return v % 2 === 0;
    if (c === "odd") return v % 2 === 1;
    if (c === "six") return v === 6;
    if (c === "pair") return true; // checked with two dice
    const [k, n] = c.split(":");
    return k === "min" ? v >= +n : v <= +n;
  }
  const isFrightLocked = (c) => c.startsWith("min:") && +c.split(":")[1] >= 4;

  const A = (v, n) => ({ k: "atk", v, n: n || 1 });
  const ENEMIES = {
    dust: { name: "dust bunny", hp: 10, moves: [A(3), A(3), { k: "blk", v: 3 }, A(4)] },
    laser: { name: "the red dot", hp: 11, moves: [{ k: "blk", v: 5 }, A(4), A(5)], random: true },
    shoe: { name: "a shoe", hp: 14, moves: [A(5), A(2, 2), { k: "wind" }, A(9)] },
    spray: { name: "spray bottle", hp: 12, moves: [{ k: "wet" }, A(4), A(5)] },
    toaster: { name: "the toaster", hp: 14, moves: [A(2, 3), { k: "blk", v: 5 }, { k: "wind" }, A(10)] },
    band: { name: "rubber band", hp: 10, moves: [{ k: "wind" }, A(10), A(3)] },
    duck: { name: "bath duck", hp: 14, moves: [{ k: "fright" }, A(5), A(3, 2)] },
    dryer: { name: "hair dryer", hp: 17, moves: [{ k: "heat" }, A(4), A(4), A(6)] },
    mop: { name: "the mop", hp: 18, moves: [A(6), { k: "blk", v: 7 }, A(3, 3)] },
    vacuum: { name: "THE VACUUM", hp: 34, boss: true, moves: [{ k: "suck" }, A(6), A(4, 2), { k: "blk", v: 6 }] },
    cucumber: { name: "THE CUCUMBER", hp: 38, boss: true, moves: [{ k: "fright" }, A(8), { k: "blk", v: 8 }, A(4, 2)] },
    dog: { name: "THE DOG", hp: 50, boss: true, moves: [A(8), { k: "fetch" }, A(5, 2), { k: "blk", v: 8 }, { k: "wind" }, A(14)] },
  };
  const ROOMS = [
    { name: "the living room", enemies: ["dust", "laser", "shoe"], boss: "vacuum" },
    { name: "the kitchen", enemies: ["spray", "toaster", "band"], boss: "cucumber" },
    { name: "the bathroom", enemies: ["duck", "dryer", "mop"], boss: "dog" },
  ];
  const NODES = ["fight", "fight", "event", "fight", "boss"];
  const EVENTS = {
    sunbeam: { name: "a sunbeam", text: "a patch of moonlight on the rug, still warm somehow. tuft lies in it.", choices: [["bask (heal 2 lives)", (s) => heal(s, 6)]] },
    jar: { name: "the treat jar", text: "the lid is loose. this is not a drill.", choices: [["upgrade an ability", (s) => { s.pendingUpgrade = true; }], ["eat them all (heal 1 life, +1 max life)", (s) => { s.maxHp += 3; heal(s, 3); }]] },
    box: { name: "a cardboard box", text: "if it fits, it sits. tuft sits. tuft feels powerful.", choices: [["sit (+1 die this room)", (s) => { s.roomDie = (s.roomDie || 0) + 1; }], ["sharpen claws on it (swipe → upgrade)", (s) => upgrade(s, "swipe")]] },
  };

  function hit(s, dmg) {
    const e = s.enemy;
    const absorbed = Math.min(e.block, dmg);
    e.block -= absorbed;
    const real = dmg - absorbed;
    e.hp = Math.max(0, e.hp - real);
    s.stats.dealt += real;
    return { t: "hit", v: real, blocked: absorbed };
  }
  function guard(s, v) { s.block += v; return { t: "block", v }; }
  function heal(s, v) { const before = s.hp; s.hp = Math.min(s.maxHp, s.hp + v); return { t: "heal", v: s.hp - before }; }
  function upgrade(s, id) { const a = s.kit.find((k) => k.id === id); if (a && a.lvl < 2) a.lvl = 2; return { t: "upgrade", id }; }

  function newRun(coat, seed, r) {
    const st = STARTERS[coat] || STARTERS.tuft;
    const order = ROOMS.map((room) => r.shuffle(room.enemies));
    const events = ROOMS.map(() => r.pick(Object.keys(EVENTS)));
    return {
      v: 1, coat, seed, room: 0, node: 0, hp: st.lives * HP_PER_LIFE, maxHp: st.lives * HP_PER_LIFE, dice: st.dice,
      kit: st.kit.map((id) => ({ id, lvl: 1 })), order, events, enemy: null, block: 0, rolled: [], used: [], status: {},
      stats: { dealt: 0, kills: 0, turns: 0 }, over: false, won: false, pendingUpgrade: false,
    };
  }
  function currentNode(s) { return NODES[s.node]; }
  function enemyFor(s) {
    const room = ROOMS[s.room];
    const kind = currentNode(s) === "boss" ? room.boss : s.order[s.room][[0, 1, null, 2][s.node]];
    const def = ENEMIES[kind];
    const scale = 1 + s.room * TUNE.hp;
    return { id: kind, name: def.name, hp: Math.round(def.hp * scale), maxHp: Math.round(def.hp * scale), block: 0, weak: 0, step: 0, intent: null, boss: !!def.boss, scale };
  }
  function pickIntent(s, r) {
    const e = s.enemy, def = ENEMIES[e.id];
    let m;
    if (e.wound) { m = def.moves.find((x) => x.k === "atk" && x.v >= 9) || def.moves[0]; e.wound = false; }
    else if (def.random) m = r.pick(def.moves);
    else { m = def.moves[e.step % def.moves.length]; e.step++; }
    if (m.k === "wind") e.wound = true;
    const scaled = Object.assign({}, m);
    if (scaled.v) scaled.v = Math.round(scaled.v * TUNE.atk0 * (1 + s.room * TUNE.atk) + (scaled.k === "atk" ? TUNE.atkAdd : 0));
    e.intent = scaled;
  }
  function startFight(s, r) {
    s.enemy = enemyFor(s);
    s.block = 0;
    s.status = {};
    pickIntent(s, r);
    startTurn(s, r);
  }
  function diceThisTurn(s) {
    let n = s.dice + (s.roomDie || 0);
    if (s.status.suck) n -= 1;
    if (s.status.heat) n -= 1;
    return Math.max(1, n);
  }
  function startTurn(s, r) {
    s.stats.turns++;
    s.rolled = Array.from({ length: diceThisTurn(s) }, () => 1 + r.int(6));
    if (s.status.wet) {
      const i = s.rolled.indexOf(Math.max(...s.rolled));
      s.rolled[i] = 1;
    }
    s.used = [];
    s.locked = [];
    if (s.status.fright) s.kit.forEach((k, i) => { if (isFrightLocked(condOf(k.id, k.lvl))) s.locked.push(i); });
    if (s.status.fetch) {
      const best = s.kit.findIndex((k) => ["pounce", "zoomies", "swipe", "bite"].includes(k.id));
      if (best >= 0) s.locked.push(best);
    }
    s.status = {};
    s.turnOver = false;
  }
  function canUse(s, abIdx, dieIdx, dieIdx2) {
    if (s.turnOver || s.over) return false;
    const a = s.kit[abIdx];
    if (!a || s.used.includes(abIdx) || s.locked.includes(abIdx)) return false;
    const c = condOf(a.id, a.lvl);
    const v = s.rolled[dieIdx];
    if (v == null) return false;
    if (c === "pair") {
      if (dieIdx2 == null || dieIdx2 === dieIdx) return true; // needs a second die: allowed to start a selection
      return s.rolled[dieIdx2] === v;
    }
    return fits(c, v);
  }
  function use(s, abIdx, dieIdx, r, dieIdx2) {
    const a = s.kit[abIdx], def = ABILITIES[a.id];
    const c = condOf(a.id, a.lvl);
    if (c === "pair" && (dieIdx2 == null || s.rolled[dieIdx2] !== s.rolled[dieIdx] || dieIdx2 === dieIdx)) return null;
    if (!canUse(s, abIdx, dieIdx, dieIdx2)) return null;
    const v = s.rolled[dieIdx];
    const remove = [dieIdx, dieIdx2].filter((x) => x != null).sort((x, y) => y - x);
    for (const i of remove) s.rolled.splice(i, 1);
    s.used.push(abIdx);
    const out = def.use(s, v, a.lvl, r);
    if (def.endsTurn) s.turnOver = true;
    if (s.enemy.hp <= 0) out.push({ t: "kill" });
    return out;
  }
  function enemyAct(s, r) {
    const e = s.enemy, it = e.intent, out = [];
    e.block = 0;
    if (it.k === "atk") {
      for (let i = 0; i < (it.n || 1); i++) {
        const dmg = Math.max(0, it.v - e.weak);
        const absorbed = Math.min(s.block, dmg);
        s.block -= absorbed;
        s.hp = Math.max(0, s.hp - (dmg - absorbed));
        out.push({ t: "hurt", v: dmg - absorbed, blocked: absorbed });
      }
    } else if (it.k === "blk") {
      e.block = it.v;
      out.push({ t: "eblock", v: it.v });
    } else if (it.k === "wind") {
      out.push({ t: "wind" });
    } else {
      s.status[it.k] = true;
      out.push({ t: "status", k: it.k });
    }
    e.weak = 0;
    s.block = 0;
    if (s.hp <= 0) { s.over = true; out.push({ t: "dead" }); }
    else { pickIntent(s, r); startTurn(s, r); }
    return out;
  }
  function winFight(s) {
    s.stats.kills++;
    const boss = s.enemy.boss;
    s.enemy = null;
    if (boss) { heal(s, TUNE.bossHeal); s.roomDie = 0; }
    s.node++;
    if (s.node >= NODES.length) { s.node = 0; s.room++; }
    if (s.room >= ROOMS.length) { s.over = true; s.won = true; }
    return boss;
  }
  function advanceEvent(s) {
    s.node++;
  }
  function rewards(s, r) {
    const owned = s.kit.map((k) => k.id);
    const pool = [];
    for (const id of Object.keys(ABILITIES)) if (!owned.includes(id) && s.kit.length < 6) pool.push({ t: "learn", id });
    for (const k of s.kit) if (k.lvl < 2) pool.push({ t: "upgrade", id: k.id });
    const picks = r.shuffle(pool).slice(0, 2);
    if (s.dice < 5 && r.chance(0.25)) picks.push({ t: "die" });
    else picks.push({ t: "heal", v: TUNE.rewardHeal });
    while (picks.length < 3) picks.push(picks.some((p) => p.t === "life") ? { t: "heal", v: TUNE.rewardHeal } : { t: "life" });
    return picks;
  }
  function takeReward(s, rw) {
    if (rw.t === "learn") s.kit.push({ id: rw.id, lvl: 1 });
    else if (rw.t === "upgrade") upgrade(s, rw.id);
    else if (rw.t === "die") s.dice++;
    else if (rw.t === "heal") heal(s, rw.v || 6);
    else if (rw.t === "life") { s.maxHp += HP_PER_LIFE; heal(s, HP_PER_LIFE); }
  }
  function score(s) {
    return s.stats.kills * 15 + s.stats.dealt + s.hp * 5 + s.room * 50 + (s.won ? 300 : 0);
  }

  const api = { TUNE, HP_PER_LIFE, ABILITIES, STARTERS, ENEMIES, ROOMS, NODES, EVENTS, condOf, condLabel, fits, newRun, currentNode, startFight, startTurn, canUse, use, enemyAct, winFight, advanceEvent, rewards, takeReward, score, heal, upgrade };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NINE = api;
})(typeof window !== "undefined" ? window : globalThis);
