// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { $, $$, h } = cn;
  let me = await cn.boot({ page: "settings" });
  const u = me.user;
  let avatar = u.a, color = u.c;
  $("#revoke").firstChild.replaceWith(cn.icon("logout"));
  $("#pwUser").value = u.n;
  $("#profileLink").href = "/people?u=" + encodeURIComponent(u.n);

  function header() {
    $("#meAv").replaceChildren(cn.avatar(avatar, 1.1, u.n));
    $("#who").textContent = `${u.n} · ${me.admin ? "admin" : "member"}`;
    const p = $("#namePreview");
    p.textContent = u.n;
    p.style.color = color;
  }

  if (me.mustChange || cn.params.has("must")) {
    $("#mustBox").hidden = false;
    $("#profileSec").hidden = $("#lookSec").hidden = $("#moreSec").hidden = true;
    $("#pwOld").placeholder = "the temporary password";
  }

  $("#coats").replaceChildren(...cn.COAT_NAMES.map((name, i) =>
    h("button", { type: "button", class: i === avatar ? "on" : null, "aria-label": name + " coat", "aria-pressed": i === avatar ? "true" : "false",
      onclick: (e) => {
        avatar = i;
        $$("#coats button").forEach((b, j) => { b.classList.toggle("on", j === i); b.setAttribute("aria-pressed", j === i); });
        header();
      } }, cn.avatar(i, 0.8), name)));

  const COLORS = ["#b8a3fb", "#f49ad8", "#8fe3c4", "#ffc977", "#8fc7ff", "#ff9f8f", "#e8e3f2", "#c3f584", "#ffb3c7", "#9fe6ff"];
  function swatches() {
    const custom = h("input", { type: "color", value: color, "aria-label": "custom colour", style: { width: "42px", height: "34px", padding: "0", border: "0", background: "none" },
      oninput: (e) => { color = e.target.value; swatches(); header(); } });
    $("#swatches").replaceChildren(...COLORS.map((c) =>
      h("button", { type: "button", class: c === color ? "on" : null, style: { background: c }, "aria-label": "colour " + c,
        onclick: () => { color = c; swatches(); header(); } })), custom);
  }
  swatches();
  $("#status").value = u.st;
  $("#bio").value = u.bio;
  header();

  $("#saveProfile").addEventListener("click", async () => {
    try {
      me = await cn.api("/api/profile", { avatar, color, status: $("#status").value, bio: $("#bio").value });
      cn.toast("profile saved. looking sharp.");
    } catch (e) { cn.fail(e); }
  });

  const ACCENTS = ["#b8a3fb", "#f49ad8", "#8fe3c4", "#ffc977", "#8fc7ff", "#ff9f8f"];
  const ACCENT_NAMES = ["lavender", "rose", "mint", "amber", "sky", "coral"];
  let accent = me.accent, prefs = me.prefs;
  function accents() {
    $("#accents").replaceChildren(...ACCENTS.map((c, i) =>
      h("button", { type: "button", class: i === accent ? "on" : null, style: { background: c }, title: ACCENT_NAMES[i], "aria-label": ACCENT_NAMES[i] + " accent",
        onclick: () => { accent = i; accents(); savePrefs(); } })));
  }
  accents();
  const BITS = { pMotion: 1, pPet: 2, pSound: 4, pCompact: 8 };
  for (const id in BITS) {
    $("#" + id).checked = !!(prefs & BITS[id]);
    $("#" + id).addEventListener("change", (e) => { prefs = e.target.checked ? prefs | BITS[id] : prefs & ~BITS[id]; savePrefs(); });
  }
  async function savePrefs() {
    cn.applyPrefs(accent, prefs);
    try {
      me = await cn.api("/api/profile", { accent, prefs });
      cn.me = me;
    } catch (e) { cn.fail(e); }
  }

  $("#pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#pwErr");
    err.textContent = "";
    if ($("#pwNew").value !== $("#pwNew2").value) { err.textContent = "the new passwords don't match."; return; }
    try {
      await cn.api("/api/password", { old: $("#pwOld").value, new: $("#pwNew").value });
      $("#pwOld").value = $("#pwNew").value = $("#pwNew2").value = "";
      cn.toast("password changed. other devices were signed out.");
      if (!$("#mustBox").hidden) setTimeout(() => { location.href = "/"; }, 900);
    } catch (ex) { err.textContent = ex.message; }
  });

  $("#revoke").addEventListener("click", async () => {
    try {
      const r = await cn.api("/api/sessions/revoke", {});
      cn.toast(r.closed ? `signed out ${cn.plural(r.closed, "other session")}` : "no other sessions were open");
    } catch (e) { cn.fail(e); }
  });
  $("#resetSaves").addEventListener("click", () => {
    cn.sheet((box, close) => {
      box.append(h("h2", { text: "reset which game?" }), h("p", { class: "dim", text: "your high scores stay on the leaderboard." }),
        h("div", { class: "list" }, [["denied", "DENIED."], ["signal", "SIGNAL"], ["nine", "nine lives"]].map(([g, name]) =>
          h("button", { class: "item", onclick: async () => {
            close();
            if (!(await cn.ask(`reset ${name}?`, "your saved progress for this game will be erased.", "reset", true))) return;
            try {
              await cn.api("/api/save", { g, d: "null" });
              try { localStorage.removeItem("cn.save." + g + "." + u.id); } catch (e) { /* ignore */ }
              cn.toast(name + " progress reset");
            } catch (e) { cn.fail(e); }
          } }, h("span", { class: "t", text: name }), h("span", { class: "go", text: "→" })))));
    });
  });
  $("#logout").addEventListener("click", () => cn.logout());
})();
