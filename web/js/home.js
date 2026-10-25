// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { $, h } = cn;
  const me = await cn.boot({ page: "home" });
  const hr = new Date().getHours();
  const part = hr < 5 ? "still up" : hr < 12 ? "morning" : hr < 17 ? "afternoon" : hr < 22 ? "evening" : "late night";
  $("#greet").textContent = `${part}, ${me.user.n}.`;

  const ctx = { online: 1, storagePct: 0, unread: 0 };
  let sys = null, counts = {};

  const PLACES = [
    ["chat", "/chat", "chat", "the living room. say something."],
    ["arcade", "/arcade", "arcade", "DENIED., SIGNAL, nine lives"],
    ["files", "/files", "files", "share things, host a tiny site"],
    ["board", "/board", "board", "slow conversations, pinned notices"],
    ["notes", "/notes", "notes", "private scraps of paper"],
    ["people", "/people", "people", "everyone who lives here"],
    ["settings", "/settings", "settings", "your coat, colours, password"],
    ["system", "/system", "system", "the cat's vital signs"],
    ["about", "/about", "about", "what is this place?"],
  ];
  if (me.admin) PLACES.splice(8, 0, ["admin", "/admin", "admin", "keys to the house"]);
  const nums = {};
  $("#places").replaceChildren(...PLACES.map(([id, href, icon, desc]) =>
    h("a", { class: "item place", href },
      h("span", { class: "ico" }, cn.icon(icon)),
      h("span", {}, h("span", { class: "t", text: id }), h("div", { class: "desc", text: desc })),
      h("span", { class: "leader" }),
      (nums[id] = h("span", { class: "num" })),
      h("span", { class: "go", text: "→" }))));
  nums.arcade.textContent = "3 games";

  function setNum(id, text, hot) {
    if (!nums[id]) return;
    nums[id].textContent = text;
    nums[id].classList.toggle("hot", !!hot);
  }

  const status = $("#status");
  function renderStatus(p) {
    status.replaceChildren(
      h("span", { class: "live" }, h("b", { text: "online" })),
      h("span", {}, h("b", { text: String(p.on.length) }), p.on.length === 1 ? " cat here" : " cats here"),
      h("span", {}, "up ", h("b", { text: cn.dur(p.up) })),
      h("span", {}, h("b", { text: String(p.sta) }), p.sta === 1 ? " device on wi-fi" : " devices on wi-fi"),
      h("span", { class: "faint", text: "internet: absolutely not" }));
    $("#onCount").textContent = p.on.length + " online";
    $("#around").replaceChildren(...p.on.map((u) =>
      h("a", { href: "/people?u=" + encodeURIComponent(u.n) }, cn.avatar(u.a, 0.55, u.n), h("span", { text: u.n, style: { color: u.c } }))));
    ctx.online = p.on.length;
    ctx.unread = p.chat.unread || 0;
    setNum("chat", ctx.unread ? cn.plural(ctx.unread, "new message") : p.on.length > 1 ? p.on.length + " here" : "quiet", ctx.unread);
    if (p.ann && p.ann > cn.store.get("annSeen." + me.user.id, 0)) loadAnn();
  }
  cn.onPulse(renderStatus);

  async function loadAnn() {
    try {
      const d = await cn.api("/api/announce");
      $("#annBox").hidden = !d.items.length;
      $("#ann").replaceChildren(...d.items.map((a) =>
        h("div", { class: "note-card" + (a.lv ? " important" : "") },
          h("div", { text: a.text }),
          h("div", { class: "mono faint", style: { marginTop: "6px" }, text: `— ${a.by} · ${cn.ago(a.t)}` }))));
      if (d.items.length) cn.store.set("annSeen." + me.user.id, d.items[0].id);
    } catch (e) { /* non-fatal */ }
  }
  loadAnn();

  function meter(label, used, total) {
    const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
    return [
      h("div", { class: "store-line" }, h("span", { text: label }), h("span", { text: `${cn.bytes(used)} / ${cn.bytes(total)}` })),
      h("div", { class: "meter" + (pct > 90 ? " bad" : pct > 75 ? " warn" : ""), role: "meter", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": label }, h("i", { style: { width: pct + "%" } })),
    ];
  }
  async function loadSide() {
    try {
      const [s, f, b, n, u] = await Promise.all([
        cn.api("/api/sys"), cn.api("/api/files"), cn.api("/api/board"), cn.api("/api/notes"), cn.api("/api/users")]);
      sys = s;
      const quota = f.vol.quota || f.vol.t;
      $("#storage").replaceChildren(
        ...meter("catnet storage", s.fs.user.u, s.fs.user.t),
        ...meter(f.vol.quota ? "your files (quota)" : "your files", f.mine.u, quota),
        h("div", { class: "store-line" }, h("span", { text: "memory free" }), h("span", { text: cn.bytes(s.heap.free) })));
      ctx.storagePct = Math.round((s.fs.user.u / s.fs.user.t) * 100);
      counts = { files: f.files.length, posts: b.posts.length, notes: n.notes.length, users: u.users.length };
      setNum("files", cn.plural(counts.files, "file"));
      setNum("board", cn.plural(counts.posts, "post"));
      setNum("notes", cn.plural(counts.notes, "note"));
      setNum("people", cn.plural(counts.users, "cat"));
      setNum("system", "up " + cn.dur(s.up));
      $("#latest").replaceChildren(...(b.posts.length ? b.posts.slice(0, 3).map((p) =>
        h("a", { class: "item", href: "/board?p=" + p.id }, cn.avatar(p.a, 0.5, p.by),
          h("span", { class: "grow" }, h("span", { class: "t", text: p.title }),
            h("div", { class: "meta", text: `${p.by} · ${cn.ago(p.last)} · ${cn.plural(p.n, "reply")}` })),
          p.pin ? cn.icon("pin") : null, h("span", { class: "go", text: "→" })))
        : [h("div", { class: "empty" }, h("p", { text: "the board is empty. leave the first note!" }), h("a", { class: "btn small", href: "/board?new=1", text: "write a post" }))]));
    } catch (e) { cn.fail(e); }
  }
  loadSide();

  const lane = $("#lane");
  const pet = h("div", { class: "pet", tabindex: "0", role: "button", "aria-label": "pet Tuft" });
  const tuft = new cn.Tuft(null, 1.2);
  pet.append(tuft.el);
  lane.append(pet);
  const W = 96;
  let x = 10, target = 10, dir = 1, last = 0, raf = 0, next = 0, bubble = null, bubbleTimer = 0;
  let lastInput = Date.now(), asleep = false, clicks = [];
  const calm = cn.pref(cn.PREF.REDUCE_MOTION) || cn.pref(cn.PREF.NO_PET) || matchMedia("(prefers-reduced-motion: reduce)").matches;

  function place() {
    pet.style.transform = `translateX(${x}px)`;
    pet.classList.toggle("r", x > lane.clientWidth / 2);
  }
  function speak(text, ms = 4200) {
    if (bubble) bubble.remove();
    bubble = h("div", { class: "bubble", text });
    pet.append(bubble);
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { if (bubble) { bubble.remove(); bubble = null; } }, ms);
  }
  function maxX() { return Math.max(0, lane.clientWidth - W); }
  function walkTo(tx) {
    target = Math.max(0, Math.min(maxX(), tx));
    dir = target > x ? 1 : -1;
    tuft.el.classList.toggle("flip", dir < 0);
    tuft.play("walk");
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(step);
  }
  function step(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    x += dir * 46 * dt;
    if ((dir > 0 && x >= target) || (dir < 0 && x <= target)) {
      x = target;
      place();
      tuft.play(Math.random() < 0.3 ? "curious" : "idle");
      schedule();
      return;
    }
    place();
    raf = requestAnimationFrame(step);
  }
  function schedule(ms) {
    clearTimeout(next);
    next = setTimeout(think, ms || 3000 + Math.random() * 5000);
  }
  function think() {
    if (document.hidden) return schedule(10000);
    if (Date.now() - lastInput > 60000 && !asleep) {
      asleep = true;
      tuft.play("sleep");
      speak("zz… (wake me if something happens)", 5000);
      return;
    }
    if (asleep) return schedule(8000);
    const r = Math.random();
    if (calm) {
      tuft.play(r < 0.2 ? "curious" : "idle");
    } else if (r < 0.55) {
      walkTo(Math.random() * maxX());
      return;
    } else if (r < 0.7) {
      tuft.play("curious");
    } else if (r < 0.8) {
      tuft.play("think");
      speak(cn.tuftSays(ctx));
    } else {
      tuft.play("idle");
    }
    schedule();
  }
  function wake() {
    lastInput = Date.now();
    if (!asleep) return;
    asleep = false;
    tuft.play("surprised", 900);
    speak("i was NOT asleep.", 2200);
    schedule(2500);
  }
  ["pointerdown", "keydown", "scroll"].forEach((e) => addEventListener(e, wake, { passive: true }));
  pet.addEventListener("click", (e) => {
    e.stopPropagation();
    const now = Date.now();
    clicks = clicks.filter((t) => now - t < 2500).concat(now);
    cancelAnimationFrame(raf);
    if (clicks.length >= 4) {
      tuft.play("surprised", 1400);
      speak("personal space, please. i am a professional.");
      clicks = [];
    } else {
      tuft.play("happy", 1600);
      speak(cn.tuftSays(ctx));
      cn.blip(880, 0.05, "triangle", 0.03);
    }
    schedule(4500);
  });
  pet.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pet.click(); } });
  addEventListener("resize", () => { x = Math.min(x, maxX()); place(); });
  x = calm ? 0 : Math.min(maxX(), 40);
  place();
  setTimeout(() => speak(me.mustChange ? "please change your password!" : cn.tuftSays(ctx), 5200), 600);
  schedule(4000);
})();
