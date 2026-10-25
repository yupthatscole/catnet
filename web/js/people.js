// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { $, h } = cn;
  const me = await cn.boot({ page: "people" });
  const GAME_NAMES = { denied: "DENIED.", signal: "SIGNAL", nine: "nine lives" };

  async function directory() {
    $("#dirView").hidden = false;
    $("#profileView").hidden = true;
    try {
      const d = await cn.api("/api/users");
      d.users.sort((a, b) => (b.on - a.on) || a.n.localeCompare(b.n));
      $("#people").replaceChildren(...d.users.map((u) =>
        h("a", { class: "person", href: "/people?u=" + encodeURIComponent(u.n) },
          cn.avatar(u.a, 1.1, u.n),
          h("b", { style: { color: u.c } }, u.on ? h("span", { class: "on", title: "online" }) : null, u.n),
          h("span", { class: "st", text: u.st || (u.r === "admin" ? "keeper of the keys" : "a cat") }))));
    } catch (e) { cn.fail(e); }
  }

  async function profile(name) {
    $("#dirView").hidden = true;
    const box = $("#profileView");
    box.hidden = false;
    box.replaceChildren(h("div", { class: "loading" }, cn.tuft("think", 0.7), "sniffing around…"));
    try {
      const [d, scores] = await Promise.all([cn.api("/api/users/get?n=" + encodeURIComponent(name)), cn.api("/api/scores")]);
      const u = d.user, s = u.stats;
      const best = Object.entries(scores).map(([g, v]) => {
        const row = v.top.find((t) => t.n === u.n);
        return row ? h("div", { class: "stat" }, h("b", { text: String(row.s) }), h("span", { text: GAME_NAMES[g] + " best" })) : null;
      });
      box.replaceChildren(
        h("div", { style: { paddingTop: "18px" } }, h("a", { href: "/people", text: "← everyone" })),
        h("div", { class: "profile-head" },
          cn.avatar(u.a, 1.6, u.n),
          h("div", { class: "grow" },
            h("h1", { text: u.n, style: { color: u.c } }),
            h("div", { class: "mono dim", text: `${u.r}${u.on ? " · online now" : u.seen ? " · seen " + cn.ago(u.seen) : ""}${u.since ? " · joined " + new Date(u.since * 1000).toLocaleDateString() : ""}` }),
            u.st ? h("p", { text: "“" + u.st + "”" }) : null)),
        u.bio ? h("p", { class: "bio frame", text: u.bio, style: { whiteSpace: "pre-wrap", marginTop: "14px" } }) : null,
        h("div", { class: "sec" }, "stats"),
        h("div", { class: "stats" },
          [["logins", s.logins], ["chat messages", s.msgs], ["uploads", s.uploads], ["board posts", s.posts], ["games played", s.games], ["public files", d.files]]
            .map(([k, v]) => h("div", { class: "stat" }, h("b", { text: String(v) }), h("span", { text: k }))),
          best),
        h("div", { class: "sec" }, "on the web"),
        d.site
          ? h("a", { class: "item", href: `/~${u.n}/`, target: "_blank", rel: "noopener" }, cn.icon("globe"), h("span", { class: "grow" }, h("span", { class: "t", text: `${u.n}'s homepage` }), h("div", { class: "meta", text: `/~${u.n}/` })), h("span", { class: "go", text: "→" }))
          : h("p", { class: "dim", text: u.id === me.user.id ? "upload a public file called index.html to get a homepage at /~" + u.n + "/" : `${u.n} hasn't built a homepage yet.` }),
        u.id === me.user.id ? h("p", { style: { marginTop: "18px" } }, h("a", { class: "btn ghost", href: "/settings", text: "edit your profile" })) : null);
    } catch (e) {
      box.replaceChildren(h("div", { class: "empty" }, cn.tuft("confused", 1), h("p", { text: e.message })), h("a", { href: "/people", text: "← everyone" }));
    }
  }

  const u = cn.params.get("u");
  if (u) profile(u); else directory();
})();
