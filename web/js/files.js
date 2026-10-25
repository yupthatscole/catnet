// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { $, $$, h } = cn;
  const me = await cn.boot({ page: "files" });
  $("#dropIcon").append(cn.icon("upload"));
  $("#siteLink").textContent = `/~${me.user.n}/`;
  $("#siteLink").href = `/~${me.user.n}/`;

  const TYPES = {
    png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, bmp: 1, mp3: 1, ogg: 1, wav: 1, m4a: 1, mp4: 1, webm: 1, pdf: 1,
    txt: 1, md: 1, csv: 1, log: 1, html: 2, htm: 2, css: 2, js: 2, json: 2, svg: 2, zip: 0, gb: 0, gbc: 0, nes: 0,
  };
  const IMG = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
  const ext = (n) => (n.split(".").pop() || "").toLowerCase();
  let data = null, scope = "all";

  async function load() {
    try {
      data = await cn.api("/api/files");
      render();
    } catch (e) { cn.fail(e); }
  }

  function meter(label, used, total) {
    const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
    return [
      h("div", { class: "store-line" }, h("span", { text: label }), h("span", { text: `${cn.bytes(used)} / ${cn.bytes(total)}` })),
      h("div", { class: "meter" + (pct > 90 ? " bad" : pct > 75 ? " warn" : "") }, h("i", { style: { width: pct + "%" } })),
    ];
  }

  function render() {
    const v = data.vol;
    const free = Math.max(0, v.t - v.u - v.reserve);
    $("#limits").textContent = `up to ${cn.bytes(v.max)} per file · ${v.perUser} files each · ` +
      (v.quota ? `${cn.bytes(Math.max(0, v.quota - data.mine.u))} of your quota left` : `${cn.bytes(free)} free (admin: no quota)`) +
      ` · stored on ${v.label}`;
    $("#storage").replaceChildren(
      ...meter(`catnet storage (${v.label})`, v.u, v.t),
      ...(v.quota ? meter("your quota", data.mine.u, v.quota) : []));
    const q = $("#q").value.trim().toLowerCase();
    const files = data.files
      .filter((f) => scope !== "mine" || f.o === me.user.id)
      .filter((f) => scope !== "img" || IMG.includes(ext(f.n)))
      .filter((f) => scope !== "web" || TYPES[ext(f.n)] === 2)
      .filter((f) => !q || f.n.toLowerCase().includes(q) || f.on.includes(q))
      .sort((a, b) => b.t - a.t || a.n.localeCompare(b.n));
    $("#count").textContent = cn.plural(data.files.length, "file");
    const list = $("#list");
    if (!files.length) {
      list.replaceChildren(h("div", { class: "empty" }, cn.tuft(data.files.length ? "curious" : "sleep", 1),
        h("p", { text: data.files.length ? "nothing matches that." : "no files yet. tuft is sitting in the empty box." })));
      return;
    }
    list.replaceChildren(...files.map(row));
  }

  function url(f, dl) {
    return `/api/files/get?o=${f.o}&n=${encodeURIComponent(f.n)}&p=${f.p ? 1 : 0}${dl ? "&dl=1" : ""}`;
  }

  function row(f) {
    const mine = f.o === me.user.id;
    const e = ext(f.n);
    const acts = h("div", { class: "acts" });
    if (TYPES[e] === 1) acts.append(h("button", { class: "iconbtn", title: "view", "aria-label": "view " + f.n, onclick: () => preview(f) }, cn.icon("eye")));
    if (TYPES[e] === 2 && !f.p) acts.append(h("a", { class: "iconbtn", title: "open hosted page", href: `/~${f.on}/${encodeURIComponent(f.n)}`, target: "_blank", rel: "noopener" }, cn.icon("globe")));
    acts.append(h("a", { class: "iconbtn", title: "download", "aria-label": "download " + f.n, href: url(f, true), download: f.n }, cn.icon("download")));
    if (mine) acts.append(h("button", { class: "iconbtn", title: f.p ? "make public" : "make private", "aria-label": f.p ? "make public" : "make private", onclick: () => move(f) }, cn.icon(f.p ? "globe" : "lock")));
    if (mine || me.admin) acts.append(h("button", { class: "iconbtn", title: "delete", "aria-label": "delete " + f.n, onclick: () => del(f) }, cn.icon("trash")));
    return h("div", { class: "item file" },
      h("span", { class: "ext", text: e.slice(0, 4) }),
      h("span", { class: "grow" },
        h("span", { class: "t", text: f.n }),
        h("div", { class: "meta" }, `${cn.bytes(f.s)} · ${f.on}${mine ? " (you)" : ""} · ${f.t > 1e9 ? cn.ago(f.t) : "earlier"}`, f.p ? h("span", { class: "chip", style: { marginLeft: "6px" } }, cn.icon("lock"), "private") : null)),
      acts);
  }

  function preview(f) {
    const e = ext(f.n);
    cn.sheet((box, close) => {
      let body;
      if (IMG.includes(e)) body = h("img", { src: url(f), alt: f.n });
      else if (["mp3", "ogg", "wav", "m4a"].includes(e)) body = h("audio", { src: url(f), controls: true, style: { width: "100%" } });
      else if (["mp4", "webm"].includes(e)) body = h("video", { src: url(f), controls: true, playsinline: true });
      else if (e === "pdf") body = h("p", {}, h("a", { class: "btn", href: url(f), target: "_blank", rel: "noopener", text: "open the pdf →" }));
      else {
        body = h("pre", { text: "loading…" });
        fetch(url(f)).then((r) => r.text()).then((t) => { body.textContent = t.slice(0, 20000); }).catch(() => { body.textContent = "couldn't load it."; });
      }
      box.style.maxWidth = "640px";
      box.append(h("h2", { text: f.n, style: { overflowWrap: "anywhere" } }),
        h("p", { class: "mono faint", text: `${cn.bytes(f.s)} · from ${f.on}` }),
        h("div", { class: "preview" }, body),
        h("div", { class: "actions" }, h("a", { class: "btn ghost", href: url(f, true), download: f.n, text: "download" }), h("button", { class: "btn", text: "close", onclick: () => close() })));
    });
  }

  async function del(f) {
    const other = f.o !== me.user.id;
    if (!(await cn.ask(`delete ${f.n}?`, other ? `this belongs to ${f.on}. you're deleting it as an admin.` : "it's gone for good. no recycle bin on a cat.", "delete", true))) return;
    try {
      await cn.api("/api/files/delete", { o: f.o, n: f.n, p: f.p });
      cn.toast("deleted " + f.n);
      load();
    } catch (e) { cn.fail(e); }
  }

  async function move(f) {
    try {
      await cn.api("/api/files/move", { o: f.o, n: f.n, p: f.p });
      cn.toast(f.p ? `${f.n} is public now` : `${f.n} is private now`);
      load();
    } catch (e) { cn.fail(e); }
  }

  async function uploadAll(fileList) {
    const box = $("#queue");
    for (const file of fileList) {
      const e = ext(file.name);
      const bar = h("i", { style: { width: "0%" } });
      const label = h("span", { text: file.name });
      const state = h("span", { class: "mono faint", text: "waiting" });
      const row = h("div", { class: "prog" }, h("div", { class: "store-line" }, label, state), h("div", { class: "meter" }, bar));
      box.append(row);
      const problem = !(e in TYPES) ? "that file type isn't allowed"
        : data && file.size > data.vol.max ? `too big (max ${cn.bytes(data.vol.max)})`
        : file.size === 0 ? "empty file" : null;
      if (problem) {
        state.textContent = problem;
        state.className = "mono bad";
        continue;
      }
      try {
        state.textContent = "0%";
        const r = await cn.upload(`/api/files/upload?p=${$("#priv").checked ? 1 : 0}`, file, (p) => {
          bar.style.width = Math.round(p * 100) + "%";
          state.textContent = Math.round(p * 100) + "%";
        });
        bar.style.width = "100%";
        state.textContent = r.n !== file.name ? `saved as ${r.n}` : "done";
        state.className = "mono ok";
        setTimeout(() => row.remove(), 4000);
      } catch (ex) {
        state.textContent = ex.message;
        state.className = "mono bad";
        row.querySelector(".meter").classList.add("bad");
      }
    }
    load();
  }
  $("#pick").addEventListener("change", (e) => { uploadAll(Array.from(e.target.files)); e.target.value = ""; });
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); uploadAll(Array.from(e.dataTransfer.files)); });

  $$("#scope button").forEach((b) => b.addEventListener("click", () => {
    scope = b.dataset.s;
    $$("#scope button").forEach((x) => x.classList.toggle("on", x === b));
    render();
  }));
  $("#q").addEventListener("input", () => data && render());
  load();
})();
