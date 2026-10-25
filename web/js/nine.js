// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { h } = cn;
  const N = window.NINE;
  const app = document.getElementById("app");
  await cn.boot({ page: "arcade", shell: false, manualPulse: true });

  let save = await gk.load("nine");
  if (!save || typeof save !== "object") save = {};
  save = Object.assign({ v: 1, best: 0, runs: 0, wins: 0, coats: ["tuft"], coat: "tuft", run: null }, save);
  const persist = (now) => gk.save("nine", save, now);
  const COAT_FILTER = { tuft: "none", ginger: "sepia(1) saturate(2.4) hue-rotate(-18deg)", midnight: "grayscale(1) brightness(.5) contrast(1.6)" };

  const ART = {
    dust: { pal: { g: "#5d5868", G: "#9a94a6", k: "#141018", p: "#e8a0c0" }, rows: [
      "......g..g......", ".....gG..Gg.....", ".....gG..Gg.....", "....gGGGGGGg....", "...gGGGGGGGGg...", "..gGGGGGGGGGGg..",
      "..gGGkGGGGkGGg..", ".gGGGkGGGGkGGGg.", ".gGGGGGGGGGGGGg.", ".gGGGGGppGGGGGg.", "..gGGGGGGGGGGg..", "..gGGGGGGGGGGg..",
      "...gGGGGGGGGg...", "....gg.gg.gg....", "................", "................"] },
    laser: { pal: { r: "#7a1a24", R: "#ff3b4e", W: "#ffd0d6" }, rows: [
      "................", "................", "......rrrr......", "....rr....rr....", "...r..RRRR..r...", "..r..RRRRRR..r..",
      "..r.RRRWWRRR.r..", ".r..RRWWWWRR..r.", ".r..RRWWWWRR..r.", "..r.RRRWWRRR.r..", "..r..RRRRRR..r..", "...r..RRRR..r...",
      "....rr....rr....", "......rrrr......", "................", "................"] },
    shoe: { pal: { k: "#120d18", S: "#6a7fb0", w: "#e8e8f0", W: "#f4f0e0", e: "#ffd88a" }, rows: [
      "................", "................", "......kkkk......", ".....kSSSSk.....", "....kSSwSwSk....", "....kSSSwSwk....",
      "...kSSSSSSSk....", "..kSSSSSSSSkkk..", ".kSSSeSSSeSSSSk.", ".kSSSSSSSSSSSSk.", ".kSSSSSSSSSSSSk.", ".kWWWWWWWWWWWWk.",
      "..kkkkkkkkkkkk..", "................", "................", "................"] },
    spray: { pal: { k: "#120d18", B: "#ff8a5c", T: "#7fd3e8", e: "#141018", w: "#e8fbff" }, rows: [
      "................", "....kkkkkk......", "....kBBBBkkk....", "....kBBBBBBBk...", ".....kkBBkk.....", "......kTTk......",
      ".....kTTTTk.....", "....kTTTTTTk....", "....kTeTTeTk....", "....kTTTTTTk....", "....kTTwwTTk....", "....kTTTTTTk....",
      "....kTTTTTTk....", "....kTTTTTTk....", ".....kkkkkk.....", "................"] },
    toaster: { pal: { k: "#120d18", M: "#b9bfcc", b: "#d9a35c", e: "#141018", w: "#ff6b4a", L: "#5d5868" }, rows: [
      "................", "....bb....bb....", "....bb....bb....", "..kkkkkkkkkkkk..", "..kMMMMMMMMMMk..", "..kMkkkkkkkkMk..",
      "..kMMMMMMMMMMk..", "..kMMeMMMMeMMk..", "..kMMMMMMMMMMk..", "..kMMMwwwwMMMkL.", "..kMMMMMMMMMMkL.", "..kMMMMMMMMMMk..",
      "..kkkkkkkkkkkk..", "...kk......kk...", "................", "................"] },
    band: { pal: { o: "#e8b04a", O: "#a8761c", e: "#141018" }, rows: [
      "................", "................", ".....oooooo.....", "...ooOOOOOOoo...", "..oO........Oo..", ".oO..e....e..Oo.",
      ".oO..........Oo.", ".oO...OOOO...Oo.", ".oO..........Oo.", "..oO........Oo..", "...ooOOOOOOoo...", ".....oooooo.....",
      "................", "................", "................", "................"] },
    duck: { pal: { Y: "#ffd84a", y: "#e0a820", k: "#141018", O: "#ff8a3a", b: "#4f8fd8" }, rows: [
      "................", "......YYYY......", ".....YYYYYY.....", ".....YYkYYYOO...", ".....YYYYYYOOO..", "......YYYYY.....",
      "..Y..YYYYYYY....", "..YYYYYYYYYYY...", "..YYYYYYYYYYYY..", "..YyYYYYYYYYYY..", "...YyyYYYYYYY...", "....YYYYYYYY....",
      "bbbbbbbbbbbbbbbb", "b.bbb.bbb.bbb.bb", "................", "................"] },
    dryer: { pal: { k: "#120d18", D: "#d65a8c", d: "#9c3a62", e: "#141018", R: "#ff9a3a" }, rows: [
      "................", "..kkkkkkkk......", ".kDDDDDDDDkk....", ".kDDeDDeDDDDk...", ".kDDDDDDDDDDDk.R", ".kDDDDDDDDDDDkRR",
      ".kDdDDDDDDDDDk.R", "..kkkkDDDkkkk...", "......kDDk......", "......kDdk......", "......kDDk......", "......kDdk......",
      "......kkkk......", "................", "................", "................"] },
    mop: { pal: { k: "#3a2a1a", M: "#dcd6c8", m: "#a8a294", e: "#141018" }, rows: [
      "......kk........", "......kk........", "......kk........", "......kk........", "......kk........", ".....kkkk.......",
      "...MMMMMMMM.....", "..MMeMMMMeMM....", "..MMMMMMMMMM....", "..MMmMMMMmMMM...", "..M.M.MM.M.MM...", "..M.m.M..m.M.M..",
      "..M...m..M...m..", "..m......m......", "................", "................"] },
    vacuum: { pal: { k: "#120d18", V: "#4a4f63", v: "#6b7290", r: "#ff3b4e", g: "#9ff0c0" }, rows: [
      "................", "....kkkkkkkk....", "..kkvvvvvvvvkk..", ".kvVVVVVVVVVVvk.", ".kVVVrVVVVrVVVk.", "kVVVVVVVVVVVVVVk",
      "kVVVVVVVVVVVVVVk", "kVVVVVVggVVVVVVk", "kVVVVVVggVVVVVVk", "kVVVVVVVVVVVVVVk", ".kVVVVVVVVVVVVk.", ".kVVkkkkkkkkVVk.",
      "..kkVVVVVVVVkk..", "....kkkkkkkk....", "................", "................"] },
    cucumber: { pal: { k: "#0d1a10", C: "#5aa85a", c: "#8fd88f", e: "#141018", w: "#e8ffe8" }, rows: [
      "........kkk.....", ".......kCCCk....", "......kCcCCk....", "......kCCCCk....", ".....kCwCwCCk...", ".....kCeCeCCk...",
      ".....kCcCCCCk...", "....kCCCCCcCk...", "....kCCCCCCk....", "...kCcCCCCCk....", "...kCCCCCCk.....", "..kCCCCcCCk.....",
      "..kCCCCCCk......", "..kCCCCCk.......", "...kkkkk........", "................"] },
    dog: { pal: { k: "#120d18", D: "#6b4a2a", B: "#c48a50", e: "#141018", w: "#f4f0e0", t: "#ff8aa8", n: "#2a1a10" }, rows: [
      "..kk........kk..", ".kDDk......kDDk.", ".kDDDkkkkkkDDDk.", ".kDDBBBBBBBBDDk.", "..kBBBBBBBBBBk..", "..kBwBBBBBBwBk..",
      "..kBeBBBBBBeBk..", "..kBBBBBBBBBBk..", "..kBBBBnnBBBBk..", "..kBBBBnnBBBBk..", "...kBBBBBBBBk...", "...kBBtttBBBk...",
      "....kBBttBBk....", ".....kkkkkk.....", "................", "................"] },
  };
  function enemyCanvas(id) {
    const [c, x] = gk.canvas(16, 16, "nl-enemy");
    const a = ART[id];
    gk.bitmap(x, a.rows, a.pal, 0, 0, 1);
    return c;
  }
  const HEART = ["..........", ".##....##.", "####..####", "##########", "##########", ".########.", "..######..", "...####...", "....##....", ".........."];
  function heartCanvas(fill) { // fill 0..3
    const [c, x] = gk.canvas(10, 10, "nl-heart");
    gk.bitmap(x, HEART, { "#": "#3a2c55" }, 0, 0, 1);
    if (fill > 0) {
      x.save();
      x.beginPath();
      x.rect(0, 10 - Math.round((fill / 3) * 9) - 0.5, 10, 10);
      x.clip();
      gk.bitmap(x, HEART, { "#": "#ff7a8a" }, 0, 0, 1);
      x.restore();
      x.fillStyle = "#ffd0d8";
      if (fill === 3) x.fillRect(2, 2, 1, 1);
    }
    return c;
  }
  function die(v, cls) {
    const b = h("button", { class: "nl-die " + (cls || ""), "aria-label": "die showing " + v });
    const P = { 1: [[2, 2]], 2: [[0, 0], [4, 4]], 3: [[0, 0], [2, 2], [4, 4]], 4: [[0, 0], [4, 0], [0, 4], [4, 4]], 5: [[0, 0], [4, 0], [2, 2], [0, 4], [4, 4]], 6: [[0, 0], [4, 0], [0, 2], [4, 2], [0, 4], [4, 4]] }[v];
    for (const [px, py] of P) b.append(h("i", { style: { left: 8 + px * 7.5 + "px", top: 8 + py * 7.5 + "px" } }));
    return b;
  }

  const sfx = {
    roll() { for (let i = 0; i < 4; i++) gk.noise(0.04, { freq: 2200, vol: 0.12, delay: i * 0.06, filter: "bandpass" }); },
    hit() { gk.tone(320, 0.14, { type: "square", slide: 110, vol: 0.12 }); gk.noise(0.08, { freq: 900, vol: 0.2 }); },
    hurt() { gk.tone(110, 0.3, { type: "sawtooth", slide: 60, vol: 0.1 }); gk.vibrate(50); },
    block() { gk.tone(880, 0.1, { type: "triangle", vol: 0.08 }); gk.tone(1320, 0.12, { type: "triangle", vol: 0.05, delay: 0.05 }); },
    heal() { [523, 659, 784].forEach((f, i) => gk.tone(f, 0.18, { type: "sine", vol: 0.08, delay: i * 0.07 })); },
    kill() { [392, 523, 659, 1046].forEach((f, i) => gk.tone(f, 0.22, { type: "square", vol: 0.06, delay: i * 0.08 })); },
    boss() { gk.tone(55, 1.2, { type: "sawtooth", vol: 0.08 }); gk.tone(82, 1.2, { type: "sawtooth", vol: 0.05 }); },
    tap() { gk.tone(1200, 0.02, { type: "square", vol: 0.03 }); },
  };

  let S = null, r = null, ui = {}, sel = null, pairFor = null, busy = false;
  const btn = (label, sub, fn, cls = "") => h("button", { class: "nl-btn " + cls, onclick: () => { gk.audio(); sfx.tap(); fn(); } }, label, sub ? h("small", { text: sub }) : null);
  function screen(...kids) { app.replaceChildren(...kids); scrollTo(0, 0); }
  function tuftEl(mood, scale) {
    const t = new cn.Tuft(null, scale || 1.4);
    t.el.style.filter = COAT_FILTER[(S && S.coat) || save.coat] || "none";
    t.play(mood || "idle");
    return t;
  }

  function title() {
    S = null;
    const lb = h("div", {}, h("p", { class: "gk-dim", text: "…" }));
    gk.board("nine").then((b) => lb.replaceChildren(gk.boardTable(b, h)));
    const t = tuftEl("idle", 1.6);
    const coats = h("div", { class: "nl-coats" }, Object.entries(N.STARTERS).map(([id, c]) => {
      const owned = save.coats.includes(id);
      const tt = new cn.Tuft(null, 0.8);
      tt.el.style.filter = COAT_FILTER[id];
      return h("button", { class: "nl-coat" + (save.coat === id ? " on" : ""), disabled: !owned, onclick: () => { save.coat = id; persist(); title(); } },
        tt.el, h("b", { text: c.name }), h("span", { text: owned ? `${c.lives} lives · ${c.dice} dice` : "locked: " + c.unlock }),
        h("span", { class: "gk-dim", text: owned ? c.blurb : "" }));
    }));
    screen(
      h("div", { style: { display: "flex", alignItems: "flex-end", gap: "14px" } }, t.el,
        h("div", {}, h("h1", { class: "nl-title", text: "nine lives" }), h("p", { class: "nl-sub", text: "it's 3am. the house is asleep. tuft is not." }))),
      h("p", { class: "nl-sub", text: "roll dice, slot them into moves, and get through the living room, the kitchen and the bathroom to the warm laundry pile. every coat plays differently." }),
      coats,
      save.run ? btn("CONTINUE", `${N.ROOMS[save.run.room].name} · ${Math.ceil(save.run.hp / 3)} lives left`, () => { S = save.run; r = gk.rng(Date.now() % 1e9); nextNode(); }, "primary") : null,
      btn(save.run ? "NEW RUN (abandon current)" : "NEW RUN", `as ${save.coat}`, newRun, save.run ? "" : "primary"),
      btn("HOW TO PLAY", null, howTo),
      btn("BACK TO THE ARCADE", null, () => { location.href = "/arcade"; }),
      h("p", { class: "nl-sub", style: { fontSize: "12px" } }, "a catnet game by cole · ", h("a", { href: cn.CREDIT.url, target: "_blank", rel: "noopener", style: { color: "inherit" }, text: cn.CREDIT.label })),
      h("p", { class: "nl-sub", style: { marginTop: "18px" }, text: `best ${save.best} · ${save.wins}/${save.runs} runs won` }),
      lb);
  }

  function howTo() {
    cn.sheet((box, close) => box.append(
      h("h2", { text: "how to play" }),
      h("ol", { style: { paddingLeft: "18px", lineHeight: "1.7" } },
        h("li", { text: "each turn you roll your dice." }),
        h("li", { text: "tap a die, then tap a move. the badge on a move says which dice it accepts (5+, even, 2-, pair…). each move works once per turn." }),
        h("li", { text: "the speech bubble shows what the enemy will do next. block before big hits." }),
        h("li", { text: "end your turn when you're out of useful dice. leftover dice are lost." }),
        h("li", { text: "after a fight, pick a reward. bosses guard each room. you have nine lives — each heart is one life (3 hp)." })),
      h("div", { class: "actions" }, h("button", { class: "btn", text: "got it", onclick: () => close() }))));
  }

  function newRun() {
    r = gk.rng(Date.now() % 1e9);
    S = N.newRun(save.coat, Date.now() % 1e9, r);
    save.run = S;
    save.runs++;
    persist(true);
    nextNode();
  }

  function nextNode() {
    if (S.over) return finish();
    const node = N.currentNode(S);
    save.run = S;
    persist();
    if (node === "event") return event();
    fight();
  }

  function fight() {
    N.startFight(S, r);
    sel = null; pairFor = null; busy = false;
    ui = {};
    ui.hearts = h("div", { class: "nl-hearts", "aria-label": "lives" });
    ui.tuft = tuftEl("idle");
    ui.enemy = enemyCanvas(S.enemy.id);
    ui.hp = h("div", { class: "nl-hp" }, h("i"));
    ui.intent = h("div", { class: "nl-intent", "aria-live": "polite" });
    ui.pblock = h("div", { class: "nl-badge block", style: { left: "10px", top: "10px" }, hidden: true });
    ui.eblock = h("div", { class: "nl-badge block", style: { right: "10px", bottom: "56px" }, hidden: true });
    ui.arena = h("div", { class: "nl-arena" },
      h("div", { class: "nl-side" }, ui.tuft.el, h("div", { class: "nl-name", text: S.coat })),
      h("div", { class: "nl-side" }, ui.enemy, ui.hp, h("div", { class: "nl-name", text: S.enemy.name })),
      ui.intent, ui.pblock, ui.eblock);
    ui.log = h("div", { class: "nl-log", "aria-live": "polite" });
    ui.dice = h("div", { class: "nl-dice" });
    ui.kit = h("div", { class: "nl-kit" });
    ui.end = btn("END TURN", null, endTurn, "primary");
    screen(hud(), ui.hearts, ui.arena, ui.log, ui.dice, ui.kit, h("div", { class: "nl-end" }, ui.end));
    if (S.enemy.boss) { sfx.boss(); say(`${S.enemy.name} blocks the way.`); }
    else say(`${S.enemy.name} appears.`);
    render(true);
  }

  function hud() {
    const track = h("div", { class: "nl-track" }, N.ROOMS.flatMap((room, ri) => N.NODES.map((n, ni) => {
      const done = ri < S.room || (ri === S.room && ni < S.node);
      const here = ri === S.room && ni === S.node;
      return h("span", { class: done ? "done" : here ? "here" : "", title: n, text: n === "boss" ? "☠" : n === "event" ? "?" : "·" });
    })));
    return h("div", { class: "nl-hud" }, h("span", { class: "room", text: N.ROOMS[Math.min(S.room, 2)].name }), track,
      h("button", { class: "menu", text: "menu", onclick: menu }));
  }
  function menu() {
    cn.sheet((box, close) => box.append(h("h2", { text: "paused" }),
      h("p", { class: "dim", text: "your run is saved at the start of every fight." }),
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", text: gk.muted() ? "sound off" : "sound on", onclick: (e) => { gk.setMute(!gk._mute); e.target.textContent = gk.muted() ? "sound off" : "sound on"; } }),
        h("button", { class: "btn ghost", text: "quit to title", onclick: () => { close(); title(); } }),
        h("button", { class: "btn", text: "resume", onclick: () => close() }))));
  }

  function say(t) { if (ui.log) ui.log.textContent = t; }
  function intentText(it) {
    switch (it.k) {
      case "atk": return h("span", {}, "will attack ", h("b", { text: (it.n > 1 ? `${it.v}×${it.n}` : String(it.v)) }), S.enemy.weak ? ` (−${S.enemy.weak})` : "");
      case "blk": return h("span", {}, "will block ", h("b", { text: String(it.v) }));
      case "wet": return "will spray you: your best die becomes a 1";
      case "suck": return "will suck up one of your dice";
      case "heat": return "will blast hot air: one fewer die";
      case "fright": return "will stare at you: 4+ moves locked";
      case "fetch": return "will steal your best attack for a turn";
      case "wind": return "is winding up something big…";
      default: return it.k;
    }
  }

  function render(rolling) {
    const lives = Math.ceil(S.maxHp / 3);
    ui.hearts.replaceChildren(...Array.from({ length: lives }, (_, i) => heartCanvas(Math.max(0, Math.min(3, S.hp - i * 3)))));
    ui.hp.firstChild.style.width = (S.enemy.hp / S.enemy.maxHp) * 100 + "%";
    ui.intent.replaceChildren(intentText(S.enemy.intent));
    ui.pblock.hidden = !S.block;
    ui.pblock.textContent = "◆ " + S.block;
    ui.eblock.hidden = !S.enemy.block;
    ui.eblock.textContent = "◆ " + S.enemy.block;
    ui.dice.replaceChildren(...(S.rolled.length ? S.rolled.map((v, i) => {
      const d = die(v, (sel === i ? "sel " : "") + (rolling ? "rolling" : ""));
      d.addEventListener("click", () => tapDie(i));
      return d;
    }) : [h("span", { class: "none", text: "no dice left — end your turn." })]));
    ui.kit.replaceChildren(...S.kit.map((k, ai) => {
      const def = N.ABILITIES[k.id], c = N.condOf(k.id, k.lvl);
      const used = S.used.includes(ai), locked = S.locked.includes(ai);
      const ok = sel != null && !used && !locked && N.canUse(S, ai, sel);
      const card = h("button", {
        class: "nl-card" + (used ? " used" : "") + (locked ? " locked" : "") + (ok ? " ok" : "") + (pairFor === ai ? " waiting" : ""),
        "aria-label": `${def.name}, accepts ${N.condLabel(c)}: ${def.text(k.lvl)}`,
        onclick: () => tapMove(ai),
      }, h("span", { class: "nm" }, def.name, k.lvl > 1 ? h("sup", { text: " +" }) : null), h("span", { class: "cond", text: N.condLabel(c) }), h("span", { class: "tx", text: def.text(k.lvl).replace("■", sel != null ? String(S.rolled[sel]) : "■") }));
      return card;
    }));
    ui.end.disabled = busy;
  }

  function tapDie(i) {
    if (busy) return;
    sfx.tap();
    if (pairFor != null) {
      const ai = pairFor;
      pairFor = null;
      const first = sel;
      sel = null;
      if (i !== first && S.rolled[i] === S.rolled[first]) return act(ai, first, i);
      say("zoomies need two dice showing the same number.");
      return render();
    }
    sel = sel === i ? null : i;
    render();
  }
  function tapMove(ai) {
    if (busy) return;
    if (sel == null) { say("pick a die first, then a move."); return; }
    const k = S.kit[ai];
    if (N.condOf(k.id, k.lvl) === "pair") {
      if (!N.canUse(S, ai, sel)) return;
      pairFor = ai;
      say("now tap a second die with the same number.");
      return render();
    }
    if (!N.canUse(S, ai, sel)) { say(`${N.ABILITIES[k.id].name} only takes ${N.condLabel(N.condOf(k.id, k.lvl))}.`); return; }
    act(ai, sel);
  }

  function floatText(text, color, onEnemy) {
    const rect = ui.arena.getBoundingClientRect();
    const el = h("div", { class: "nl-float", text, style: { color, left: (onEnemy ? rect.width * 0.7 : rect.width * 0.22) + "px", top: "70px" } });
    ui.arena.append(el);
    setTimeout(() => el.remove(), 900);
  }

  function act(ai, d1, d2) {
    const name = N.ABILITIES[S.kit[ai].id].name;
    const ev = N.use(S, ai, d1, r, d2);
    sel = null;
    if (!ev) return render();
    const parts = [];
    for (const e of ev) {
      if (e.t === "hit") {
        sfx.hit();
        ui.tuft.play("happy", 700);
        ui.enemy.classList.remove("nl-shake", "nl-flash");
        void ui.enemy.offsetWidth;
        ui.enemy.classList.add("nl-shake", "nl-flash");
        floatText(e.blocked ? `-${e.v} (${e.blocked} blocked)` : `-${e.v}`, "#ff7a8a", true);
        parts.push(`${name} hits for ${e.v}`);
      } else if (e.t === "block") { sfx.block(); floatText(`◆${e.v}`, "#8fc7ff"); parts.push(`${name}: +${e.v} block`); }
      else if (e.t === "heal") { sfx.heal(); ui.tuft.play("happy", 700); floatText(`+${e.v}`, "#9ff0c0"); parts.push(`${name} heals ${e.v}`); }
      else if (e.t === "reroll") { sfx.roll(); parts.push(`kneaded a ${e.from} into a ${e.to}`); }
      else if (e.t === "weak") parts.push(`next hit −${e.v}`);
    }
    say(parts.join(" · "));
    if (ev.some((e) => e.t === "kill")) return victory();
    render(ev.some((e) => e.t === "reroll"));
    if (S.turnOver) setTimeout(endTurn, 500);
  }

  function endTurn() {
    if (busy || !S || !S.enemy) return;
    busy = true;
    sel = null; pairFor = null;
    render();
    setTimeout(() => {
      const ev = N.enemyAct(S, r);
      const parts = [];
      for (const e of ev) {
        if (e.t === "hurt") {
          if (e.v) { sfx.hurt(); ui.tuft.play("confused", 900); ui.hearts.classList.remove("flash"); void ui.hearts.offsetWidth; ui.hearts.classList.add("flash"); floatText(`-${e.v}`, "#ff7a8a"); }
          else sfx.block();
          parts.push(e.blocked ? `${S.enemy.name} hits ${e.v} (${e.blocked} blocked)` : `${S.enemy.name} hits ${e.v}`);
        } else if (e.t === "eblock") parts.push(`${S.enemy.name} braces (${e.v} block)`);
        else if (e.t === "wind") { parts.push(`${S.enemy.name} winds up…`); ui.tuft.play("surprised", 900); }
        else if (e.t === "status") { parts.push({ wet: "splash! your best die will be a 1", suck: "one of your dice got vacuumed", heat: "too hot: one fewer die", fright: "tuft is spooked: 4+ moves locked", fetch: "the dog runs off with a move" }[e.k]); ui.tuft.play("surprised", 900); }
        else if (e.t === "dead") parts.push("tuft runs out of lives…");
      }
      ui.arena.classList.remove("nl-shake");
      void ui.arena.offsetWidth;
      if (ev.some((e) => e.t === "hurt" && e.v)) ui.arena.classList.add("nl-shake");
      say(parts.join(" · "));
      busy = false;
      if (S.over) return setTimeout(finish, 900);
      sfx.roll();
      render(true);
    }, 450);
  }

  function victory() {
    busy = true;
    sfx.kill();
    ui.tuft.play("happy");
    ui.enemy.style.transition = "transform .5s, opacity .5s";
    ui.enemy.style.transform = "scale(0) rotate(90deg)";
    ui.enemy.style.opacity = "0";
    const boss = N.winFight(S);
    if (boss && S.room === 1 && !save.coats.includes("ginger")) { save.coats.push("ginger"); setTimeout(() => cn.toast("new coat unlocked: ginger"), 600); }
    setTimeout(() => (S.over ? finish() : reward(boss)), 900);
  }

  function rewardCard(rw) {
    if (rw.t === "learn") { const d = N.ABILITIES[rw.id]; return [`learn ${d.name}`, `accepts ${N.condLabel(N.condOf(rw.id, 1))}: ${d.text(1)}`]; }
    if (rw.t === "upgrade") { const d = N.ABILITIES[rw.id]; return [`sharpen ${d.name}`, `${N.condLabel(N.condOf(rw.id, 2))}: ${d.text(2)}`]; }
    if (rw.t === "die") return ["an extra die", "roll one more die every turn"];
    if (rw.t === "life") return ["a ninth-and-a-half life", "+1 max life, and heal it"];
    return ["a nap", `heal ${rw.v || 5}`];
  }
  function reward(boss) {
    busy = false;
    const choices = N.rewards(S, r);
    screen(hud(),
      h("div", { class: "nl-banner" }, tuftEl("happy", 1.2).el, h("h2", { style: { color: "var(--n-lamp)" }, text: boss ? `${N.ROOMS[S.room - 1] ? N.ROOMS[S.room - 1].name : "room"} cleared` : "nice." }),
        h("p", { class: "nl-sub", text: boss ? "tuft naps in the doorway (+1 life) and moves on." : "pick something to take with you." })),
      h("div", { class: "nl-pick" }, choices.map((rw) => {
        const [t, d] = rewardCard(rw);
        return h("button", { class: "nl-card", onclick: () => { sfx.heal(); N.takeReward(S, rw); nextNode(); } }, h("span", { class: "nm", text: t }), h("span", { class: "tx", text: d }));
      })));
  }

  function event() {
    const key = S.events[S.room], ev = N.EVENTS[key];
    screen(hud(),
      h("div", { class: "nl-banner" }, tuftEl("curious", 1.3).el, h("h2", { style: { color: "var(--n-lamp)" }, text: ev.name }), h("p", { class: "nl-sub", text: ev.text })),
      h("div", { class: "nl-pick" }, ev.choices.map(([label, fn]) => h("button", { class: "nl-card", onclick: () => {
        sfx.heal();
        fn(S);
        if (S.pendingUpgrade) return upgradePick();
        N.advanceEvent(S);
        nextNode();
      } }, h("span", { class: "nm", text: label })))));
  }
  function upgradePick() {
    S.pendingUpgrade = false;
    const opts = S.kit.filter((k) => k.lvl < 2);
    if (!opts.length) { N.advanceEvent(S); return nextNode(); }
    screen(hud(), h("div", { class: "nl-banner" }, h("h2", { style: { color: "var(--n-lamp)" }, text: "which move?" })),
      h("div", { class: "nl-pick" }, opts.map((k) => {
        const d = N.ABILITIES[k.id];
        return h("button", { class: "nl-card", onclick: () => { N.upgrade(S, k.id); N.advanceEvent(S); nextNode(); } },
          h("span", { class: "nm", text: d.name + " +" }), h("span", { class: "tx", text: `${N.condLabel(N.condOf(k.id, 2))}: ${d.text(2)}` }));
      })));
  }

  async function finish() {
    const won = S.won, score = N.score(S), coat = S.coat, room = S.room;
    if (won) save.wins++;
    if (won && !save.coats.includes("midnight")) save.coats.push("midnight");
    save.best = Math.max(save.best, score);
    save.run = null;
    persist(true);
    const res = await gk.score("nine", score, won ? `won as ${coat}` : `fell in ${N.ROOMS[Math.min(room, 2)].name}`);
    screen(
      h("div", { class: "nl-banner" }, tuftEl(won ? "sleep" : "confused", 1.6).el,
        h("h2", { style: { color: won ? "var(--n-good)" : "var(--n-hurt)" }, text: won ? "the laundry pile." : "out of lives." }),
        h("p", { class: "nl-sub", text: won ? "warm, soft, smells like everyone. tuft curls up and the house is quiet. victory." : "tuft retreats under the sofa to regroup. the night is long. try again." })),
      h("p", { style: { textAlign: "center", fontSize: "18px" } }, "score ", h("b", { style: { color: "var(--n-lamp)" }, text: String(score) })),
      won && save.coats.includes("midnight") ? h("p", { class: "nl-sub", style: { textAlign: "center" }, text: "midnight coat available." }) : null,
      res ? gk.boardTable(res.nine, h) : null,
      btn("ANOTHER NIGHT", null, newRun, "primary"), btn("TITLE", null, title));
  }

  window.__nine = { state: () => S, act, endTurn, tapDie, tapMove };
  title();
})();
