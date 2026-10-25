// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { $, h } = cn;
  await cn.boot({ page: "notes" });
  $("#delBtn").append(cn.icon("trash"));
  const enc = new TextEncoder();
  let notes = [], cur = null, dirty = false, saveTimer = 0, saving = null;

  async function loadList() {
    try {
      notes = (await cn.api("/api/notes")).notes;
      renderList();
    } catch (e) { cn.fail(e); }
  }

  function renderList() {
    const q = $("#q").value.trim().toLowerCase();
    const list = notes
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.pv.toLowerCase().includes(q))
      .sort((a, b) => (b.pin - a.pin) || (b.t - a.t) || (b.id - a.id));
    const grid = $("#grid");
    if (!list.length) {
      grid.replaceChildren(h("div", { class: "empty", style: { gridColumn: "1/-1" } }, cn.tuft(notes.length ? "curious" : "sleep", 1),
        h("p", { text: notes.length ? "no note matches that." : "no notes yet. tuft is napping on the blank pad." })));
      return;
    }
    grid.replaceChildren(...list.map((n) =>
      h("button", { class: "notecard", onclick: () => open(n.id) },
        n.pin ? h("span", { class: "pinmark", title: "pinned" }) : null,
        h("div", { class: "nt", text: n.title }),
        h("div", { class: "pv", text: n.pv || "(empty)" }),
        h("div", { class: "nm", text: `${n.t > 1e9 ? cn.ago(n.t) : "earlier"} · ${cn.bytes(n.s)}` }))));
  }

  function show(edit) {
    $("#listView").hidden = edit;
    $("#editView").hidden = !edit;
    scrollTo(0, 0);
  }

  async function open(id) {
    try {
      const n = await cn.api("/api/notes/get?id=" + id);
      cur = n;
      $("#title").value = n.title === "untitled" ? "" : n.title;
      $("#body").value = n.body;
      $("#pin").checked = n.pin;
      $("#saved").textContent = n.t > 1e9 ? "saved " + cn.ago(n.t) : "saved";
      count();
      show(true);
      history.replaceState(null, "", "/notes?n=" + id);
    } catch (e) { cn.fail(e); }
  }

  function startNew() {
    cur = { id: 0 };
    $("#title").value = "";
    $("#body").value = "";
    $("#pin").checked = false;
    $("#saved").textContent = "new note";
    count();
    show(true);
    $("#title").focus();
  }

  function count() {
    const n = enc.encode($("#body").value).length;
    $("#chars").textContent = n;
    $("#chars").className = n > 6000 ? "bad" : "";
  }

  async function save() {
    clearTimeout(saveTimer);
    if (!cur || !dirty) return;
    if (!$("#title").value.trim() && !$("#body").value.trim() && !cur.id) return;
    if (saving) await saving;
    dirty = false;
    $("#saved").textContent = "saving…";
    saving = cn.api("/api/notes/save", { id: cur.id, title: $("#title").value, body: $("#body").value, pin: $("#pin").checked })
      .then((r) => {
        cur.id = r.id;
        $("#saved").textContent = "saved ✓";
        history.replaceState(null, "", "/notes?n=" + r.id);
      })
      .catch((e) => { dirty = true; $("#saved").textContent = "not saved!"; cn.fail(e); })
      .finally(() => { saving = null; });
    return saving;
  }
  function touch() {
    dirty = true;
    $("#saved").textContent = "editing…";
    count();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1200);
  }
  ["#title", "#body"].forEach((s) => $(s).addEventListener("input", touch));
  $("#pin").addEventListener("change", () => { dirty = true; save(); });
  $("#body").addEventListener("blur", save);
  addEventListener("beforeunload", (e) => { if (dirty) { save(); e.preventDefault(); e.returnValue = ""; } });

  $("#backBtn").addEventListener("click", async () => {
    await save();
    cur = null;
    history.replaceState(null, "", "/notes");
    show(false);
    loadList();
  });
  $("#delBtn").addEventListener("click", async () => {
    if (!cur) return;
    if (!cur.id) { cur = null; show(false); return; }
    if (!(await cn.ask("delete this note?", "it'll be gone for good.", "delete", true))) return;
    try {
      await cn.api("/api/notes/delete", { id: cur.id });
      dirty = false;
      cur = null;
      history.replaceState(null, "", "/notes");
      show(false);
      cn.toast("note deleted");
      loadList();
    } catch (e) { cn.fail(e); }
  });
  $("#newBtn").addEventListener("click", startNew);
  $("#q").addEventListener("input", renderList);

  await loadList();
  const want = parseInt(cn.params.get("n"), 10);
  if (want) open(want);
})();
