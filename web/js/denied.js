// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { h } = cn;
  const R = window.DENIED, A = window.DENIED_ART;
  const root = document.getElementById("game");
  await cn.boot({ page: "arcade", shell: false, manualPulse: true });

  function normalize(s) {
    s = s && typeof s === "object" ? s : {};
    s.v = 1;
    s.meta = Object.assign({ endings: [], lore: [], best: 0, endless: false, runs: 0, endlessBest: 0 }, s.meta || {});
    if (!s.run || typeof s.run !== "object") s.run = null;
    return s;
  }
  let save = normalize(await gk.load("denied"));
  const persist = (now) => gk.save("denied", save, now);
  function unlockLore(key) {
    if (!save.meta.lore.includes(key)) { save.meta.lore.push(key); persist(); return true; }
    return false;
  }

  const sfx = {
    stamp() { gk.noise(0.2, { freq: 420, vol: 0.55 }); gk.tone(120, 0.18, { type: "sine", slide: 40, vol: 0.45 }); gk.vibrate(35); },
    ok() { gk.tone(660, 0.08, { type: "triangle", vol: 0.1 }); gk.tone(990, 0.14, { type: "triangle", vol: 0.08, delay: 0.08 }); },
    bad() { gk.tone(140, 0.5, { type: "square", vol: 0.1 }); gk.tone(133, 0.5, { type: "square", vol: 0.08 }); gk.vibrate([60, 40, 60]); },
    paper() { gk.noise(0.09, { filter: "highpass", freq: 2600, vol: 0.1 }); },
    tick() { gk.tone(1900, 0.02, { type: "square", vol: 0.025 }); },
    bell() { [523, 659, 784].forEach((f, i) => gk.tone(f, 0.6, { type: "sine", vol: 0.1, delay: i * 0.2 })); },
    step() { gk.noise(0.05, { freq: 260, vol: 0.18 }); gk.noise(0.05, { freq: 260, vol: 0.14, delay: 0.24 }); },
    found() { gk.tone(520, 0.07, { vol: 0.09 }); gk.tone(390, 0.14, { vol: 0.09, delay: 0.07 }); },
    clear() { gk.tone(300, 0.06, { type: "triangle", vol: 0.05 }); },
    blip() { gk.tone(820 + Math.random() * 120, 0.012, { type: "square", vol: 0.012 }); },
    alarm() { for (let i = 0; i < 3; i++) gk.tone(880, 0.18, { type: "sawtooth", vol: 0.05, delay: i * 0.3, slide: 600 }); },
  };
  let hum = null;
  function setHum(level) {
    document.body.style.setProperty("--hum", Math.max(0, (level - 4) / 3).toFixed(2));
    const a = gk.audio();
    if (!a || gk.muted()) return;
    if (!hum) {
      const g = a.createGain();
      g.gain.value = 0;
      g.connect(gk.out());
      const o1 = a.createOscillator(), o2 = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain();
      o1.type = "sine"; o1.frequency.value = 55;
      o2.type = "triangle"; o2.frequency.value = 41; // the 41 Hz carrier from the lore
      lfo.frequency.value = 0.13; lg.gain.value = 2.5;
      lfo.connect(lg).connect(o2.frequency);
      o1.connect(g); o2.connect(g);
      o1.start(); o2.start(); lfo.start();
      hum = { g };
    }
    hum.g.gain.setTargetAtTime(level ? 0.02 + level * 0.011 : 0, a.currentTime, 1.5);
  }

  let S = null;        // current shift
  let clockTimer = 0;
  const run = () => save.run;
  const wide = () => matchMedia("(min-width: 860px)").matches;
  function stopTimers() { clearInterval(clockTimer); clockTimer = 0; }
  function screen(...kids) {
    stopTimers();
    S = null;
    root.replaceChildren(h("div", { class: "dn-screen" }, ...kids));
    scrollTo(0, 0);
  }
  function btn(label, sub, fn, cls = "") {
    return h("button", { class: "dn-btn " + cls, onclick: () => { gk.audio(); sfx.paper(); fn(); } }, label, sub ? h("small", { text: sub }) : null);
  }
  function sheet(title, build, opts = {}) {
    return new Promise((resolve) => {
      const wrap = h("div", { class: "dn-sheet" });
      const box = h("div", { class: "box", role: "dialog", "aria-label": title });
      const close = (v) => { wrap.remove(); if (S) S.paused = false; resolve(v); };
      if (S) S.paused = true;
      box.append(h("h3", { text: title }));
      build(box, close);
      wrap.append(box);
      if (!opts.modal) wrap.addEventListener("click", (e) => { if (e.target === wrap) close(null); });
      document.body.append(wrap);
    });
  }
  const pickLine = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const flags = () => run().flags;
  function needs(key) {
    if (!key) return true;
    if (key === "static2") return run().static >= 2;
    if (key === "static3") return run().static >= 3;
    return !!flags()[key];
  }

  function title() {
    setHum(0);
    const m = save.meta, r = save.run;
    const lb = h("div", {}, h("p", { class: "dn-dim", text: "loading the duty roster…" }));
    gk.board("denied").then((b) => lb.replaceChildren(gk.boardTable(b, h)));
    screen(
      h("span", { class: "dn-tag", text: "FACILITY 09 // PERSONNEL DIVISION" }),
      h("h1", { class: "dn-title" }, "DENIED", h("span", { class: "dot", text: "." })),
      h("p", { class: "dn-p", text: "You've been assigned to intake control. Verify credentials. Follow regulations. Do not ask unnecessary questions." }),
      h("p", { class: "dn-p dn-dim", text: "The facility is not responsible for anything you may witness during your shift." }),
      r ? btn(`CONTINUE — DAY ${r.day}`, `₵${r.credits} · ${r.citations} citations on record`, dayIntro, "primary") : null,
      btn(r ? "NEW EMPLOYMENT" : "BEGIN EMPLOYMENT", r ? "abandons your current week" : "seven shifts at checkpoint C", async () => {
        if (r && !(await cn.ask("start over?", "your current week at facility 09 will be lost. endings and archive files stay unlocked.", "start over", true))) return;
        newRun();
      }, r ? "" : "primary"),
      m.endless ? btn("ENDLESS SHIFT", `best: ${m.endlessBest} · three mistakes and you're out`, () => startShift(true)) : btn("ENDLESS SHIFT", "unlocks after you reach any ending", () => {}, ""),
      btn("ARCHIVE", `${m.endings.length}/8 endings · ${m.lore.length}/8 files`, archive),
      btn("HOW TO INSPECT", null, howTo),
      btn("RETURN TO CATNET", null, () => { location.href = "/arcade"; }),
      h("p", { class: "dn-dim", style: { fontSize: "11px", letterSpacing: ".15em" } }, "A CATNET GAME BY COLE · ", h("a", { href: cn.CREDIT.url, target: "_blank", rel: "noopener", style: { color: "inherit" }, text: cn.CREDIT.label.toUpperCase() })),
      h("p", { class: "dn-dim", style: { marginTop: "22px", fontSize: "12px", letterSpacing: ".15em" }, text: "DUTY ROSTER (HIGH SCORES)" }),
      lb);
    if (!m.endless) root.querySelectorAll(".dn-btn")[r ? 2 : 1].disabled = true;
  }

  function howTo() {
    return sheet("HOW TO INSPECT", (box, close) => box.append(
      h("ol", { class: "dn-p", style: { paddingLeft: "18px" } },
        h("li", { text: "Each entrant hands over documents. Flip through them in the tray." }),
        h("li", { text: "Read the RULE BOOK. New rules arrive every morning." }),
        h("li", { text: "Press INSPECT, then tap two things that should agree: a field and another field, a date and today's date (top bar), a photo and the entrant's face, a seal and the seal page, a field and a rule." }),
        h("li", { text: "Discrepancies you find can be raised with ASK. Some entrants lie about why they're here — ask them, then compare their answer with the permit." }),
        h("li", { text: "APPROVE, DENY, or (from day 4) DETAIN anyone on the watchlist. Wrong calls earn citations. Three free per day, then they cost you." }),
        h("li", { text: "The clock runs. Rent is due every night." })),
      h("button", { class: "dn-btn primary", text: "UNDERSTOOD", onclick: () => close() })));
  }

  function archive() {
    const m = save.meta;
    const endings = Object.entries(R.ENDINGS);
    screen(
      h("span", { class: "dn-tag", text: "ARCHIVE // RESTRICTED" }),
      h("h2", { class: "dn-title", style: { fontSize: "40px" }, text: "ARCHIVE" }),
      h("p", { class: "dn-dim", text: "ENDINGS" }),
      h("ul", { class: "dn-files" }, endings.map(([k, e]) => m.endings.includes(k)
        ? h("li", {}, h("button", { class: "dn-btn", text: e.title, onclick: () => sheet(e.title, (b, c) => b.append(h("p", { class: "dn-p", text: e.text }), h("button", { class: "dn-btn", text: "CLOSE", onclick: () => c() }))) }))
        : h("li", { class: "locked", text: "▮▮▮▮▮▮▮▮ — not yet reached" }))),
      h("p", { class: "dn-dim", text: "PERSONNEL & EVIDENCE FILES" }),
      h("ul", { class: "dn-files" }, Object.entries(R.LORE).map(([k, f]) => m.lore.includes(k)
        ? h("li", {}, h("button", { class: "dn-btn", text: f.title, onclick: () => sheet(f.title, (b, c) => b.append(h("p", { class: "dn-p", style: { whiteSpace: "pre-wrap" }, text: f.body }), h("button", { class: "dn-btn", text: "CLOSE", onclick: () => c() }))) }))
        : h("li", { class: "locked", text: "▮▮▮▮▮▮ — sealed" }))),
      btn("BACK", null, title));
  }

  function newRun() {
    save.run = { day: 1, credits: 20, suspicion: 0, static: 0, flags: {}, citations: 0, broke: 0, tuft: 0, correct: 0, seed: (Date.now() % 1e9) | 0 };
    save.meta.runs++;
    unlockLore("orientation");
    persist(true);
    dayIntro();
  }

  function dayIntro() {
    const r = run(), rules = R.dayRules(r.day);
    setHum(r.day);
    const memos = [];
    if (r.day === 2 && r.flags.pell_helped) memos.push("An expired permit was accepted at Checkpoint C yesterday. This has been noted. — Hesk");
    if (r.day === 3) unlockLore("spores");
    if (r.day === 4) unlockLore("directive");
    if (r.day >= 5 && r.suspicion >= 60) memos.push("Internal Audit will be observing Checkpoint C. Behave normally.");
    if (r.day === 6 && r.flags.kip_hidden) memos.push("Kip is curled up under the desk again. You'll have to work around small feet.");
    if (r.day === 7) memos.push("Final shift of the audit week. Your file will be reviewed tonight.");
    screen(
      h("span", { class: "dn-tag", text: `DAY ${r.day} — ${rules.weekday} ${R.fmtDate(rules.today)}` }),
      h("div", { class: "dn-news" },
        h("div", { class: "mast" }, h("span", { text: "THE VALLEY COURIER" }), h("span", { text: R.fmtDate(rules.today) })),
        h("h2", { text: R.HEADLINES[r.day - 1](Object.assign({ static: r.static }, r.flags)) })),
      h("div", { class: "dn-bulletin" }, h("b", { text: "MORNING BULLETIN" }), h("ul", {}, rules.bulletin.map((b) => h("li", { text: b })))),
      memos.length ? h("div", { class: "dn-bulletin", style: { marginTop: "10px" } }, h("b", { text: "MEMO" }), memos.map((m) => h("p", { text: m }))) : null,
      h("p", { class: "dn-dim", text: `credits ₵${r.credits} · citations on record ${r.citations} · rent due tonight ₵15${r.day >= 3 ? " + heat ₵5" : ""}` }),
      btn("BEGIN SHIFT →", null, () => startShift(false), "primary"),
      btn("BACK TO TITLE", null, title));
  }

  function buildQueue(rules, r, endless) {
    const n = endless ? 400 : rules.quota + 8;
    const q = Array.from({ length: n }, () => ({}));
    if (!endless) {
      for (const s of R.STORY[rules.n] || []) if (needs(s.needs)) q.splice(s.at, 0, { story: s });
    }
    if (rules.watch) {
      const list = S.watch;
      const count = endless ? 0 : 1 + (r.chance(0.5) ? 1 : 0);
      for (let i = 0; i < count; i++) q.splice(3 + r.int(rules.quota - 3), 0, { watch: list[r.int(list.length)] });
    }
    return q;
  }

  function startShift(endless) {
    stopTimers();
    let rules, r;
    if (endless) {
      rules = Object.assign({}, R.dayRules(7), { n: 7, watch: 3 });
      r = gk.rng(Date.now() % 1e9);
    } else {
      rules = R.dayRules(run().day);
      r = gk.rng(run().seed + run().day * 7777);
    }
    S = {
      rules, r, endless, idx: -1, clock: 0, citations: [], correct: 0, processed: 0, bribes: 0, over: false, cur: null,
      found: new Set(), transcript: [], inspect: false, pick: null, view: "permit", bookPage: "rules", busy: true, ready: false, paused: false,
      watch: R.watchlist(r, rules), endlessCount: 0,
    };
    S.queue = buildQueue(rules, r, endless);
    layout();
    setHum(endless ? 5 : run().day);
    nextVisitor();
    let lastHour = 0;
    clockTimer = setInterval(() => {
      if (!S || S.paused || document.hidden || S.endless) return;
      S.clock += 540 / 170;
      const hour = Math.floor(S.clock / 60);
      if (hour !== lastHour) { lastHour = hour; sfx.tick(); }
      if (S.clock >= 540 && !S.over) {
        S.over = true;
        sfx.bell();
        say("…and that's the bell. Last one for today.", true);
        if (!S.cur) endShift();
      }
      hud();
    }, 1000);
  }

  let els = {};
  function layout() {
    els = {};
    els.hud = h("div", { class: "dn-hud" });
    els.who = h("div", { class: "who enter" });
    els.say = h("div", { class: "dn-say empty", "aria-live": "polite", onclick: () => { if (els.say._full) { clearInterval(els.say._t); els.say.textContent = els.say._full; } } });
    els.queue = h("div", { class: "queue" });
    els.booth = h("div", { class: "dn-booth" }, els.queue, els.who, els.say);
    els.tray = h("div", { class: "dn-tray", role: "tablist" });
    els.paneL = h("div", { class: "dn-pane" });
    els.paneR = h("div", { class: "dn-pane" });
    els.desk = h("div", { class: "dn-desk" }, els.tray, els.paneL, els.paneR);
    els.actions = h("div", { class: "dn-actions" });
    root.replaceChildren(els.hud, els.booth, els.desk, els.actions);
    root.onclick = onPick;
    addEventListener("resize", onResize);
    hud();
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S && S.cur) renderDesk(); }, 150); }

  function hud() {
    if (!S || !els.hud) return;
    const mins = Math.min(540, Math.floor(S.clock));
    const hh = String(8 + Math.floor(mins / 60)).padStart(2, "0"), mm = String(mins % 60).padStart(2, "0");
    const cits = S.citations.length;
    els.hud.replaceChildren(
      h("span", {}, S.endless ? "ENDLESS" : "DAY ", h("b", { text: S.endless ? "" : String(S.rules.n) })),
      h("span", { "data-ref": "TODAY", title: "today's date (inspectable)" }, h("b", { text: R.fmtDate(S.rules.today) })),
      S.endless ? null : h("span", { class: "clock", text: `${hh}:${mm}` }),
      S.endless ? h("span", {}, "CLEARED ", h("b", { text: String(S.correct) })) : h("span", {}, "₵", h("b", { text: String(run().credits) })),
      h("span", { class: "cit", title: `${cits} citation${cits === 1 ? "" : "s"} today`, "aria-label": `${cits} citations today` },
        Array.from({ length: Math.max(3, cits) }, (_, i) => h("i", { class: i < cits ? "on" : "" }))),
      h("button", { class: "menu", text: "II", "aria-label": "pause menu", onclick: pauseMenu }));
  }

  async function pauseMenu() {
    await sheet("PAUSED", (box, close) => box.append(
      h("button", { class: "dn-btn primary", text: "RESUME", onclick: () => close() }),
      h("button", { class: "dn-btn", text: "HOW TO INSPECT", onclick: () => { close(); howTo(); } }),
      h("button", { class: "dn-btn", text: gk.muted() ? "SOUND: OFF" : "SOUND: ON", onclick: (e) => { gk.setMute(!gk._mute); e.target.textContent = gk.muted() ? "SOUND: OFF" : "SOUND: ON"; } }),
      h("button", { class: "dn-btn", text: S && S.endless ? "END ENDLESS SHIFT" : "QUIT TO TITLE (today restarts)", onclick: () => { close(); if (S && S.endless) endEndless(); else title(); } })));
  }

  function makeCurrent(slot) {
    const { rules, r } = S;
    let v;
    if (slot.story) {
      const s = slot.story;
      if (s.key === "tuft") {
        v = { first: "TUFT", last: "", name: "TUFT", species: "cat", traits: { species: "cat" }, docs: {}, statedPurpose: "…", forged: [], watch: false, story: "tuft", personality: "cheerful", tuft: true };
      } else {
        v = R.generate(r, rules, { clean: true, overrides: Object.assign({ story: s.key }, s.overrides || {}) });
        v.story = s.key;
        if (s.tweak) s.tweak(v, rules.today, rules);
      }
      v.script = s;
    } else if (slot.watch) {
      v = R.generate(r, rules, { watch: slot.watch });
    } else {
      if (S.endless) rules.seals = r.shuffle([0, 1, 2, 3, 4, 5]).slice(0, 3).sort();
      v = R.generate(r, rules);
    }
    return v;
  }

  function nextVisitor() {
    if (!S) return;
    if (S.over) return endShift();
    S.idx++;
    if (S.idx >= S.queue.length) return endShift();
    if (S.endless && S.idx % 6 === 0 && S.idx) S.rules.seals = S.r.shuffle([0, 1, 2, 3, 4, 5]).slice(0, 3).sort();
    const v = makeCurrent(S.queue[S.idx]);
    S.cur = v;
    S.found = new Set();
    S.transcript = [];
    S.pick = null;
    S.asked = {};
    S.ready = false;
    S.busy = false;
    S.view = v.docs.permit ? "permit" : "id";
    els.queue.textContent = S.endless ? `ENTRANT ${S.idx + 1}` : `ENTRANT ${S.idx + 1} · QUEUE ${Math.max(0, S.queue.length - S.idx - 1)}`;
    const portrait = A.portrait(v.traits, wide() ? 4 : 3, v.tuft ? { tuft: true } : {});
    portrait.setAttribute("data-ref", "FACE");
    portrait.title = "the entrant (inspectable)";
    els.who.className = "who enter";
    els.who.replaceChildren(portrait);
    sfx.step();
    setTimeout(() => {
      if (!S || S.cur !== v) return;
      els.who.className = "who";
      S.ready = true;
      const s = v.script || {};
      say(s.greet || pickLine(R.LINES[v.personality].greet));
      renderActions();
    }, 520);
    renderDesk();
    renderActions();
    hud();
  }

  function say(text, system) {
    const el = els.say;
    if (!el) return;
    clearInterval(el._t);
    el.classList.remove("empty");
    el.style.background = system ? "var(--d-lamp)" : "";
    el._full = text;
    el.textContent = "";
    const span = h("span", { class: "typed" });
    el.append(span);
    let i = 0;
    el._t = setInterval(() => {
      i += 2;
      span.textContent = text.slice(0, i);
      if (i % 4 === 0) sfx.blip();
      if (i >= text.length) { clearInterval(el._t); el.textContent = text; }
    }, 28);
  }

  const F = (label, ref, value) => h("span", { class: "f", "data-ref": ref }, label, h("b", { text: String(value) }));
  function trayKinds() {
    const ru = S.rules, kinds = ["id", "permit"];
    if (ru.work) kinds.push("work");
    if (ru.healthFor) kinds.push("health");
    if (ru.badgeFor.length) kinds.push("badge");
    if (S.transcript.length) kinds.push("talk");
    if (!wide()) kinds.push("book");
    return kinds;
  }
  const TRAY_LABEL = { id: "ID", permit: "PERMIT", work: "WORK ORDER", health: "HEALTH", badge: "BADGE", talk: "TRANSCRIPT", book: "RULE BOOK" };

  function renderDesk() {
    if (!S || !S.cur) return;
    const kinds = trayKinds();
    if (!kinds.includes(S.view)) S.view = "permit";
    els.tray.replaceChildren(...kinds.map((k) => h("button", {
      role: "tab", "aria-selected": S.view === k ? "true" : "false",
      class: (S.view === k ? "on " : "") + (["id", "permit", "work", "health", "badge"].includes(k) && !S.cur.docs[k] ? "missing" : ""),
      text: TRAY_LABEL[k], onclick: (e) => { e.stopPropagation(); S.view = k; sfx.paper(); renderDesk(); },
    })));
    els.paneL.replaceChildren(docEl(S.view));
    els.paneR.replaceChildren(wide() ? bookEl() : "");
    els.paneR.hidden = !wide();
    els.desk.classList.toggle("inspecting", S.inspect);
    els.booth.classList.toggle("inspecting", S.inspect);
    els.hud.classList.toggle("inspecting", S.inspect);
  }

  function docEl(kind) {
    const v = S.cur, d = v.docs;
    if (kind === "book") return bookEl();
    if (kind === "talk") {
      return h("div", { class: "doc transcript" }, h("div", { class: "dt" }, "INTERVIEW TRANSCRIPT", h("small", { text: "CHECKPOINT C" })),
        S.transcript.map((t) => h("p", { style: { margin: "6px 0" } }, h("span", { class: "dn-dim", style: { color: "#6b6650" }, text: "Q: " + t.q }), h("br"),
          t.ref ? h("span", { class: "f", "data-ref": t.ref, style: { display: "inline" } }, "A: ", h("b", { style: { display: "inline" }, text: t.a })) : h("span", { text: "A: " + t.a }))));
    }
    const doc = d[kind];
    if (!doc) {
      const required = kind === "id" || kind === "permit" ||
        (kind === "work" && d.permit && d.permit.purpose === "WORK") ||
        (kind === "health" && d.id && R.needsHealth(S.rules, d.id.district)) ||
        (kind === "badge" && d.permit && R.needsBadge(S.rules, d.permit.sector));
      return h("div", { class: "doc missing", "data-ref": "missing:" + kind },
        h("b", { text: `NO ${R.DOC_LABEL[kind]} PRESENTED` }),
        h("p", { text: required ? "(the rules may require one)" : "(not needed for this entrant, probably)" }));
    }
    let el;
    if (kind === "id") {
      const photo = A.portrait(doc.photo, 2, v.tuft ? { tuft: true, photo: true } : { photo: true });
      photo.classList.add("photo");
      photo.setAttribute("data-ref", "id.photo");
      el = h("div", { class: "doc id" },
        h("div", { class: "dt" }, "IDENTITY CARD", h("small", { text: "FORM I-09" })),
        h("div", { class: "grid" }, h("div", {}, photo),
          h("div", {}, F("NAME", "id.name", doc.name), F("ID NO.", "id.idno", doc.idno), F("DISTRICT", "id.district", doc.district),
            F("BORN", "id.dob", R.fmtDate(doc.dob)), F("EXPIRES", "id.expiry", R.fmtDate(doc.expiry)))));
    } else if (kind === "permit") {
      const seal = A.seal(doc.seal, 46);
      seal.setAttribute("data-ref", "permit.seal");
      el = h("div", { class: "doc permit" },
        h("div", { class: "dt" }, "ENTRY PERMIT", h("small", { text: "FORM P-12" })),
        F("AUTHORIZED NAME", "permit.name", doc.name), F("ID NO.", "permit.idno", doc.idno), F("PURPOSE", "permit.purpose", doc.purpose),
        F("SECTOR", "permit.sector", doc.sector), F("VALID UNTIL", "permit.expiry", R.fmtDate(doc.expiry)), seal);
    } else if (kind === "work") {
      el = h("div", { class: "doc work" }, h("div", { class: "dt" }, "WORK ORDER", h("small", { text: "FORM W-3" })),
        F("WORKER", "work.name", doc.name), F("EMPLOYER", "work.employer", doc.employer), F("SECTOR", "work.sector", doc.sector),
        F("DURATION", "work.weeks", doc.weeks + " WEEK" + (doc.weeks === 1 ? "" : "S")));
    } else if (kind === "health") {
      el = h("div", { class: "doc health" }, h("div", { class: "dt" }, "HEALTH SLIP", h("small", { text: "SPORE SCREENING" })),
        F("NAME", "health.name", doc.name), F("ID NO.", "health.idno", doc.idno),
        h("span", { class: "f", "data-ref": "health.result" }, "RESULT", h("b", { text: doc.result, style: { color: doc.result === "CLEAR" ? "#2f5a2a" : "#8a2a1f" } })),
        F("TESTED", "health.tested", R.fmtDate(doc.tested)));
    } else if (kind === "badge") {
      el = h("div", { class: "doc badge" }, h("div", { class: "dt" }, "CLEARANCE BADGE", h("small", { text: "LEVEL CARD" })),
        F("HOLDER", "badge.name", doc.name), F("LEVEL", "badge.level", doc.level), F("EXPIRES", "badge.expiry", R.fmtDate(doc.expiry)));
    }
    if (S.stamp && (kind === S.stamp.on)) el.append(h("div", { class: "stampmark " + S.stamp.cls, text: S.stamp.text }));
    return el;
  }

  function bookEl() {
    const ru = S.rules;
    const pages = ["rules", "districts", "seals"];
    if (ru.work) pages.push("employers");
    if (ru.watch) pages.push("watch");
    if (!pages.includes(S.bookPage)) S.bookPage = "rules";
    const tabs = h("div", { class: "book-tabs" }, pages.map((p) => h("button", {
      class: S.bookPage === p ? "on" : null, text: p.toUpperCase(), onclick: (e) => { e.stopPropagation(); S.bookPage = p; sfx.paper(); renderDesk(); },
    })));
    let body;
    if (S.bookPage === "rules") {
      const L = [];
      L.push(["rule:docs", "Every entrant must present an IDENTITY CARD and an ENTRY PERMIT."]);
      L.push([null, "Names and ID numbers must match on every document. Photos must match the face."]);
      L.push([null, "No document may be expired (compare with today's date, top bar)."]);
      L.push(["book:seals", "Permits must carry one of today's valid seals (SEALS page)."]);
      L.push(["rule:sectors", "Open sectors today: " + ru.sectors.join(", ") + "."]);
      if (ru.sectorCWork) L.push(["rule:sectorC", "Sector C admits WORK purpose only."]);
      if (ru.work) L.push(["rule:work", "WORK purpose requires a WORK ORDER: approved employer, same sector as the permit."]);
      if (ru.healthFor) L.push(["rule:health", `HEALTH SLIP required for ${ru.healthFor === "ALL" ? "EVERYONE" : ru.healthFor.join(", ") + " residents"}: result CLEAR, tested within 7 days.`]);
      if (ru.badgeFor.length) L.push(["rule:badge", `CLEARANCE BADGE required for sector ${ru.badgeFor.join("/")}: level at least the sector's level (A1 B2 C3 D4), not expired.`]);
      if (ru.vantaRevoked) L.push(["book:districts", "VANTA district ID cards are revoked."]);
      if (ru.directive) L.push(["rule:directive", `DIRECTIVE 4-L: deny all ${ru.directive} residents today.`]);
      if (ru.detain) L.push(["book:watch", "Entrants on the WATCHLIST must be DETAINED. Check faces, not names."]);
      L.push([null, "Entrants must state the same purpose as their permit when asked."]);
      body = h("ol", { style: { paddingLeft: "18px", margin: 0 } }, L.map(([ref, t]) => ref ? h("li", { "data-ref": ref, text: t }) : h("li", { text: t })));
    } else if (S.bookPage === "districts") {
      body = h("div", { "data-ref": "book:districts" }, h("p", { text: "Issuing districts:" }),
        h("ul", {}, R.DISTRICTS.map((d) => h("li", { text: d + (ru.vantaRevoked && d === "VANTA" ? " — REVOKED" : "") + (ru.directive === d ? " — DENY TODAY" : "") }))));
    } else if (S.bookPage === "seals") {
      body = h("div", { "data-ref": "book:seals" }, h("p", { text: "Valid permit seals today:" }),
        h("div", { class: "seals" }, ru.seals.map((i) => h("figure", { style: { margin: 0, textAlign: "center", fontSize: "11px" } }, A.seal(i, 54), h("div", { text: R.SEAL_NAMES[i] })))),
        h("p", { style: { fontSize: "11px" }, text: "Any other seal is a forgery." }));
    } else if (S.bookPage === "employers") {
      body = h("div", { "data-ref": "book:employers" }, h("p", { text: "Approved employers:" }), h("ul", {}, R.EMPLOYERS_OK.map((e) => h("li", { text: e }))),
        h("p", { style: { fontSize: "11px" }, text: "Watch for near-misses in spelling." }));
    } else {
      body = h("div", { "data-ref": "book:watch" }, h("p", { text: "DETAIN ON SIGHT. Names may be false. Faces are not." }),
        h("div", { class: "watch" }, S.watch.map((w) => {
          const p = A.portrait(w.traits, 2, { photo: true });
          p.classList.add("photo");
          return h("figure", {}, p, h("div", { text: `${w.last}, ${w.first}` }), h("div", { style: { color: "#8a2a1f" }, text: w.crime }));
        })));
    }
    return h("div", { class: "doc book" }, h("div", { class: "dt" }, "RULE BOOK", h("small", { text: "CHECKPOINT C" })), tabs, body);
  }

  function onPick(e) {
    if (!S || !S.inspect || !S.cur) return;
    const el = e.target.closest("[data-ref]");
    if (!el || !root.contains(el)) return;
    e.preventDefault();
    const ref = el.getAttribute("data-ref");
    if (!S.pick) {
      S.pick = { ref, el };
      el.classList.add("pick");
      sfx.paper();
      return;
    }
    if (S.pick.ref === ref) {
      S.pick.el.classList.remove("pick");
      S.pick = null;
      return;
    }
    const a = S.pick.ref;
    S.pick.el.classList.remove("pick");
    S.pick = null;
    const hit = R.inspect(S.cur, S.rules, a, ref);
    if (hit) {
      S.found.add(hit.code);
      S.foundText = S.foundText || {};
      S.foundText[hit.code] = hit.text;
      sfx.found();
      flash("DISCREPANCY", hit.text, false);
    } else {
      sfx.clear();
      flash("NO DISCREPANCY", "Those two agree, or have nothing to do with each other.", true);
    }
  }
  function flash(title, text, clear) {
    const el = h("div", { class: "dn-verdict" + (clear ? " clear" : "") }, h("b", { text: title }), text);
    document.body.append(el);
    setTimeout(() => el.remove(), clear ? 1100 : 1900);
  }

  function ask() {
    if (!S || !S.ready || S.busy) return;
    const v = S.cur, s = v.script || {}, L = R.LINES[v.personality] || R.LINES.weary;
    const qs = [];
    if (v.tuft) qs.push(["Do you have any papers?", () => "mrrp. (Tuft sits on the counter, which is not a document.)"]);
    else if (s.kid) {
      qs.push(["Where are your papers?", () => "papers? mum has all the papers. she keeps them in her coat."]);
      qs.push(["What's your mum's name?", () => "mum. her name is mum. she works with the humming machines."]);
    } else {
      qs.push(["What is the purpose of your visit?", () => L.purpose(v.statedPurpose), "STATEMENT"]);
      if (v.docs.work) qs.push(["How long will you stay?", () => L.stay(v.docs.work.weeks)]);
    }
    if (s.plea) qs.push(["Anything else I should know?", () => s.plea]);
    for (const code of S.found) {
      qs.push([`Explain this: ${S.foundText[code].replace(/\.$/, "").toLowerCase()}.`, () => pickLine((R.CONFRONT_SPECIFIC[code] || []).concat(L.confront))]);
    }
    sheet("INTERVIEW", (box, close) => box.append(...qs.map(([q, answer, ref]) =>
      h("button", { class: "dn-btn", text: q, onclick: () => {
        close();
        const a = answer();
        say(a);
        if (!S.asked[q]) { S.asked[q] = true; S.transcript.push({ q, a, ref }); }
        renderDesk();
      } })), h("button", { class: "dn-btn", text: "NEVER MIND", onclick: () => close() })));
  }

  function renderActions() {
    if (!S) return;
    const v = S.cur, s = (v && v.script) || {};
    const can = S.ready && !S.busy;
    const b = [];
    b.push(h("button", { class: "ins" + (S.inspect ? " on" : ""), text: "INSPECT", "aria-pressed": S.inspect ? "true" : "false",
      onclick: () => { S.inspect = !S.inspect; if (S.pick) { S.pick.el.classList.remove("pick"); S.pick = null; } renderDesk(); renderActions(); } }));
    b.push(h("button", { class: "ask", text: "ASK", disabled: !can, onclick: ask }));
    let extra = null;
    if (s.bribe && !S.cur.bribeTaken) extra = h("button", { class: "extra", text: `TAKE ₵${s.bribe}`, disabled: !can, onclick: () => decide("bribe") });
    if (s.kid) extra = h("button", { class: "extra", text: "HIDE KIP", disabled: !can, onclick: () => decide("hide") });
    b.push(h("button", { class: "deny", text: "DENY", disabled: !can, onclick: () => decide("deny") }));
    b.push(h("button", { class: "approve", text: s.final ? "OPEN GATE" : "APPROVE", disabled: !can, onclick: () => decide("approve") }));
    if (S.rules.detain) b.splice(2, 0, h("button", { class: "detain", text: "DETAIN", disabled: !can, onclick: () => decide("detain") }));
    if (extra) b.splice(2, 0, extra);
    els.actions.className = "dn-actions" + (b.length >= 5 ? " five" : "");
    els.actions.style.gridTemplateColumns = b.length > 5 ? "repeat(" + b.length + ", 1fr)" : "";
    els.actions.replaceChildren(...b);
  }

  function citeReason(expected, action, v) {
    if (expected === "approve") return action === "detain" ? "Unwarranted detention of an entrant with valid documents." : "Entrant had valid documents. Unwarranted denial.";
    if (expected === "detain") return "Watchlisted entrant was not detained.";
    if (action === "detain") return "Detention without watchlist match.";
    const vs = R.check(v, S.rules);
    return "Protocol violated: " + (vs[0] ? vs[0].text : "invalid entrant admitted.");
  }

  function decide(action) {
    if (!S || !S.ready || S.busy) return;
    S.busy = true;
    S.inspect = false;
    const v = S.cur, s = v.script || {}, r = S.endless ? null : run();
    const expected = R.verdict(v, S.rules);
    let correct = action === expected;
    let cited = false;
    let stamp = null, exit = "leave-l";

    if (action === "bribe") {
      r.credits += s.bribe;
      S.bribes += s.bribe;
      r.suspicion += 15;
      r.flags.bribed = true;
      stamp = { on: "permit", cls: "ok", text: "APPROVED" };
      exit = "leave-r";
      say("Pleasure doing business.");
      correct = true; // nobody cites what nobody saw
    } else if (action === "hide") {
      r.flags.kip_hidden = true;
      r.suspicion += 10;
      unlockLore("kip");
      exit = "dragged";
      say("…ok. i'll be really quiet. like a mouse. not a real mouse.");
      correct = true;
    } else {
      if (action === "approve") { stamp = { on: v.docs.permit ? "permit" : "id", cls: "ok", text: "APPROVED" }; exit = "leave-r"; }
      if (action === "deny") stamp = { on: v.docs.permit ? "permit" : "id", cls: "no", text: "DENIED." };
      if (action === "detain") { exit = "dragged"; sfx.alarm(); }
      const L = R.LINES[v.personality] || R.LINES.weary;
      if (v.tuft) say(action === "approve" ? "mrrrrp! (Tuft trots through the gate, tail high.)" : "…mrp. (Tuft stares at you for a very long time, then leaves.)");
      else if (s.kid) say(action === "approve" ? "thank you!! i'll find her!" : "oh. ok. i'll wait outside then. for a bit.");
      else if (action === "detain") say(pickLine(["What? No— let go of me!", "You don't understand what they're doing in there!", "…I knew this face would catch up with me."]));
      else say(pickLine(action === "approve" ? L.approved : L.denied));
    }

    if (r) {
      if (!correct) {
        cited = true;
        const reason = citeReason(expected, action, v);
        S.citations.push(reason);
        r.citations++;
        r.suspicion += action === "approve" ? 6 : expected === "detain" ? 5 : action === "detain" ? 4 : 2;
        citeSlip(reason);
      } else if (action !== "bribe" && action !== "hide") {
        S.correct++;
        r.correct++;
        payPop("+₵5");
      }
      if (s.approveFlag && action === "approve") r.flags[s.approveFlag] = true;
      if (s.denyFlag && action === "deny") r.flags[s.denyFlag] = true;
      if (s.static && s.static[action] != null) r.static += s.static[action];
      if (s.suspicion && s.suspicion[action] != null) r.suspicion += s.suspicion[action];
      if (v.tuft && action === "approve") r.tuft++;
      if (s.key === "wren") r.flags.met_wren = true;
      if (s.final) {
        if (action === "approve") r.flags.gate_opened = true;
        if (action === "detain") r.flags.wren_detained = true;
      }
      if (s.lore && r.static >= 2 && unlockLore(s.lore)) setTimeout(() => flash("A PAGE FALLS", "Something slips out of Dr. Varga's coat. Filed in your archive.", false), 900);
      if (s.inspector && r.suspicion >= 50) setTimeout(() => say("I'll be watching your stamp, clerk. Very closely."), 1200);
      if (S.rules.directive && action === "approve" && R.check(v, S.rules).every((x) => x.code === "directive") && R.check(v, S.rules).length) r.flags.directive_broken = true;
      r.suspicion = Math.max(0, Math.min(100, r.suspicion));
    } else {
      if (correct) { S.correct++; payPop("+10"); } else { S.citations.push(citeReason(expected, action, v)); citeSlip(S.citations[S.citations.length - 1]); cited = true; }
    }
    S.processed++;

    if (stamp) {
      S.stamp = stamp;
      S.view = stamp.on;
      renderDesk();
      sfx.stamp();
      els.desk.classList.add("shake");
      setTimeout(() => els.desk.classList.remove("shake"), 350);
    }
    if (correct && !cited) setTimeout(sfx.ok, 160);
    renderActions();
    hud();

    const terminated = !S.endless && S.citations.length >= 6;
    const endlessOver = S.endless && S.citations.length >= 3;
    setTimeout(() => {
      if (!S) return;
      els.who.className = "who " + exit;
      sfx.step();
      setTimeout(() => {
        if (!S) return;
        S.stamp = null;
        S.cur = null;
        if (endlessOver) return endEndless();
        if (terminated) return endShift(true);
        if (S.over) return endShift();
        nextVisitor();
      }, 600);
    }, stamp ? 900 : 1300);
  }

  function citeSlip(reason) {
    sfx.bad();
    const el = h("div", { class: "dn-cite", role: "alert" }, h("b", { text: "CITATION" }), reason, h("div", { style: { fontSize: "11px", marginTop: "4px", opacity: ".7" }, text: S.endless ? `${S.citations.length}/3` : `${S.citations.length} today — ${S.citations.length <= 2 ? "warning" : "₵5 penalty"}` }));
    document.body.append(el);
    setTimeout(() => el.remove(), 3200);
  }
  function payPop(text) {
    const el = h("div", { class: "dn-pay", text });
    document.body.append(el);
    setTimeout(() => el.remove(), 900);
  }

  function endShift(terminated) {
    if (!S) return;
    const shift = S;
    stopTimers();
    removeEventListener("resize", onResize);
    const r = run(), day = r.day;
    const wages = shift.correct * 5;
    const penalties = Math.max(0, shift.citations.length - 2) * 5;
    const rent = 15, heat = day >= 3 ? 5 : 0;
    const before = r.credits;
    r.credits += wages - penalties - rent - heat;
    if (!shift.citations.length && shift.processed >= 4) r.suspicion = Math.max(0, r.suspicion - 10);
    r.broke = r.credits < 0 ? r.broke + 1 : 0;
    const acc = shift.processed ? shift.correct / shift.processed : 0;
    const grade = shift.processed < 3 ? "–" : acc >= 0.95 ? "A" : acc >= 0.85 ? "B" : acc >= 0.7 ? "C" : acc >= 0.5 ? "D" : "F";
    const remark = terminated ? "Six citations in one shift. Hand in your badge."
      : grade === "A" ? "Exemplary. The facility notices diligence." : grade === "B" ? "Acceptable. Keep it that way."
      : grade === "C" ? "Sloppy. You are being measured, clerk." : grade === "–" ? "You processed almost nobody. Explain yourself."
      : "Unacceptable. One more day like this and we'll find someone who can read.";
    S = null;
    persist(true);
    screen(
      h("div", { class: "dn-eval" },
        h("span", { class: "dn-tag", text: `END OF SHIFT — DAY ${day}` }),
        h("div", { class: "row-flex", style: { display: "flex", gap: "18px", alignItems: "center", margin: "16px 0" } },
          h("div", { class: "dn-grade", text: grade }),
          h("div", {}, h("b", { text: "PERFORMANCE EVALUATION" }), h("p", { class: "dn-p", style: { margin: "4px 0 0" }, text: `"${remark}" — Supervisor Hesk` }))),
        h("table", {},
          h("tr", {}, h("td", { text: "entrants processed" }), h("td", { text: String(shift.processed) })),
          h("tr", {}, h("td", { text: "correct decisions" }), h("td", { text: String(shift.correct) })),
          h("tr", {}, h("td", { text: "wages" }), h("td", { class: "pos", text: `+₵${wages}` })),
          shift.bribes ? h("tr", {}, h("td", { text: "envelope (unrecorded)" }), h("td", { class: "pos", text: `+₵${shift.bribes}` })) : null,
          h("tr", {}, h("td", { text: `citations (${shift.citations.length}, first 2 are warnings)` }), h("td", { class: penalties ? "neg" : "", text: penalties ? `-₵${penalties}` : "₵0" })),
          h("tr", {}, h("td", { text: "rent" }), h("td", { class: "neg", text: `-₵${rent}` })),
          heat ? h("tr", {}, h("td", { text: "heating" }), h("td", { class: "neg", text: `-₵${heat}` })) : null,
          h("tr", {}, h("td", {}, h("b", { text: "credits" })), h("td", {}, h("b", { class: r.credits < 0 ? "neg" : "", text: `₵${before + shift.bribes} → ₵${r.credits}` })))),
        shift.citations.length ? h("div", { class: "dn-bulletin", style: { marginTop: "14px" } }, h("b", { text: "CITATIONS ISSUED" }), h("ul", {}, shift.citations.map((c) => h("li", { text: c })))) : null,
        r.credits < 0 ? h("p", { class: "neg", text: r.broke >= 2 ? "Second night without rent." : "You couldn't make rent. The landlord is patient. Once." }) : null,
        h("p", { class: "dn-dim", style: { marginTop: "16px" }, text: "FACILITY ATTENTION" }),
        h("div", { class: "dn-meter", title: "how closely the facility is watching you" }, h("i", { style: { width: r.suspicion + "%" } })),
        h("p", { class: "dn-dim", style: { fontSize: "12px" }, text: r.suspicion >= 70 ? "You are being watched. Closely." : r.suspicion >= 40 ? "Someone has started a file on you." : "Nobody is paying you much attention." }),
        btn("CONTINUE →", null, () => night(day, terminated), "primary")));
  }

  async function night(day, terminated) {
    const r = run();
    if (!terminated) {
      if (day === 2 && r.flags.met_wren) {
        await choice("A NOTE", "Under Wren's permit you find a note, folded four times. It says: \"We are not the enemy. Look closer at Sector C.\"", [
          ["KEEP IT", "and say nothing", () => { r.static += 1; r.flags.note_kept = true; unlockLore("note"); }],
          ["HAND IT TO HESK", "and be a good clerk", () => { r.static -= 1; r.suspicion = Math.max(0, r.suspicion - 10); r.flags.note_reported = true; }],
        ]);
      }
      if (day === 4 && r.flags.directive_broken) await choice("A KNOCK AT NIGHT", "A memo is pushed under your door: \"Directive 4-L was not followed at Checkpoint C. Your stamp count has been forwarded to Internal Audit.\"", [["GO TO SLEEP", null, () => { r.suspicion += 5; }]]);
      if (day === 5 && r.flags.kip_hidden) await choice("A SMALL GUEST", "Kip sleeps under your desk on a pile of rejected permits. You share your bread. Kip asks if the humming ever stops.", [["IT WILL", "you lie", () => { r.credits -= 3; }], ["I DON'T KNOW", "you don't lie", () => { r.credits -= 3; r.static += 1; }]]);
      if (day === 6 && r.static >= 2) await choice("LAMPLIGHT", "A lamp across the valley blinks in a pattern. You've seen it enough times to read it now: TOMORROW. THE DOOR.", [["UNDERSTOOD", null, () => {}]]);
      if (day === 7 && r.flags.kip_hidden) {
        await choice("THE BACK DOOR", "The bell rings. Kip tugs your sleeve. The back door of the booth is unlocked. Nobody would see.", [
          ["WALK OUT WITH KIP", null, () => { r.flags.leave = true; }], ["STAY AT YOUR POST", null, () => {}]]);
      }
    }
    r.suspicion = Math.max(0, Math.min(100, r.suspicion));
    let end = null;
    if (terminated || r.citations >= 18) end = "terminated";
    else if (r.suspicion >= 100) end = "detained";
    else if (r.broke >= 2) end = "evicted";
    else if (day === 7) {
      if (r.flags.gate_opened) end = "exposed";
      else if (r.tuft >= 3) end = "cat";
      else if (r.flags.leave) end = "gone";
      else if (r.flags.wren_detained || r.static <= 0) end = "promoted";
      else end = "quiet";
    }
    if (end) return ending(end);
    r.day++;
    persist(true);
    dayIntro();
  }

  function choice(title, text, options) {
    return new Promise((resolve) => {
      screen(
        h("span", { class: "dn-tag", text: "NIGHT" }),
        h("h2", { class: "dn-title", style: { fontSize: "34px" }, text: title }),
        h("p", { class: "dn-p", text }),
        ...options.map(([label, sub, fn]) => btn(label, sub, () => { fn(); resolve(); }, "")));
    });
  }

  async function ending(key) {
    const r = run(), e = R.ENDINGS[key];
    setHum(key === "exposed" ? 7 : 0);
    const bonus = { exposed: 150, cat: 200, gone: 120, promoted: 100, quiet: 80 }[key] || 0;
    const score = r.correct * 10 + bonus;
    if (!save.meta.endings.includes(key)) save.meta.endings.push(key);
    save.meta.endless = true;
    save.meta.best = Math.max(save.meta.best, score);
    unlockLore("you");
    if (key === "cat") unlockLore("tuft");
    save.run = null;
    persist(true);
    const res = await gk.score("denied", score, e.title.toLowerCase());
    screen(
      h("div", { class: "dn-ending" },
        h("span", { class: "dn-tag", text: `ENDING ${save.meta.endings.length}/8` }),
        key === "cat" ? A.portrait(null, 4, { tuft: true }) : null,
        h("h1", { text: e.title }),
        h("p", { class: "dn-p", text: e.text }),
        h("p", { class: "dn-dim", text: `${r.correct} correct decisions · ${r.citations} citations · final credits ₵${r.credits}` }),
        h("p", {}, "SCORE ", h("b", { style: { color: "var(--d-lamp)", fontSize: "22px" }, text: String(score) }), res && res.best ? h("span", { class: "dn-dim", text: "  — new personal best" }) : null),
        res ? gk.boardTable(res.denied, h) : null,
        btn("ARCHIVE", "read what you've unlocked", archive, "primary"),
        btn("TITLE", null, title)));
  }

  async function endEndless() {
    const shift = S;
    stopTimers();
    removeEventListener("resize", onResize);
    S = null;
    const score = shift.correct * 10;
    save.meta.endlessBest = Math.max(save.meta.endlessBest, score);
    persist(true);
    const res = await gk.score("denied", score, "endless shift");
    screen(
      h("span", { class: "dn-tag", text: "ENDLESS SHIFT — RELIEVED OF DUTY" }),
      h("h2", { class: "dn-title", style: { fontSize: "40px" }, text: String(score) }),
      h("p", { class: "dn-p", text: `${shift.correct} entrants cleared correctly before three mistakes.` }),
      h("div", { class: "dn-bulletin" }, h("b", { text: "CITATIONS" }), h("ul", {}, shift.citations.map((c) => h("li", { text: c })))),
      res ? gk.boardTable(res.denied, h) : null,
      btn("AGAIN", null, () => startShift(true), "primary"),
      btn("TITLE", null, title));
  }

  window.__denied = { shift: () => S, save: () => save, decide, verdict: () => S && S.cur && R.verdict(S.cur, S.rules) };
  title();
})();
