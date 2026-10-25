// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { $, h } = cn;
  await cn.boot({ page: "arcade" });
  const GAMES = [
    { id: "denied", href: "/denied", name: "DENIED.", flag: true, tag: "a document-inspection thriller at Facility 09. seven shifts, eight endings, one very suspicious hum.", draw: drawDenied },
    { id: "signal", href: "/signal", name: "SIGNAL", tag: "a night at a listening post. tune the oscillators, lock the waveform, decode what's out there.", draw: drawSignal },
    { id: "nine", href: "/nine", name: "nine lives", tag: "a dice-rolling night raid through the house. Tuft versus the vacuum, the cucumber and the dog.", draw: drawNine },
  ];
  const cans = [];
  $("#cabs").replaceChildren(...GAMES.map((g) => {
    const [c, x] = gk.canvas(48, 48);
    cans.push([g, x]);
    const best = h("div", { class: "best", text: "…" });
    g.bestEl = best;
    return h("a", { class: "cab" + (g.flag ? " flag" : ""), href: g.href }, c,
      h("div", {}, h("h2", { text: g.name }), h("p", { class: "tagline", text: g.tag }), best));
  }));

  try {
    const all = await cn.api("/api/scores");
    for (const g of GAMES) {
      const b = all[g.id];
      g.bestEl.textContent = (b.mine != null ? `your best ${b.mine} (#${b.rank})` : "not played yet") + (b.top[0] ? ` · top: ${b.top[0].n} ${b.top[0].s}` : "");
    }
    $("#boards").replaceChildren(...GAMES.map((g) => h("div", {},
      h("h3", { text: g.name, style: { margin: "6px 0" } }),
      all[g.id].top.length
        ? h("table", { class: "lb" }, all[g.id].top.map((t, i) => h("tr", { class: t.n === cn.me.user.n ? "me" : null },
          h("td", { class: "rank", text: String(i + 1) }), h("td", { text: t.n, style: { color: t.c } }), h("td", { class: "faint small", text: t.x }), h("td", { class: "r", text: String(t.s) }))))
        : h("p", { class: "dim small", text: "no scores yet." }))));
  } catch (e) { cn.fail(e); }

  let t = 0;
  const visitor = { species: "fox", fur: 4, eyes: 0, glasses: false, hat: 1, scar: false, coat: 2, mark: 0, age: 1 };
  function drawDenied(x, t) {
    x.fillStyle = "#18201b"; x.fillRect(0, 0, 48, 48);
    const off = document.createElement("canvas"); off.width = 32; off.height = 36;
    const oc = off.getContext("2d");
    window.DENIED_ART.draw(oc, Object.assign({}, visitor, { fur: Math.floor(t / 90) % 6, species: ["fox", "owl", "mouse", "goat"][Math.floor(t / 90) % 4] }));
    x.drawImage(off, 8, 2);
    x.fillStyle = "#d6cba9"; x.fillRect(4, 36, 40, 12);
    if (t % 90 > 50) { x.fillStyle = "#b8473a"; x.fillRect(10, 38, 28, 8); x.fillStyle = "#d6cba9"; x.fillRect(12, 40, 24, 4); }
  }
  function drawSignal(x, t) {
    x.fillStyle = "#120d05"; x.fillRect(0, 0, 48, 48);
    x.fillStyle = "#3a2a10"; for (let i = 0; i < 48; i += 8) { x.fillRect(i, 0, 1, 48); x.fillRect(0, i, 48, 1); }
    for (let i = 0; i < 48; i++) {
      const y1 = 24 + Math.round(Math.sin(i / 5 + t / 12) * 10);
      const y2 = 24 + Math.round(Math.sin(i / 5 + t / 12 + Math.sin(t / 40) * 1.2) * 10 * (0.6 + 0.4 * Math.sin(t / 30)));
      x.fillStyle = "#ffb347"; x.fillRect(i, y1, 1, 1);
      x.fillStyle = "#4fe0c0"; x.fillRect(i, y2, 1, 1);
    }
  }
  function drawNine(x, t) {
    x.fillStyle = "#1a1325"; x.fillRect(0, 0, 48, 48);
    x.fillStyle = "#2b2140"; x.fillRect(0, 34, 48, 14);
    const faces = [1, 2, 3, 4, 5, 6];
    for (let d = 0; d < 3; d++) {
      const v = faces[(Math.floor(t / 14) + d * 2) % 6];
      const dx = 6 + d * 14, dy = 36 - (Math.floor(t / 14) % 2 && d === 1 ? 2 : 0);
      x.fillStyle = "#efe6ff"; x.fillRect(dx, dy, 10, 10);
      x.fillStyle = "#2e1660";
      const pips = { 1: [[4, 4]], 2: [[1, 1], [7, 7]], 3: [[1, 1], [4, 4], [7, 7]], 4: [[1, 1], [7, 1], [1, 7], [7, 7]], 5: [[1, 1], [7, 1], [4, 4], [1, 7], [7, 7]], 6: [[1, 1], [7, 1], [1, 4], [7, 4], [1, 7], [7, 7]] }[v];
      for (const [px, py] of pips) x.fillRect(dx + px, dy + py, 2, 2);
    }
    x.fillStyle = "#b8a3fb"; x.fillRect(18, 10 + (Math.floor(t / 20) % 2), 12, 10);
    x.fillStyle = "#2e1660"; x.fillRect(21, 13 + (Math.floor(t / 20) % 2), 2, 2); x.fillRect(26, 13 + (Math.floor(t / 20) % 2), 2, 2);
    x.fillStyle = "#b8a3fb"; x.fillRect(18, 7 + (Math.floor(t / 20) % 2), 3, 3); x.fillRect(27, 7 + (Math.floor(t / 20) % 2), 3, 3);
  }
  const calm = cn.pref(cn.PREF.REDUCE_MOTION);
  function frame() {
    t++;
    for (const [g, x] of cans) g.draw(x, t);
    if (!calm && !document.hidden) setTimeout(() => requestAnimationFrame(frame), 50);
  }
  frame();
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !calm) frame(); });
})();
