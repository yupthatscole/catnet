// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { $, h } = cn;
  await cn.boot({ page: "system" });
  const tuft = new cn.Tuft(null, 0.9);
  $("#tuftBox").append(tuft.el);

  function rows(table, pairs) {
    $(table).replaceChildren(...pairs.filter(Boolean).map(([k, v]) => h("tr", {}, h("td", { text: k }), h("td", {}, v))));
  }
  function gauge(label, used, total, fmt = cn.bytes) {
    const pct = total ? Math.round((used / total) * 100) : 0;
    return h("div", { class: "frame tight" },
      h("div", { class: "store-line", style: { marginTop: 0 } }, h("span", { text: label }), h("span", { text: `${pct}%` })),
      h("div", { class: "meter" + (pct > 90 ? " bad" : pct > 75 ? " warn" : "") }, h("i", { style: { width: pct + "%" } })),
      h("div", { class: "mono faint", style: { marginTop: "6px" }, text: `${fmt(used)} of ${fmt(total)}` }));
  }

  async function load() {
    let s;
    try { s = await cn.api("/api/sys"); } catch (e) { return cn.fail(e); }
    const heapUsed = s.heap.total - s.heap.free;
    const userPct = s.fs.user.u / s.fs.user.t;
    const issues = [];
    if (!s.web.ok) issues.push("web files damaged — re-upload the filesystem image");
    if (s.heap.free < 30000) issues.push("memory is tight");
    if (userPct > 0.9) issues.push("storage almost full");
    if (s.reset.includes("brownout")) issues.push("last reset was a power dip — check the power bank/cable");
    if (s.reset.includes("crash") || s.reset.includes("watchdog")) issues.push(`last reset: ${s.reset}`);
    $("#verdict").textContent = issues.length ? issues.join(" · ") : `all good. up ${cn.dur(s.up)}, purring quietly.`;
    tuft.play(issues.length ? "confused" : "happy", issues.length ? 0 : 2000);

    $("#gauges").replaceChildren(
      gauge("user storage", s.fs.user.u, s.fs.user.t),
      gauge("web assets", s.fs.web.u, s.fs.web.t),
      gauge("memory in use", heapUsed, s.heap.total),
      gauge("firmware slot", s.chip.sketch, s.chip.sketchMax));

    rows("#net", [
      ["wi-fi name", s.wifi.ssid],
      ["address", `http://${s.wifi.ip} · http://catnet.lan`],
      ["channel", String(s.wifi.ch)],
      ["devices connected", `${s.wifi.sta} of ${s.wifi.max}`],
      ["accounts", `${s.users} of ${s.maxUsers}`],
      ["sessions open", String(s.sessions)],
      ["captive portal", s.wifi.captive ? "on (phones pop up the sign-in page)" : "off (only catnet.lan resolves)"],
      ["radio power", s.wifi.lowpow ? "low (battery saver)" : "normal"],
      ["clock", s.clock ? new Date(s.now * 1000).toLocaleString() + " (set by a visitor's phone)" : "unknown until someone logs in"],
      s.fails != null ? ["failed logins since boot", String(s.fails)] : null,
    ]);
    rows("#hw", [
      ["catnet", `v${s.ver} · firmware built ${s.build}`],
      ["web assets", `${s.web.ok ? "ok" : "DAMAGED"} · build ${s.web.id} · ${s.web.files} files`],
      ["chip", `${s.chip.model} rev ${s.chip.rev} · ${s.chip.cores} cores @ ${s.chip.mhz} MHz`],
      ["flash", cn.bytes(s.chip.flash)],
      ["memory", `${cn.bytes(s.heap.free)} free · lowest ${cn.bytes(s.heap.min)} · largest block ${cn.bytes(s.heap.block)}`],
      ["uptime", cn.dur(s.up)],
      ["boots", String(s.boots)],
      ["last reset", s.reset + (s.why ? ` (${s.why})` : "")],
      ["sdk", s.chip.sdk],
    ]);
    if (s.stations) {
      $("#staSec").hidden = false;
      rows("#sta", s.stations.length ? s.stations.map((st) => [st.ip === "0.0.0.0" ? "(no address yet)" : st.ip, `${st.mac} · signal ${st.rssi} dBm ${st.rssi > -60 ? "▮▮▮" : st.rssi > -75 ? "▮▮▯" : "▮▯▯"}`]) : [["", "nobody"]]);
    }
    if (s.events) {
      $("#evSec").hidden = false;
      $("#events").replaceChildren(...s.events.map((e) => h("div", {}, h("span", { text: e.t ? cn.clock(e.t) : "+" + cn.dur(e.up) }), h("b", { text: e.m, style: { fontWeight: "normal" } }))));
    }
  }
  load();
  setInterval(() => { if (!document.hidden) load(); }, 15000);
})();
