// catnet — by cole (github.com/yupthatscole)
"use strict";
(async function () {
  const { $, h } = cn;
  await cn.boot({ page: "about" });
  const moods = [["idle", "idle"], ["happy", "happy"], ["sleep", "sleeping"], ["confused", "confused"], ["curious", "curious"], ["think", "thinking"], ["surprised", "surprised"], ["walk", "walking"]];
  $("#moods").replaceChildren(...moods.map(([m, label]) => h("figure", {}, cn.tuft(m, 0.9), h("figcaption", { text: label }))));
  try {
    const s = await cn.api("/api/sys");
    $("#ver").textContent = `version ${s.ver} · up ${cn.dur(s.up)} · ${cn.plural(s.users, "resident")}`;
  } catch (e) { /* optional */ }
})();
