// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { $, h } = cn;
  const me = await cn.boot({ page: "chat", manualPulse: true });
  const log = $("#log"), text = $("#text"), send = $("#send"), typingEl = $("#typing");
  send.append(cn.icon("send"));
  const LIMIT = 280;
  const enc = new TextEncoder();
  let last = 0, firstLoad = true, typingSince = 0, lastRender = null;
  const nodes = new Map(); // id -> element

  if (me.admin) {
    const b = $("#modBtn");
    b.hidden = false;
    b.append(cn.icon("admin"));
    b.addEventListener("click", modMenu);
  }

  function nearBottom() { return log.scrollHeight - log.scrollTop - log.clientHeight < 80; }
  function dayKey(t) { return t ? new Date(t * 1000).toDateString() : "?"; }

  let jump;
  function showJump() {
    if (jump) return;
    jump = h("button", { class: "btn small jump", text: "new messages ↓", onclick: () => { log.scrollTop = log.scrollHeight; hideJump(); } });
    $("#main").style.position = "relative";
    $("#main").append(jump);
  }
  function hideJump() { if (jump) { jump.remove(); jump = null; } }
  log.addEventListener("scroll", () => { if (nearBottom()) hideJump(); });

  function msgNode(m) {
    if (m.k === 1 || m.k === 2) {
      return h("div", { class: "evt" }, h("b", { text: m.n }), m.k === 1 ? " wandered in" : " wandered off", " · " + cn.clock(m.t));
    }
    if (m.k === 3) return h("div", { class: "evt sys" }, "tuft: ", m.x);
    const mine = m.u === me.user.id;
    const prev = lastRender;
    const cont = prev && prev.u === m.u && (prev.k === 0 || prev.k === 4) && m.k !== 5 && m.t - prev.t < 300 && dayKey(prev.t) === dayKey(m.t);
    const cls = "msg" + (cont ? " cont" : "") + (mine ? " mine" : "") + (m.k === 4 ? " action" : "") + (m.k === 5 ? " removed" : "") + (m.isNew ? " new" : "");
    const mention = m.k !== 5 && new RegExp("@" + me.user.n + "\\b", "i").test(m.x);
    const txt = h("div", { class: "txt", style: mention ? { background: "var(--accent-soft)", boxShadow: "-4px 0 0 var(--accent)" } : null },
      m.k === 5 ? "message removed" : m.k === 4 ? `${m.n} ${m.x}` : m.x);
    const tools = h("div", { class: "tools" });
    if (m.k !== 5 && (mine || me.admin)) tools.append(h("button", { class: "iconbtn", title: "delete", "aria-label": "delete message", onclick: () => del(m) }, cn.icon("trash")));
    if (me.admin && !mine && m.u) tools.append(h("button", { class: "iconbtn", title: "mute " + m.n, "aria-label": "mute " + m.n, onclick: () => mute(m) }, cn.icon("lock")));
    return h("div", { class: cls, "data-id": m.i },
      cn.avatar(m.a != null ? m.a : avatarOf(m), 0.55, m.n),
      h("div", { class: "head" }, h("span", { class: "who", style: { color: m.c }, text: m.n }), h("span", { class: "when", text: cn.clock(m.t) })),
      txt, tools);
  }
  const avatars = {};
  function avatarOf(m) { return avatars[m.n] != null ? avatars[m.n] : m.u % 12; }

  function append(m) {
    if (nodes.has(m.i)) return;
    if (lastRender && dayKey(lastRender.t) !== dayKey(m.t) && m.t) {
      log.append(h("div", { class: "daybreak", text: new Date(m.t * 1000).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) }));
    }
    const el = msgNode(m);
    nodes.set(m.i, el);
    log.append(el);
    if (m.k !== 1 && m.k !== 2 && m.k !== 3) lastRender = m;
  }

  function render(msgs) {
    if (firstLoad) {
      log.replaceChildren();
      if (!msgs.length) {
        log.append(h("div", { class: "empty", id: "emptyNote" }, cn.tuft("sleep", 1), h("p", { text: "nobody has said anything yet. break the silence?" })));
      }
    } else if (msgs.length) {
      const e = $("#emptyNote");
      if (e) e.remove();
    }
    const stick = firstLoad || nearBottom();
    let fromOthers = false;
    for (const m of msgs) {
      if (!firstLoad) m.isNew = true;
      append(m);
      if (!firstLoad && m.u !== me.user.id && (m.k === 0 || m.k === 4)) fromOthers = true;
    }
    if (stick) log.scrollTop = log.scrollHeight;
    else if (fromOthers) showJump();
    if (fromOthers && document.hidden) document.title = "• chat — catnet.";
    if (fromOthers) cn.blip(740, 0.05, "triangle", 0.025);
    firstLoad = false;
  }

  function markRemoved(ids) {
    for (const id of ids) {
      const el = nodes.get(id);
      if (el && !el.classList.contains("removed")) {
        el.classList.add("removed");
        el.querySelector(".txt").textContent = "message removed";
        const t = el.querySelector(".tools");
        if (t) t.replaceChildren();
      }
    }
  }

  cn.onPulse((d) => {
    const c = d.chat;
    if (c.last < last) {
      last = 0; firstLoad = true; nodes.clear(); lastRender = null;
      return cn.pulseNow();
    }
    for (const u of c.here || []) avatars[u.n] = u.a;
    for (const u of d.on) avatars[u.n] = u.a;
    if (c.msgs) {
      render(c.msgs);
      if (c.msgs.length) last = c.msgs[c.msgs.length - 1].i;
      else last = Math.max(last, c.last);
    }
    if (c.removed) markRemoved(c.removed);
    cn.chatSeen(last);
    const here = c.here || [];
    $("#hereCount").textContent = here.length + " here";
    $("#here").replaceChildren(...here.slice(0, 8).map((u) => cn.avatar(u.a, 0.5, u.n)));
    const typers = here.filter((u) => u.typing).map((u) => u.n);
    typingEl.textContent = typers.length ? typers.join(", ") + (typers.length > 1 ? " are" : " is") + " typing…" : "";
  });
  cn.pulseConfig(1500, () => ({ c: last, chat: 1, typing: Date.now() - typingSince < 4000 ? 1 : 0 }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) document.title = "chat — catnet."; });

  function bytes() { return enc.encode(text.value).length; }
  function grow() {
    text.style.height = "auto";
    text.style.height = Math.min(120, text.scrollHeight + 2) + "px";
    const left = LIMIT - bytes();
    send.disabled = !text.value.trim() || left < 0;
    text.style.borderColor = left < 0 ? "var(--bad)" : "";
  }
  text.addEventListener("input", () => { typingSince = Date.now(); grow(); });
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); }
  });
  $("#composer").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = text.value.trim();
    if (!v) return;
    if (bytes() > LIMIT) return cn.toast(`that's ${bytes() - LIMIT} bytes too long (max ${LIMIT})`, "bad");
    text.value = "";
    typingSince = 0;
    grow();
    try {
      const r = await cn.api("/api/chat/send", { text: v });
      r.msg.a = me.user.a;
      r.msg.isNew = true;
      append(r.msg);
      last = Math.max(last, r.msg.i);
      cn.chatSeen(last);
      log.scrollTop = log.scrollHeight;
      hideJump();
      const e = $("#emptyNote");
      if (e) e.remove();
    } catch (ex) {
      if (!text.value) text.value = v;  // give the failed message back
      grow();
      cn.fail(ex);
    }
    text.focus();
  });
  grow();

  async function del(m) {
    if (!(await cn.ask("delete this message?", `"${m.x.slice(0, 80)}"`, "delete", true))) return;
    try { await cn.api("/api/chat/delete", { id: m.i }); markRemoved([m.i]); } catch (e) { cn.fail(e); }
  }
  async function mute(m) {
    const mins = await cn.promptText(`mute ${m.n}`, "minutes (0 unmutes)", "10", "mute", { type: "number", max: 4 });
    if (mins == null) return;
    try {
      const users = await cn.api("/api/admin/users");
      const u = users.users.find((x) => x.n === m.n);
      if (!u) throw new Error("that user is gone");
      await cn.api("/api/chat/mute", { id: u.id, min: parseInt(mins, 10) || 0 });
      cn.toast(parseInt(mins, 10) ? `${m.n} muted` : `${m.n} unmuted`);
      cn.pulseNow();
    } catch (e) { cn.fail(e); }
  }
  async function modMenu() {
    if (!(await cn.ask("sweep the chat?", "removes every message for everyone. this can't be undone.", "sweep it", true))) return;
    try {
      await cn.api("/api/chat/clear", {});
      last = 0; firstLoad = true; nodes.clear(); lastRender = null;
      cn.pulseNow();
    } catch (e) { cn.fail(e); }
  }
})();
