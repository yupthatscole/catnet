// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { $, h } = cn;
  const me = await cn.boot({ page: "board" });
  const enc = new TextEncoder();
  const views = ["listView", "threadView", "composeView"];
  function show(v) { views.forEach((x) => { $("#" + x).hidden = x !== v; }); scrollTo(0, 0); }

  async function list() {
    show("listView");
    try {
      const d = await cn.api("/api/board");
      const box = $("#posts");
      if (!d.posts.length) {
        box.replaceChildren(h("div", { class: "empty" }, cn.tuft("curious", 1), h("p", { text: "the board is bare. tuft is staring at an empty cork rectangle." })));
        return;
      }
      box.replaceChildren(...d.posts.map((p) =>
        h("a", { class: "item post", href: "/board?p=" + p.id, onclick: (e) => { e.preventDefault(); go(p.id); } },
          cn.avatar(p.a, 0.6, p.by),
          h("span", { class: "grow" },
            h("span", { class: "t", text: p.title }),
            h("div", { class: "meta", text: `${p.by} · ${p.t > 1e9 ? cn.ago(p.t) : "earlier"}${p.n ? ` · ${cn.plural(p.n, "reply")}, last ${cn.ago(p.last)}` : " · no replies yet"}` })),
          p.pin ? h("span", { class: "chip accent" }, cn.icon("pin"), "pinned") : null,
          h("span", { class: "go", text: "→" }))));
    } catch (e) { cn.fail(e); }
  }

  let current = null;
  async function thread(id) {
    show("threadView");
    $("#thread").replaceChildren(h("div", { class: "loading" }, cn.tuft("think", 0.7), "unpinning…"));
    try {
      const p = await cn.api("/api/board/get?id=" + id);
      current = p;
      const mine = p.uid === me.user.id;
      const tools = h("div", { class: "row-flex" });
      if (me.admin) tools.append(h("button", { class: "btn ghost small", text: p.pin ? "unpin" : "pin to top", onclick: () => pin(p) }));
      if (mine || me.admin) tools.append(h("button", { class: "btn ghost small", text: "delete post", onclick: () => delPost(p) }));
      $("#thread").replaceChildren(
        h("h1", { text: p.title, style: { margin: "14px 0 10px", overflowWrap: "anywhere" } }),
        h("div", { class: "byline" }, cn.avatar(p.a, 0.55, p.by), h("a", { href: "/people?u=" + encodeURIComponent(p.by) }, h("b", { text: p.by, style: { color: p.c } })), h("span", { text: "· " + (p.t > 1e9 ? cn.ago(p.t) : "earlier") }), p.pin ? h("span", { class: "chip accent", text: "pinned" }) : null),
        p.body ? h("div", { class: "thread-body frame", style: { marginTop: "14px" }, text: p.body }) : null,
        h("div", { style: { marginTop: "10px" } }, tools));
      $("#rcount").textContent = p.replies.length + " / 30";
      $("#replies").replaceChildren(...(p.replies.length ? p.replies.map((r) =>
        h("div", { class: "reply" },
          h("div", { class: "byline" }, cn.avatar(r.a, 0.45, r.by), h("b", { text: r.by, style: { color: r.c } }), h("span", { text: "· " + (r.t > 1e9 ? cn.ago(r.t) : "earlier") }),
            (r.uid === me.user.id || me.admin) ? h("button", { class: "linkbtn dangerous small", style: { marginLeft: "auto" }, text: "delete", onclick: () => delReply(p, r) }) : null),
          h("div", { class: "rb", text: r.body })))
        : [h("p", { class: "dim", text: "no replies yet. be the first." })]));
      $("#replyForm").hidden = p.replies.length >= 30;
    } catch (e) {
      $("#thread").replaceChildren(h("div", { class: "empty" }, cn.tuft("confused", 1), h("p", { text: e.message })));
    }
  }

  function go(id) {
    history.pushState(null, "", "/board?p=" + id);
    thread(id);
  }
  function route() {
    const p = parseInt(new URLSearchParams(location.search).get("p"), 10);
    if (p) return thread(p);
    if (new URLSearchParams(location.search).has("new")) return compose();
    list();
  }
  addEventListener("popstate", route);
  $("#backLink").addEventListener("click", (e) => { e.preventDefault(); history.pushState(null, "", "/board"); list(); });

  function compose() {
    show("composeView");
    $("#ptitle").focus();
  }
  $("#newBtn").addEventListener("click", () => { history.pushState(null, "", "/board?new=1"); compose(); });

  function counter(input, out, max) {
    input.addEventListener("input", () => {
      const n = enc.encode(input.value).length;
      out.textContent = `${n} / ${max}`;
      out.className = "hint grow" + (n > max ? " bad" : "");
    });
  }
  counter($("#pbody"), $("#pchars"), 1000);
  counter($("#replyText"), $("#rchars"), 400);

  $("#postForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const r = await cn.api("/api/board/post", { title: $("#ptitle").value, body: $("#pbody").value });
      $("#ptitle").value = $("#pbody").value = "";
      cn.toast("posted. tuft approves.");
      go(r.id);
    } catch (ex) { cn.fail(ex); }
  });
  $("#replyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!current) return;
    try {
      await cn.api("/api/board/reply", { id: current.id, body: $("#replyText").value });
      $("#replyText").value = "";
      $("#rchars").textContent = "0 / 400";
      thread(current.id);
    } catch (ex) { cn.fail(ex); }
  });

  async function delPost(p) {
    if (!(await cn.ask("delete this post?", "the post and all its replies will be gone.", "delete", true))) return;
    try { await cn.api("/api/board/delete", { id: p.id }); cn.toast("post deleted"); history.pushState(null, "", "/board"); list(); } catch (e) { cn.fail(e); }
  }
  async function delReply(p, r) {
    if (!(await cn.ask("delete this reply?", r.body.slice(0, 100), "delete", true))) return;
    try { await cn.api("/api/board/delreply", { id: p.id, i: r.i }); thread(p.id); } catch (e) { cn.fail(e); }
  }
  async function pin(p) {
    try { await cn.api("/api/board/pin", { id: p.id, pin: !p.pin }); thread(p.id); } catch (e) { cn.fail(e); }
  }
  route();
})();
