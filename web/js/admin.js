// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { $, h } = cn;
  const me = await cn.boot({ page: "admin" });
  if (!me.admin) {
    $("#main").replaceChildren(h("div", { class: "empty" }, cn.tuft("surprised", 1), h("p", { text: "this room is for admins. tuft is blocking the door." })));
    return;
  }

  async function users() {
    try {
      const d = await cn.api("/api/admin/users");
      $("#users").replaceChildren(...d.users.map((u) => {
        const acts = h("div", { class: "acts" });
        const act = (label, action, opts = {}) => acts.append(h("button", { class: "btn small " + (opts.danger ? "danger" : "ghost"), text: label, onclick: () => run(u, action, opts) }));
        if (u.r === "admin") act("demote", "demote"); else act("make admin", "promote");
        if (u.id !== me.user.id) {
          act(u.disabled ? "enable" : "disable", u.disabled ? "enable" : "disable");
          act("reset password", "reset", { confirm: `reset ${u.n}'s password? you'll get a temporary one to pass on.` });
          act("delete", "delete", { danger: true, confirm: `delete ${u.n}? their files, notes and saves are erased. this can't be undone.` });
        }
        return h("div", { class: "urow" },
          h("div", {},
            h("b", { text: u.n }), " ",
            h("span", { class: "chip" + (u.r === "admin" ? " accent" : ""), text: u.r }), " ",
            u.disabled ? h("span", { class: "chip warn", text: "disabled" }) : null, " ",
            u.mustChange ? h("span", { class: "chip warn", text: "temp password" }) : null, " ",
            u.muted ? h("span", { class: "chip warn", text: "muted" }) : null,
            h("div", { class: "mono faint", text: (u.on ? "online now" : u.seen ? "seen " + cn.ago(u.seen) : "never seen") + (u.since ? " · joined " + new Date(u.since * 1000).toLocaleDateString() : "") })),
          acts);
      }));
    } catch (e) { cn.fail(e); }
  }
  async function run(u, action, opts) {
    if (opts.confirm && !(await cn.ask(action + "?", opts.confirm, action, !!opts.danger))) return;
    try {
      const r = await cn.api("/api/admin/user", { id: u.id, action });
      if (r.temp) {
        cn.sheet((box, close) => box.append(
          h("h2", { text: "temporary password" }),
          h("p", { class: "dim", text: `give this to ${u.n}. they'll have to change it when they log in.` }),
          h("p", { class: "pix", style: { fontSize: "30px", color: "var(--accent)", userSelect: "all" }, text: r.temp }),
          h("div", { class: "actions" }, h("button", { class: "btn", text: "done", onclick: () => close() }))));
      } else cn.toast("done");
      users();
    } catch (e) { cn.fail(e); }
  }

  async function ann() {
    try {
      const d = await cn.api("/api/announce");
      $("#annList").replaceChildren(...(d.items.length ? d.items.map((a) =>
        h("div", { class: "item" }, h("span", { class: "grow" }, h("span", { text: a.text, class: a.lv ? "warn" : null }), h("div", { class: "meta", text: `${a.by} · ${cn.ago(a.t)}` })),
          h("button", { class: "iconbtn", "aria-label": "remove announcement", onclick: async () => { try { await cn.api("/api/announce/delete", { id: a.id }); ann(); } catch (e) { cn.fail(e); } } }, cn.icon("trash"))))
        : [h("p", { class: "dim", text: "no announcements right now." })]));
    } catch (e) { cn.fail(e); }
  }
  $("#annForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await cn.api("/api/announce/add", { text: $("#annText").value, lv: $("#annImp").checked });
      $("#annText").value = "";
      cn.toast("announced");
      ann();
    } catch (ex) { cn.fail(ex); }
  });

  const ch = $("#cfgCh");
  for (let i = 1; i <= 11; i++) ch.append(h("option", { value: String(i), text: "channel " + i + (i === 1 || i === 6 || i === 11 ? " (non-overlapping)" : "") }));
  try {
    const s = await cn.api("/api/sys");
    const c = s.cfg;
    $("#cfgSsid").value = c.ssid;
    ch.value = String(c.ch);
    $("#cfgCaptive").checked = c.captive;
    $("#cfgLow").checked = c.lowpow;
    $("#cfgOpen").checked = c.open;
    $("#cfgMotd").value = c.motd;
  } catch (e) { cn.fail(e); }

  $("#saveAccess").addEventListener("click", async () => {
    try {
      await cn.api("/api/admin/config", { open: $("#cfgOpen").checked, motd: $("#cfgMotd").value });
      cn.toast("access settings saved");
    } catch (e) { cn.fail(e); }
  });
  $("#keyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await cn.api("/api/admin/portalkey", { key: $("#newKey").value });
      $("#newKey").value = "";
      cn.toast("portal key changed");
    } catch (ex) { cn.fail(ex); }
  });
  $("#wifiForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = $("#cfgPass").value;
    if (!(await cn.ask("restart wi-fi?", pass ? "everyone gets disconnected and must use the NEW password. write it down first!" : "everyone gets disconnected for a few seconds.", "save & restart"))) return;
    try {
      const r = await cn.api("/api/admin/config", { ssid: $("#cfgSsid").value, wpass: pass, ch: ch.value, captive: $("#cfgCaptive").checked, lowpow: $("#cfgLow").checked });
      cn.toast(r.wifiRestart ? "saved. catnet is restarting — reconnect in ~15 seconds." : "saved (nothing needed a restart)", "ok", 6000);
    } catch (ex) { cn.fail(ex); }
  });
  $("#restart").addEventListener("click", async () => {
    if (!(await cn.ask("restart catnet?", "everyone is logged out. files, chat and accounts are kept.", "restart"))) return;
    try {
      await cn.api("/api/admin/restart", {});
      cn.toast("restarting… this page will reconnect by itself.", "ok", 8000);
    } catch (e) { cn.fail(e); }
  });

  users();
  ann();
})();
