// catnet — by cole (github.com/yupthatscole)
"use strict";
(function () {
  const gk = (window.gk = {});

  const timers = {};
  function localKey(game) { return "cn.save." + game + "." + (cn.me ? cn.me.user.id : "anon"); }
  gk.load = async function (game) {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(localKey(game)) || "null"); } catch (e) { /* ignore */ }
    try {
      const r = await cn.api("/api/save?g=" + game);
      const remote = r.d;
      if (local && (!remote || (local._t || 0) > (remote._t || 0))) {
        gk.save(game, local, true);
        return local;
      }
      return remote;
    } catch (e) {
      return local;
    }
  };
  gk.save = function (game, data, now) {
    if (data) data._t = Date.now();
    try { localStorage.setItem(localKey(game), JSON.stringify(data)); } catch (e) { /* private mode */ }
    clearTimeout(timers[game]);
    const push = () => cn.api("/api/save", { g: game, d: JSON.stringify(data) }).catch(() => { /* local copy kept */ });
    if (now) return push();
    timers[game] = setTimeout(push, 800);
    return Promise.resolve();
  };
  gk.score = async function (game, score, note) {
    try { return await cn.api("/api/scores", { g: game, s: Math.max(0, Math.floor(score)), x: note || "" }); } catch (e) { return null; }
  };
  gk.board = async function (game) {
    try { return (await cn.api("/api/scores?g=" + game))[game]; } catch (e) { return null; }
  };
  gk.boardTable = function (b, h) {
    if (!b || !b.top.length) return h("p", { class: "gk-dim", text: "no scores yet. be the first." });
    return h("table", { class: "gk-lb" }, b.top.map((t, i) =>
      h("tr", { class: t.n === cn.me.user.n ? "me" : null }, h("td", { text: String(i + 1) }), h("td", { text: t.n, style: { color: t.c } }), h("td", { text: t.x || "" }), h("td", { class: "r", text: String(t.s) }))));
  };

  let ctx = null, master = null;
  gk.muted = () => !!(cn.me && cn.me.prefs & 4) || gk._mute;
  gk.setMute = (v) => { gk._mute = v; if (master) master.gain.value = v ? 0 : 0.5; };
  gk.audio = function () {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = gk.muted() ? 0 : 0.5;
        master.connect(ctx.destination);
      } catch (e) { return null; }
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  gk.out = () => master;
  gk.tone = function (freq, dur, o = {}) {
    const a = gk.audio();
    if (!a || gk.muted()) return;
    const t = a.currentTime + (o.delay || 0);
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = o.type || "square";
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.15, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };
  let noiseBuf = null;
  gk.noise = function (dur, o = {}) {
    const a = gk.audio();
    if (!a || gk.muted()) return;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime + (o.delay || 0);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = noiseBuf;
    f.type = o.filter || "lowpass";
    f.frequency.value = o.freq || 1200;
    g.gain.setValueAtTime(o.vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  };

  gk.rng = function (seed) {
    let s = seed >>> 0 || 1;
    const r = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (n) => Math.floor(r() * n);
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    r.shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    return r;
  };

  gk.bitmap = function (ctx2d, rows, pal, x, y, scale = 1, flip = false) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === "." || !pal[ch]) continue;
        ctx2d.fillStyle = pal[ch];
        const cx = flip ? row.length - 1 - c : c;
        ctx2d.fillRect(x + cx * scale, y + r * scale, scale, scale);
      }
    }
  };
  gk.canvas = function (w, h, cls) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    if (cls) c.className = cls;
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = false;
    return [c, x];
  };
  gk.vibrate = (ms) => { try { if (!gk.muted() && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } };
})();
