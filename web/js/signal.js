// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { h } = cn;
  const G = window.SIGNAL;
  const app = document.getElementById("app");
  await cn.boot({ page: "arcade", shell: false, manualPulse: true });

  let save = await gk.load("signal");
  if (!save || typeof save !== "object") save = {};
  save = Object.assign({ v: 1, unlocked: 1, stars: {}, best: {}, scanBest: 0, heard: [] }, save);
  const persist = (now) => gk.save("signal", save, now);
  const total = () => Object.values(save.best).reduce((a, b) => a + b, 0);

  let run = null; // active tuning session
  function stop() {
    if (run) { cancelAnimationFrame(run.raf); run.audio && run.audio.stop(); run = null; }
  }
  function screen(...kids) {
    stop();
    app.replaceChildren(...kids);
    scrollTo(0, 0);
  }
  const btn = (label, sub, fn, cls = "") => h("button", { class: "sg-btn " + cls, onclick: () => { gk.audio(); click(); fn(); } }, label, sub ? h("small", { text: sub }) : null);
  const click = () => gk.tone(1400, 0.015, { type: "square", vol: 0.04 });

  function title() {
    const lb = h("div", {}, h("p", { class: "gk-dim", text: "…" }));
    gk.board("signal").then((b) => lb.replaceChildren(gk.boardTable(b, h)));
    screen(
      h("p", { class: "sg-sub", text: "listening post 7 · night shift" }),
      h("h1", { class: "sg-h1", text: "SIGNAL" }),
      h("p", { class: "sg-p", text: "Something is broadcasting over the valley. Turn the dials until your oscillators trace the same wave as the one you're receiving. When they lock, the message comes through." }),
      h("p", { class: "sg-p", style: { color: "var(--s-dim)" }, text: "Headphones help: when you're close, the two tones beat against each other. When they lock, they sing." }),
      btn("NIGHT SHIFT", `${Object.keys(save.stars).length}/12 frequencies decoded · ${total()} pts`, map, "primary"),
      btn("OPEN SCAN", `endless · best ${save.scanBest}`, () => scan(0, 0, 3)),
      btn("LOGBOOK", `${save.heard.length} transmissions`, logbook),
      btn("RETURN TO CATNET", null, () => { location.href = "/arcade"; }),
      h("p", { class: "sg-sub", style: { marginTop: "14px" } }, "a catnet game by cole · ", h("a", { href: cn.CREDIT.url, target: "_blank", rel: "noopener", style: { color: "inherit" }, text: cn.CREDIT.label })),
      h("p", { class: "sg-sub", style: { marginTop: "24px" }, text: "best operators" }), lb);
  }

  function map() {
    screen(
      h("div", { class: "sg-top" }, h("button", { class: "back", text: "← back", onclick: title }), h("span", { class: "name", text: "NIGHT SHIFT" }),
        h("span", { class: "right", text: `${total()} pts` })),
      h("p", { class: "sg-p", text: "Twelve frequencies. Each one you lock opens the next." }),
      h("div", { class: "sg-map" }, G.LEVELS.map((L) => {
        const open = L.n <= save.unlocked;
        const st = save.stars[L.n] || 0;
        return h("button", { class: "sg-slot", disabled: !open, onclick: () => { click(); play(L, false); }, "aria-label": `frequency ${L.n} ${L.name}` },
          h("b", { text: String(L.n).padStart(2, "0") }), h("span", { style: { fontSize: "10px", letterSpacing: ".1em" }, text: open ? L.name : "· · ·" }),
          h("span", { class: "stars", text: open ? "★".repeat(st) + "☆".repeat(3 - st) : "" }));
      })));
  }

  function logbook() {
    screen(
      h("div", { class: "sg-top" }, h("button", { class: "back", text: "← back", onclick: title }), h("span", { class: "name", text: "LOGBOOK" })),
      save.heard.length
        ? h("ol", { class: "sg-log" }, save.heard.slice().sort((a, b) => a - b).map((n) => h("li", {}, h("b", { text: `${String(n).padStart(2, "0")} · ${G.LEVELS[n - 1].name}` }), h("br"), G.MESSAGES[n - 1])))
        : h("p", { class: "sg-p", text: "Nothing decoded yet. The night is long." }));
  }

  function knob(label, key, getV, setV, fixed, fmt) {
    const [lo, hi] = G.RANGE[key];
    const dial = h("div", { class: "dial", tabindex: fixed ? null : "0", role: "slider", "aria-label": label, "aria-valuemin": lo, "aria-valuemax": hi });
    const val = h("div", { class: "val" });
    const wrapV = (v) => key === "p" ? ((v % G.TAU) + G.TAU) % G.TAU : Math.min(hi, Math.max(lo, v));
    const set = (v) => { setV(G.snap(wrapV(v), key)); update(); };
    function update() {
      const v = getV(), t = (v - lo) / (hi - lo);
      dial.style.transform = `rotate(${-135 + 270 * t}deg)`;
      val.textContent = fmt(v);
      dial.setAttribute("aria-valuenow", v.toFixed(3));
    }
    if (!fixed) {
      let startY = 0, startV = 0, dragging = false;
      dial.addEventListener("pointerdown", (e) => { dragging = true; startY = e.clientY; startV = getV(); dial.setPointerCapture(e.pointerId); gk.audio(); });
      dial.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const fine = e.shiftKey ? 0.2 : 1;
        set(startV + ((startY - e.clientY) * (hi - lo) / 260) * fine);
      });
      dial.addEventListener("pointerup", () => { dragging = false; });
      dial.addEventListener("pointercancel", () => { dragging = false; });
      dial.addEventListener("wheel", (e) => { e.preventDefault(); set(getV() - Math.sign(e.deltaY) * G.STEP[key] * (e.shiftKey ? 1 : 4)); }, { passive: false });
      dial.addEventListener("keydown", (e) => {
        const big = e.key.startsWith("Page") ? 10 : 1;
        if (["ArrowUp", "ArrowRight", "PageUp"].includes(e.key)) { set(getV() + G.STEP[key] * big); e.preventDefault(); }
        if (["ArrowDown", "ArrowLeft", "PageDown"].includes(e.key)) { set(getV() - G.STEP[key] * big); e.preventDefault(); }
      });
    }
    const nudge = (dir) => {
      let timer = 0, n = 0;
      const go = () => { set(getV() + dir * G.STEP[key]); n++; timer = setTimeout(go, n > 6 ? 40 : 160); };
      return h("button", { text: dir > 0 ? "+" : "−", "aria-label": `${label} ${dir > 0 ? "up" : "down"}`,
        onpointerdown: (e) => { e.preventDefault(); go(); }, onpointerup: () => clearTimeout(timer), onpointerleave: () => clearTimeout(timer), onpointercancel: () => clearTimeout(timer) });
    };
    update();
    return h("div", { class: "knob" + (fixed ? " fixed" : "") }, h("div", { class: "lab", text: label }), dial, val, h("div", { class: "fine" }, nudge(-1), nudge(1)));
  }

  function makeAudio(target, player) {
    const a = gk.audio();
    if (!a || gk.muted()) return null;
    const out = a.createGain();
    out.gain.value = 0;
    out.connect(gk.out());
    out.gain.setTargetAtTime(0.5, a.currentTime, 0.4);
    const mk = (c, type) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = type;
      o.frequency.value = 110 * c.f;
      g.gain.value = c.a * 0.06;
      o.connect(g).connect(out);
      o.start();
      return { o, g };
    };
    const tn = target.map((c) => mk(c, "sine"));
    const pn = player.map((c) => mk(c, "triangle"));
    const pGain = a.createGain();
    return {
      update(player, cue, gain) {
        const t = a.currentTime;
        player.forEach((c, i) => {
          pn[i].o.frequency.setTargetAtTime(110 * c.f, t, 0.02);
          pn[i].g.gain.setTargetAtTime(cue ? 0 : c.a * 0.045, t, 0.03);
        });
        target.forEach((c, i) => tn[i].g.gain.setTargetAtTime(c.a * 0.06 * gain, t, 0.05));
      },
      stop() {
        out.gain.setTargetAtTime(0, a.currentTime, 0.15);
        setTimeout(() => { tn.concat(pn).forEach((n) => n.o.stop()); out.disconnect(); }, 600);
        void pGain;
      },
    };
  }

  function play(L, scanState) {
    const r = gk.rng(scanState ? Date.now() % 1e9 : 9000 + L.n * 131);
    const target = G.makeTarget(r, L.k);
    const player = G.makeStart(r, target, L.free);
    const fmt = { f: (v) => v.toFixed(3) + " c", a: (v) => v.toFixed(2), p: (v) => Math.round((v * 180) / Math.PI) + "°" };
    const names = { f: "FREQ", a: "AMP", p: "PHASE" };

    const canvas = h("canvas", { class: "sg-scope", width: 640, height: 360, role: "img", "aria-label": "oscilloscope: teal is the received signal, amber is yours" });
    const ctx = canvas.getContext("2d");
    const strength = h("div", { class: "sg-strength", title: "signal strength" }, h("i"));
    const lockBar = h("div", { class: "bar" }, h("i"), h("b"), h("div", { class: "hold" }));
    const status = h("span", { class: "sg-status", text: "SEARCHING" });
    const msg = h("div", { class: "sg-msg static", text: "· · · static · · ·" });
    const cueBtn = h("button", { text: "CUE TARGET" });
    const listenBtn = h("button", { class: gk.muted() ? "" : "on", text: "AUDIO" });
    const oscs = h("div", { class: "sg-oscs n" + L.k }, player.map((p, i) => h("div", { class: "sg-osc" },
      h("h4", { text: `OSCILLATOR ${i + 1}` }),
      h("div", { class: "sg-dials" }, ["f", "a", "p"].map((k) => knob(names[k], k, () => player[i][k], (v) => { player[i][k] = v; }, !L.free.includes(k), fmt[k]))))));

    screen(
      h("div", { class: "sg-top" },
        h("button", { class: "back", text: "← " + (scanState ? "end scan" : "map"), onclick: () => (scanState ? scanOver(scanState) : map()) }),
        h("span", { class: "name", text: `${String(L.n).padStart(2, "0")} · ${L.name}` }),
        h("span", { class: "right" }, scanState ? `score ${scanState.score} · ${"●".repeat(scanState.lives)}${"○".repeat(3 - scanState.lives)}` : null, strength)),
      h("div", { class: "sg-bezel" }, canvas,
        h("div", { class: "sg-legend" }, h("span", { class: "t", text: "received" }), h("span", { class: "y", text: "your oscillators" }),
          h("span", { text: L.free.length < 3 ? `free dials: ${L.free.map((k) => names[k].toLowerCase()).join(", ")}` : "all dials free" }),
          L.noise ? h("span", { text: "interference" }) : null, L.wobble ? h("span", { text: "fading" }) : null)),
      h("div", { class: "sg-lock" }, h("span", { class: "sg-sub", text: "LOCK" }), lockBar, status),
      oscs,
      h("div", { class: "sg-tools" }, listenBtn, cueBtn),
      msg);

    let cue = false;
    cueBtn.addEventListener("pointerdown", () => { cue = true; cueBtn.classList.add("on"); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((e) => cueBtn.addEventListener(e, () => { cue = false; cueBtn.classList.remove("on"); }));
    listenBtn.addEventListener("click", () => {
      gk.setMute(!gk._mute);
      listenBtn.classList.toggle("on", !gk.muted());
      if (run && !run.done && !gk.muted() && !run.audio) run.audio = makeAudio(target, player);
    });

    run = { raf: 0, audio: makeAudio(target, player), timeLeft: L.time, hold: 0, done: false, t: 0, last: performance.now(), target, player };
    const me = run;
    function frame(now) {
      if (run !== me) return;
      const dt = Math.min(0.05, (now - me.last) / 1000);
      me.last = now;
      if (!document.hidden && step(dt) === false) return;
      me.raf = requestAnimationFrame(frame);
    }
    function step(dt) {
      {
        me.t += dt;
        const gain = 1 + (L.wobble || 0) * Math.sin(me.t * 1.3);
        const sim = G.similarity(target, player, gain);
        if (!me.done) {
          me.timeLeft -= dt;
          if (sim >= G.LOCK_AT) me.hold += dt;
          else me.hold = Math.max(0, me.hold - dt * 2);
          if (me.hold >= G.HOLD_SECONDS) { win(L, me, sim, scanState); return false; }
          if (me.timeLeft <= 0) { lost(L, scanState); return false; }
        }
        draw(ctx, target, player, gain, L.noise || 0, me.t, sim);
        const s = Math.max(0, me.timeLeft / L.time);
        strength.firstChild.style.width = s * 100 + "%";
        strength.classList.toggle("low", s < 0.2);
        lockBar.firstChild.style.width = Math.round(sim * 100) + "%";
        lockBar.lastChild.style.width = (me.hold / G.HOLD_SECONDS) * 100 + "%";
        status.textContent = sim >= G.LOCK_AT ? "LOCKING…" : sim > 0.8 ? "CLOSE" : sim > 0.5 ? "WARMER" : "SEARCHING";
        if (me.audio) me.audio.update(player, cue, gain);
      }
      return true;
    }
    me.step = step;
    me.raf = requestAnimationFrame(frame);
  }

  function draw(ctx, target, player, gain, noise, t, sim) {
    const W = 640, H = 360;
    ctx.fillStyle = "rgba(7, 10, 7, 0.45)";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255, 179, 71, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 64) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = 0; y <= H; y += 45) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 179, 71, 0.18)";
    ctx.beginPath(); ctx.moveTo(0, H / 2 + 0.5); ctx.lineTo(W, H / 2 + 0.5); ctx.stroke();
    const peak = Math.max(1, target.reduce((s, c) => s + c.a, 0) * (1 + 0.1));
    const Y = (v) => H / 2 - (v / peak) * H * 0.42;
    const trace = (fn, color, w) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const x = i / 200;
        const y = fn(x);
        if (i) ctx.lineTo(x * W, Y(y)); else ctx.moveTo(x * W, Y(y));
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    trace((x) => G.sample(target, x, gain) + (noise ? (Math.random() - 0.5) * noise * 1.6 : 0), sim >= G.LOCK_AT ? "#7fffe0" : "#4fe0c0", 2.4);
    trace((x) => G.sample(player, x), "#ffb347", 2);
  }

  function typeInto(el, text, done) {
    el.classList.remove("static");
    el.replaceChildren(h("span", { class: "from", text: "DECODED · LAMPLIGHT" }));
    const span = h("span");
    el.append(span);
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      span.textContent = text.slice(0, i);
      if (i % 3 === 0) gk.tone(1200 + Math.random() * 300, 0.01, { type: "square", vol: 0.02 });
      if (i >= text.length) { clearInterval(t); done && done(); }
    }, 22);
  }

  function win(L, me, sim, scanState) {
    me.done = true;
    cancelAnimationFrame(me.raf);
    if (me.audio) { const a = me.audio; me.audio = null; setTimeout(() => a.stop(), 900); }
    [523, 659, 784, 1046].forEach((f, i) => gk.tone(f, 0.5, { type: "sine", vol: 0.08, delay: i * 0.09 }));
    gk.vibrate(40);
    const pts = G.score(L.n, me.timeLeft, sim);
    const status = app.querySelector(".sg-status");
    status.textContent = "LOCKED";
    status.classList.add("locked");
    const msg = app.querySelector(".sg-msg");
    if (scanState) {
      scanState.score += pts;
      scanState.caught = (scanState.caught || 0) + 1;
      typeInto(msg, `SCAN CONTACT ${L.n}: +${pts}. ` + pickScan(), () => {
        msg.append(h("div", {}, btn("NEXT CONTACT →", null, () => scan(scanState.round + 1, scanState.score, scanState.lives, scanState.caught), "primary")));
      });
      return;
    }
    const st = G.stars(me.timeLeft, L.time);
    const firstTime = !save.heard.includes(L.n);
    save.stars[L.n] = Math.max(save.stars[L.n] || 0, st);
    save.best[L.n] = Math.max(save.best[L.n] || 0, pts);
    if (firstTime) save.heard.push(L.n);
    save.unlocked = Math.max(save.unlocked, Math.min(12, L.n + 1));
    persist(true);
    gk.score("signal", total(), "night shift");
    typeInto(msg, G.MESSAGES[L.n - 1], () => {
      msg.append(h("div", { class: "sg-win" },
        h("div", { class: "score", text: `+${pts}` }),
        h("div", { class: "sg-sub", text: "★".repeat(st) + "☆".repeat(3 - st) + (pts >= save.best[L.n] ? " · best" : "") }),
        L.n < 12 ? btn(`TUNE TO ${String(L.n + 1).padStart(2, "0")} →`, G.LEVELS[L.n].name, () => play(G.LEVELS[L.n], false), "primary")
          : btn("THE LAST TRANSMISSION ENDS.", "back to the map", map, "primary"),
        btn("MAP", null, map)));
    });
  }

  const SCAN_LINES = ["a weather beacon, counting to nine forever.", "two truckers arguing about soup.", "a lullaby on a children's band, very faint.",
    "a numbers station: 4 1 4 1 4 1.", "someone practising the trumpet badly.", "Lamplight's call sign, repeated, then nothing.",
    "a cat. definitely a cat. purring into a microphone.", "the hum, just the hum, louder than yesterday."];
  const pickScan = () => SCAN_LINES[Math.floor(Math.random() * SCAN_LINES.length)];

  function lost(L, scanState) {
    if (run) { cancelAnimationFrame(run.raf); run.done = true; run.audio && run.audio.stop(); run.audio = null; }
    gk.tone(200, 0.6, { type: "sawtooth", vol: 0.06, slide: 60 });
    gk.noise(0.6, { vol: 0.15, freq: 3000 });
    const msg = app.querySelector(".sg-msg");
    msg.classList.add("static");
    msg.replaceChildren(h("span", { class: "from", text: "SIGNAL LOST" }), "The carrier faded into static.");
    if (scanState) {
      const lives = scanState.lives - 1;
      msg.append(lives > 0 ? btn("KEEP SCANNING →", `${lives} chance${lives === 1 ? "" : "s"} left`, () => scan(scanState.round + 1, scanState.score, lives, scanState.caught || 0), "primary")
        : btn("END OF NIGHT", "see your score", () => scanOver(scanState), "primary"));
    } else {
      msg.append(btn("TRY AGAIN", null, () => play(L, false), "primary"), btn("MAP", null, map));
    }
  }

  function scan(round, score, lives, caught = 0) {
    play(G.scanLevel(round), { round, score, lives, caught });
  }
  async function scanOver(st) {
    stop();
    save.scanBest = Math.max(save.scanBest, st.score);
    persist(true);
    const res = await gk.score("signal", st.score, "open scan");
    screen(
      h("p", { class: "sg-sub", text: "open scan · dawn" }),
      h("h1", { class: "sg-h1", style: { fontSize: "48px" }, text: String(st.score) }),
      h("p", { class: "sg-p", text: `${st.caught || 0} contact${st.caught === 1 ? "" : "s"} logged before the night ran out.` }),
      res ? gk.boardTable(res.signal, h) : null,
      btn("SCAN AGAIN", null, () => scan(0, 0, 3), "primary"), btn("TITLE", null, title));
  }

  window.__signal = { run: () => run, G };
  title();
})();
