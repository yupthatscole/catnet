// catnet — by cole (github.com/yupthatscole)
"use strict";
(function () {
  const cn = (window.cn = {});
  let csrf = "";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  // tiny element builder. text always goes in as textContent so nobody can inject html
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (typeof v !== "string" && k in el) el[k] = v;
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const kid of kids.flat(3)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }
  Object.assign(cn, { $, $$, h });

  // who made this thing
  cn.CREDIT = { name: "cole", url: "https://github.com/yupthatscole", label: "github.com/yupthatscole" };
  cn.credit = (cls) => h("footer", { class: cls || "credit" }, "catnet. made by ", h("b", { text: cn.CREDIT.name }), " · ",
    h("a", { href: cn.CREDIT.url, target: "_blank", rel: "noopener", text: cn.CREDIT.label }));

  const store = {
    get(k, d) { try { const v = localStorage.getItem("cn." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("cn." + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  cn.store = store;

  function form(body) {
    const p = new URLSearchParams();
    for (const k in body) if (body[k] != null) p.append(k, typeof body[k] === "boolean" ? (body[k] ? "1" : "0") : String(body[k]));
    return p.toString();
  }
  cn.api = async function (path, body, opts = {}) {
    const init = { credentials: "same-origin", headers: {} };
    if (body !== undefined) {
      init.method = "POST";
      init.headers["Content-Type"] = "application/x-www-form-urlencoded";
      init.body = form(body);
    }
    if (csrf) init.headers["X-CSRF"] = csrf;
    let res;
    try {
      res = await fetch(path, init);
    } catch (e) {
      setOffline(true);
      const err = new Error("catnet is unreachable");
      err.status = 0;
      throw err;
    }
    setOffline(false);
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-json */ }
    if (res.status === 401 && !opts.quiet401) {
      location.href = "/login?next=" + encodeURIComponent(location.pathname + location.search);
      throw Object.assign(new Error("not logged in"), { status: 401 });
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || "something went wrong (" + res.status + ")");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  };
  cn.setCsrf = (t) => { csrf = t; };

  cn.upload = function (url, file, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("POST", url);
      x.setRequestHeader("X-CSRF", csrf);
      x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      x.onload = () => {
        let d = null;
        try { d = JSON.parse(x.responseText); } catch (e) { /* ignore */ }
        if (x.status >= 200 && x.status < 300) resolve(d);
        else reject(Object.assign(new Error((d && d.error) || "upload failed (" + x.status + ")"), { status: x.status }));
      };
      x.onerror = () => reject(Object.assign(new Error("connection lost during upload"), { status: 0 }));
      const fd = new FormData();
      fd.append("file", file, file.name);
      x.send(fd);
    });
  };

  cn.bytes = (n) => n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB" : (n / 1048576).toFixed(2) + " MB";
  cn.dur = (s) => {
    s = Math.max(0, Math.floor(s));
    const d = Math.floor(s / 86400), hh = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
    if (d) return d + "d " + hh + "h";
    if (hh) return hh + "h " + m + "m";
    if (m) return m + "m " + (s % 60) + "s";
    return s + "s";
  };
  cn.ago = (t) => {
    if (!t) return "a while ago";
    const s = Date.now() / 1000 - t;
    if (s < 45) return "just now";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    if (s < 86400 * 7) return Math.round(s / 86400) + "d ago";
    return new Date(t * 1000).toLocaleDateString();
  };
  cn.clock = (t) => t ? new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";
  cn.plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

  const ICONS = {
    home: ["....#....", "...###...", "..#####..", ".#######.", "#########", ".#.....#.", ".#.##..#.", ".#.##..#.", ".#######."],
    chat: [".#######.", "#########", "#.#.#.#.#", "#########", ".#######.", "..##.....", "..#......", ".........", "........."],
    arcade: ["...........", ".#########.", "###########", "##.####.###", "#...###.#.#", "##.####.###", "###########", "####...####", ".##.....##."],
    files: ["####.....", "#####....", "#########", "#.......#", "#########", "#########", "#########", "#########", "........."],
    notes: ["######...", "#....##..", "#.##.#.#.", "#....####", "#.#####.#", "#.......#", "#.#####.#", "#.......#", "#########"],
    board: ["....#....", "...###...", "#########", "#.......#", "#.#####.#", "#.......#", "#.###...#", "#.......#", "#########"],
    people: ["#.......#", "##.....##", "#########", "##.###.##", "#########", "####.####", "#########", ".#######.", "..#####.."],
    settings: ["...#.#...", ".#.###.#.", "..#####..", "####.####", "###...###", "####.####", "..#####..", ".#.###.#.", "...#.#..."],
    system: ["..#.#.#..", ".#######.", "##.....##", ".#.###.#.", "##.###.##", ".#.###.#.", "##.....##", ".#######.", "..#.#.#.."],
    admin: [".........", "#...#...#", "##.###.##", "#########", "#########", "#########", ".........", "#########", "#########"],
    about: ["#########", "#...#...#", "#.......#", "#..##...#", "#...#...#", "#...#...#", "#..###..#", "#.......#", "#########"],
    more: [".........", ".........", ".........", "##..#..##", "##.###.##", ".........", ".........", ".........", "........."],
    logout: ["#####....", "#...#....", "#...#..#.", "#...#...#", "#...#####", "#...#...#", "#...#..#.", "#...#....", "#####...."],
    upload: ["....#....", "...###...", "..#####..", ".#..#..#.", "....#....", "....#....", ".........", "#.......#", "#########"],
    download: ["....#....", "....#....", ".#..#..#.", "..#####..", "...###...", "....#....", ".........", "#.......#", "#########"],
    trash: ["...###...", "#########", ".........", ".#######.", ".#.#.#.#.", ".#.#.#.#.", ".#.#.#.#.", ".#.#.#.#.", "..#####.."],
    lock: ["..#####..", ".##...##.", ".#.....#.", ".#.....#.", "#########", "####.####", "###...###", "####.####", "#########"],
    globe: ["..#####..", ".#..#..#.", "#..#.#..#", "#########", "#..#.#..#", "#########", "#..#.#..#", ".#..#..#.", "..#####.."],
    send: ["#........", "###......", "#.###....", "#...###..", "#.....###", "#...###..", "#.###....", "###......", "#........"],
    star: ["....#....", "....#....", "...###...", "#########", ".#######.", "..#####..", "..##.##..", ".##...##.", "#.......#"],
    back: [".........", "...#.....", "..##.....", ".########", "#########", ".########", "..##.....", "...#.....", "........."],
    plus: ["....#....", "....#....", "....#....", "....#....", "#########", "....#....", "....#....", "....#....", "....#...."],
    close: ["#.......#", ".#.....#.", "..#...#..", "...#.#...", "....#....", "...#.#...", "..#...#..", ".#.....#.", "#.......#"],
    edit: [".......##", "......###", ".....###.", "....###..", "...###...", "..###....", ".###.....", "##.......", "###......"],
    pin: ["..#####..", "..#####..", "...###...", "...###...", ".#######.", "....#....", "....#....", "....#....", "....#...."],
    bell: ["....#....", "..#####..", ".#######.", ".#######.", ".#######.", ".#######.", "#########", ".........", "...###..."],
    trophy: ["#########", "#.#####.#", "#.#####.#", ".#######.", "..#####..", "...###...", "....#....", "..#####..", ".#######."],
    eye: [".........", "..#####..", ".##...##.", "##..#..##", "#..###..#", "##..#..##", ".##...##.", "..#####..", "........."],
    paw: [".#.....#.", "###...###", ".#.###.#.", "..#####..", ".#######.", ".#######.", "..#####..", ".........", "........."],
  };
  cn.icon = function (name, cls) {
    const rows = ICONS[name] || ICONS.paw;
    const w = rows[0].length, hgt = rows.length;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`);
    svg.setAttribute("class", "pxi" + (cls ? " " + cls : ""));
    svg.setAttribute("aria-hidden", "true");
    let d = "";
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        if (r[x] !== "#") continue;
        let e = x;
        while (e < r.length && r[e] === "#") e++;
        d += `M${x} ${y}h${e - x}v1h-${e - x}z`;
        x = e - 1;
      }
    });
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    svg.append(p);
    return svg;
  };

  const COATS = [
    "none", "hue-rotate(40deg)", "hue-rotate(-60deg) saturate(1.3)", "hue-rotate(110deg)",
    "hue-rotate(170deg) saturate(.9)", "hue-rotate(215deg)", "grayscale(1) brightness(1.1)",
    "grayscale(1) brightness(.5) contrast(1.6)", "sepia(1) saturate(2.4) hue-rotate(-18deg)",
    "sepia(.7) brightness(1.18) saturate(.8)", "hue-rotate(290deg) saturate(1.6)", "invert(.88) hue-rotate(180deg)",
  ];
  cn.COAT_NAMES = ["lavender", "rose", "periwinkle", "moss", "sea glass", "plum", "smoke", "midnight", "ginger", "cream", "berry", "ghost"];
  cn.avatar = function (index, zoom = 0.5, title) {
    const el = h("span", { class: "av", title: title || null, role: "img", "aria-label": title || "avatar" });
    el.style.setProperty("--z", zoom);
    el.style.setProperty("--av-f", COATS[(index | 0) % COATS.length]);
    return el;
  };

  const ROWS = { idle: 0, happy: 1, sleep: 2, confused: 3, curious: 4, think: 5, surprised: 6, walk: 7 };
  const SPEED = { idle: 1.1, happy: 0.6, sleep: 2.4, confused: 1.2, curious: 1.6, think: 1.2, surprised: 0.7, walk: 0.55 };
  class Tuft {
    constructor(el, scale) {
      this.el = el || h("div");
      this.el.classList.add("tuft");
      this.el.setAttribute("role", "img");
      this.el.setAttribute("aria-label", "Tuft the cat");
      if (scale) this.el.style.setProperty("--s", scale);
      this.state = "idle";
      this.timer = null;
      this.play("idle");
    }
    play(name, holdMs) {
      if (!(name in ROWS)) name = "idle";
      clearTimeout(this.timer);
      this.state = name;
      this.el.style.setProperty("--row", ROWS[name]);
      this.el.style.setProperty("--spd", SPEED[name] + "s");
      this.el.style.animation = "none";
      void this.el.offsetWidth;
      this.el.style.animation = "";
      if (holdMs) this.timer = setTimeout(() => this.play("idle"), holdMs);
      return this;
    }
  }
  cn.Tuft = Tuft;
  cn.tuft = (name = "idle", scale = 1) => new Tuft(null, scale).play(name).el;

  cn.tuftSays = function (ctx = {}) {
    const hr = new Date().getHours();
    const name = (cn.me && cn.me.user.n) || "friend";
    const lines = [];
    if (hr < 5) lines.push(`it's ${hr}am, ${name}. the router and i are judging you.`, "the moon is the only other thing awake. and us.");
    else if (hr < 11) lines.push(`morning, ${name}. i have already knocked one thing off a table.`, "good morning. the packets are fresh today.");
    else if (hr < 17) lines.push(`afternoon, ${name}. prime napping hours. i'm working. sort of.`);
    else if (hr < 22) lines.push(`evening, ${name}. the network is cozy tonight.`);
    else lines.push(`late shift, ${name}? same.`);
    if (ctx.online > 1) lines.push(`${ctx.online} cats online. a crowd. i'll pretend to be shy.`);
    if (ctx.online === 1) lines.push("just you and me on here. i like it quiet.");
    if (ctx.storagePct > 85) lines.push("the litter box (storage) is getting full. just saying.");
    if (ctx.unread) lines.push(`there are ${ctx.unread} new chat messages. i read them all. no comment.`);
    lines.push(
      "this entire internet runs on a chip smaller than my paw.",
      "no ads. no algorithms. just vibes and 520 kilobytes of ram.",
      "i am legally required to say: there is no internet here.",
      "tip: i like being clicked. in moderation.",
      "if you need me i'll be at 192.168.4.1. i'm always at 192.168.4.1.",
      "i tried to download more ram. it's offline.",
      "someone in DENIED. keeps letting the wrong cats in. it's fine.",
      "the power bank says 'full'. the power bank lies sometimes.",
      "my favourite protocol is HTTP. hyper-tuft transfer protocol.",
      "i don't have wi-fi. i AM the wi-fi.",
    );
    return lines[Math.floor(Math.random() * lines.length)];
  };

  let toastBox;
  cn.toast = function (msg, kind = "ok", ms = 3200) {
    if (!toastBox) toastBox = document.body.appendChild(h("div", { class: "toasts", role: "status", "aria-live": "polite" }));
    const mood = kind === "bad" ? "confused" : kind === "ok" ? "happy" : "curious";
    const t = h("div", { class: "toast " + kind }, cn.tuft(mood, 0.5), h("span", { text: msg }));
    toastBox.append(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, ms);
  };
  cn.fail = (e) => cn.toast(e && e.message ? e.message : String(e), "bad", 4200);

  function sheet(build) {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      const scrim = h("div", { class: "scrim" });
      const box = h("div", { class: "sheet", role: "dialog", "aria-modal": "true" });
      const close = (v) => { scrim.remove(); document.removeEventListener("keydown", onKey); prev && prev.focus && prev.focus(); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") close(null); };
      scrim.addEventListener("click", (e) => { if (e.target === scrim) close(null); });
      document.addEventListener("keydown", onKey);
      build(box, close);
      scrim.append(box);
      document.body.append(scrim);
      const f = box.querySelector("input,textarea,select,button.btn");
      if (f) f.focus();
    });
  }
  cn.sheet = sheet;
  cn.ask = (title, text, okLabel = "ok", danger = false) => sheet((box, close) => {
    box.append(
      h("h2", { text: title }),
      text ? h("p", { class: "dim", text }) : null,
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", text: "cancel", onclick: () => close(false) }),
        h("button", { class: "btn" + (danger ? " danger" : ""), text: okLabel, onclick: () => close(true) })),
    );
  }).then((v) => !!v);
  cn.promptText = (title, label, value = "", okLabel = "save", opts = {}) => sheet((box, close) => {
    const input = opts.multiline
      ? h("textarea", { rows: 4, maxlength: opts.max || 200, value })
      : h("input", { type: opts.type || "text", maxlength: opts.max || 200, value, autocomplete: "off" });
    const f = h("form", { onsubmit: (e) => { e.preventDefault(); close(input.value); } },
      h("h2", { text: title }),
      h("label", { class: "field" }, h("span", { text: label }), input),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "btn ghost", text: "cancel", onclick: () => close(null) }),
        h("button", { type: "submit", class: "btn", text: okLabel })));
    box.append(f);
  });

  cn.applyPrefs = function (accent, prefs) {
    const root = document.documentElement;
    root.dataset.accent = accent || 0;
    if (prefs & 1) root.dataset.motion = "reduce"; else delete root.dataset.motion;
    if (prefs & 8) root.dataset.compact = ""; else delete root.dataset.compact;
    store.set("prefs", { accent, prefs });
  };
  (function early() {
    const p = store.get("prefs", null);
    if (p) cn.applyPrefs(p.accent, p.prefs);
  })();
  cn.pref = (bit) => !!(cn.me && cn.me.prefs & bit);
  cn.PREF = { REDUCE_MOTION: 1, NO_PET: 2, NO_SOUND: 4, COMPACT: 8 };

  let actx;
  cn.blip = function (freq = 660, dur = 0.06, type = "square", vol = 0.04) {
    if (cn.pref(4)) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g).connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* no audio */ }
  };

  const NAV = [
    ["home", "/", "home"], ["chat", "/chat", "chat"], ["arcade", "/arcade", "arcade"], ["files", "/files", "files"],
    ["notes", "/notes", "notes"], ["board", "/board", "board"], ["people", "/people", "people"],
    ["settings", "/settings", "settings"], ["system", "/system", "system"], ["admin", "/admin", "admin"], ["about", "/about", "about"],
  ];
  let onlineEl, dotEl, chatBadges = [];
  function renderShell(page) {
    const me = cn.me;
    const items = NAV.filter((n) => n[0] !== "admin" || me.admin);
    const top = h("header", { class: "top" },
      h("div", { class: "wrap" },
        h("a", { class: "brand", href: "/", "aria-label": "catnet home" }, (dotEl = h("span", { class: "dot", title: "connected" })), "catnet."),
        h("nav", { class: "topnav", "aria-label": "main" },
          items.slice(0, 7).map(([id, href]) => {
            const a = h("a", { href, class: id === page ? "on" : null, text: id });
            if (id === "chat") { const b = h("span", { class: "badge", hidden: true }); a.append(" ", b); chatBadges.push(b); }
            return a;
          }),
          h("a", { href: "#", text: "more", onclick: (e) => { e.preventDefault(); moreSheet(page, items); } })),
        h("div", { class: "who" },
          (onlineEl = h("span", { class: "online", text: "" })),
          h("a", { href: "/settings", title: "you: " + me.user.n, "aria-label": "your settings" }, cn.avatar(me.user.a, 0.62, me.user.n)))));
    const tabs = h("nav", { class: "tabbar", "aria-label": "main" },
      [["home", "/"], ["chat", "/chat"], ["arcade", "/arcade"], ["files", "/files"]].map(([id, href]) => {
        const a = h("a", { href, class: id === page ? "on" : null }, cn.icon(id), id);
        if (id === "chat") { const b = h("span", { class: "badge", hidden: true }); a.append(b); chatBadges.push(b); }
        return a;
      }),
      h("button", { class: ["notes", "board", "people", "settings", "system", "admin", "about"].includes(page) ? "on" : null, onclick: () => moreSheet(page, items) }, cn.icon("more"), "more"));
    document.body.prepend(top);
    document.body.append(tabs);
    const main = $("main");
    if (main) main.after(cn.credit("credit"));
  }
  function moreSheet(page, items) {
    sheet((box, close) => {
      box.append(
        h("div", { class: "row-flex" }, cn.tuft("curious", 0.6), h("div", {}, h("h2", { text: "everywhere on catnet" }), h("div", { class: "dim small", text: "signed in as " + cn.me.user.n }))),
        h("div", { class: "list", style: { marginTop: "12px" } },
          items.map(([id, href, icon]) => h("a", { class: "item", href }, cn.icon(icon), h("span", { class: "t", text: id }), id === page ? h("span", { class: "chip accent", text: "here" }) : null, h("span", { class: "go", text: "→" }))),
          h("button", { class: "item", onclick: () => { close(); cn.logout(); } }, cn.icon("logout"), h("span", { class: "t", text: "log out" }))));
    });
  }
  cn.logout = async function () {
    try { await cn.api("/api/logout", {}); } catch (e) { /* already gone */ }
    store.set("prefs", null);
    location.href = "/login?bye=1";
  };

  let offline = false, banner;
  function setOffline(v) {
    if (v === offline) return;
    offline = v;
    if (dotEl) dotEl.classList.toggle("off", v);
    if (v) {
      banner = h("div", { class: "banner", role: "alert" }, cn.tuft("confused", 0.45),
        h("span", { text: "catnet is unreachable. is this device still on the catnet wi-fi? retrying…" }));
      document.body.prepend(banner);
    } else if (banner) {
      banner.remove();
      banner = null;
      cn.toast("back online", "ok", 1800);
    }
  }

  const pulse = { interval: 9000, params: null, subs: [], timer: 0, busy: false };
  cn.onPulse = (fn) => pulse.subs.push(fn);
  cn.pulseConfig = (interval, params) => { pulse.interval = interval; pulse.params = params; cn.pulseNow(); };
  cn.chatSeen = (id) => { if (id != null) store.set("chatSeen." + cn.me.user.id, id); return store.get("chatSeen." + cn.me.user.id, 0); };
  cn.pulseNow = async function () {
    clearTimeout(pulse.timer);
    if (pulse.busy) return;
    pulse.busy = true;
    try {
      const params = pulse.params ? pulse.params() : { c: cn.chatSeen() };
      const d = await cn.api("/api/pulse?" + new URLSearchParams(params));
      if (onlineEl) onlineEl.textContent = d.on.length + " online";
      if (d.chat.unread != null) for (const b of chatBadges) { b.hidden = !d.chat.unread; b.textContent = d.chat.unread > 9 ? "9+" : d.chat.unread; }
      if (!d.clock) cn.api("/api/clock", { t: Date.now() }).catch(() => {});
      pulse.subs.forEach((fn) => fn(d));
    } catch (e) { /* offline banner handles it */ }
    pulse.busy = false;
    const wait = document.hidden ? Math.max(pulse.interval, 30000) : pulse.interval;
    pulse.timer = setTimeout(cn.pulseNow, offline ? 4000 : wait);
  };
  document.addEventListener("visibilitychange", () => { if (!document.hidden && cn.me) cn.pulseNow(); });

  cn.boot = async function (opts = {}) {
    let me;
    try {
      me = await cn.api("/api/me");
    } catch (e) {
      if (e.status !== 401) {
        const main = $("main");
        if (main) main.replaceChildren(h("div", { class: "empty" }, cn.tuft("confused", 1), h("p", { text: "couldn't reach catnet. pull to refresh in a moment." })));
      }
      throw e;
    }
    cn.me = me;
    csrf = me.csrf;
    cn.applyPrefs(me.accent, me.prefs);
    if (me.mustChange && opts.page !== "settings") {
      location.href = "/settings?must=1";
      return new Promise(() => {});
    }
    if (opts.shell !== false) renderShell(opts.page);
    if (!opts.manualPulse && opts.shell !== false) cn.pulseNow();
    return me;
  };

  cn.params = new URLSearchParams(location.search);
  cn.safeNext = (n) => (n && n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/");
})();
