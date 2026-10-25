// catnet — by cole (github.com/yupthatscole)
"use strict";
(function () {
  const art = (window.DENIED_ART = {});
  const W = 32, H = 36;

  const FUR = [
    ["#8a7f6e", "#6b6152", "#aa9e88"], ["#c49a6c", "#9a7550", "#ddb98c"], ["#5b5550", "#423d39", "#78716a"],
    ["#d8d0c0", "#b0a794", "#efe9dc"], ["#a4623f", "#7c4729", "#c7845e"], ["#7d8a80", "#5e6a61", "#9aa79c"],
  ];
  const FROG = [["#6f8a4a", "#556b38", "#8fa865"], ["#5b7a5a", "#455e45", "#7a9a78"], ["#8a8a3e", "#6b6b2e", "#a8a85a"],
    ["#4f6b5e", "#3b5247", "#6b8a7c"], ["#7a6b3a", "#5e522c", "#9a8a55"], ["#3e5a3e", "#2c442c", "#587a58"]];
  const CROW = [["#3a3a42", "#26262c", "#55555f"], ["#2e3440", "#1f242c", "#48505e"], ["#463e3e", "#2f2929", "#615757"],
    ["#3a4238", "#272d26", "#545e51"], ["#444", "#2a2a2a", "#606060"], ["#3b3346", "#28222f", "#564c63"]];
  const MOTH = [["#cbbfa6", "#a99d84", "#e3d9c4"], ["#b9a9c4", "#9787a3", "#d3c6dc"], ["#d1c49a", "#ad9f76", "#e7dcb8"],
    ["#a8a296", "#878175", "#c4beb2"], ["#c7b0a0", "#a58e7e", "#dfcbbd"], ["#9fa8a0", "#7f877f", "#bcc4bc"]];
  const COAT = ["#4a5a48", "#5a4a3e", "#3e4a5a", "#6a6a5a", "#5a3e46", "#2f3a33"];
  const OUT = "#1c1a17", EYE = "#151412", INK = "#2a2620";

  function palette(t) {
    const set = t.species === "frog" ? FROG : t.species === "crow" ? CROW : t.species === "moth" ? MOTH : FUR;
    return set[t.fur % 6];
  }

  art.draw = function (ctx, t, opts = {}) {
    const px = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); } };
    const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    const ell = (cx, cy, rx, ry, fn) => {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy <= 1) fn(x, y, dx, dy);
        }
    };
    const tri = (x0, y0, x1, y1, x2, y2, c) => {
      const minx = Math.min(x0, x1, x2), maxx = Math.max(x0, x1, x2), miny = Math.min(y0, y1, y2), maxy = Math.max(y0, y1, y2);
      const s = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
      for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
        const d1 = s(x + 0.5, y + 0.5, x0, y0, x1, y1), d2 = s(x + 0.5, y + 0.5, x1, y1, x2, y2), d3 = s(x + 0.5, y + 0.5, x2, y2, x0, y0);
        if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) px(x, y, c);
      }
    };
    const [base, shade, light] = palette(t);
    const sp = t.species;

    rect(0, 0, W, H, opts.photo ? "#c9c0a8" : opts.bg || "#18201b");
    if (opts.photo) for (let y = 0; y < H; y += 2) rect(0, y, W, 1, "rgba(0,0,0,.04)");

    const coat = COAT[t.coat % 6];
    for (let y = 28; y < H; y++) {
      const half = 9 + (y - 28);
      rect(16 - half, y, half * 2, 1, coat);
    }
    tri(13, 28, 19, 28, 16, 33, "#d9d2bd");
    if (t.hat === 3) tri(13, 28, 19, 28, 16, 31, "#7a2f2a"); // tie for the inspectors

    const earInner = sp === "rabbit" || sp === "mouse" || sp === "rat" ? "#d9a0a0" : shade;
    if (sp === "cat" || sp === "fox") {
      const big = sp === "fox" ? 2 : 0;
      tri(6 - big, 3 - big, 13, 9, 7, 13, OUT); tri(26 + big, 3 - big, 19, 9, 25, 13, OUT);
      tri(7 - big, 5 - big, 12, 9, 8, 12, base); tri(25 + big, 5 - big, 20, 9, 24, 12, base);
      tri(8 - big, 7 - big, 11, 9, 9, 11, earInner); tri(24 + big, 7 - big, 21, 9, 23, 11, earInner);
    } else if (sp === "rabbit") {
      for (const x of [10, 19]) { rect(x - 1, -1, 5, 13, OUT); rect(x, 0, 3, 12, base); rect(x + 1, 2, 1, 8, earInner); }
    } else if (sp === "mouse" || sp === "rat") {
      const r = sp === "mouse" ? 4 : 3;
      for (const cx of [8, 24]) { ell(cx, 9, r + 1, r + 1, (x, y) => px(x, y, OUT)); ell(cx, 9, r, r, (x, y) => px(x, y, base)); ell(cx, 9, r - 1.5, r - 1.5, (x, y) => px(x, y, earInner)); }
    } else if (sp === "bear") {
      for (const cx of [9, 23]) { ell(cx, 9, 3.5, 3.5, (x, y) => px(x, y, OUT)); ell(cx, 9, 2.5, 2.5, (x, y) => px(x, y, base)); px(cx, 9, shade); }
    } else if (sp === "owl") {
      tri(7, 4, 12, 9, 8, 11, OUT); tri(25, 4, 20, 9, 24, 11, OUT); tri(8, 6, 11, 9, 9, 10, shade); tri(24, 6, 21, 9, 23, 10, shade);
    } else if (sp === "goat") {
      for (const [sx, dir] of [[11, -1], [21, 1]]) for (let i = 0; i < 7; i++) { px(sx + dir * Math.floor(i / 2), 8 - i, "#cfc4a8"); px(sx + dir * Math.floor(i / 2) + dir, 8 - i, "#a99f86"); }
      rect(4, 13, 5, 2, base); rect(23, 13, 5, 2, base);
    } else if (sp === "moth") {
      for (const [sx, dir] of [[13, -1], [19, 1]]) for (let i = 0; i < 8; i++) { px(sx + dir * Math.floor(i * 0.6), 8 - i, INK); if (i > 3) px(sx + dir * (Math.floor(i * 0.6) + 1), 8 - i, shade); }
    }

    const rx = sp === "frog" ? 11 : sp === "bear" || sp === "owl" ? 10 : sp === "mouse" || sp === "rat" ? 8.5 : 9.5;
    const ry = sp === "frog" ? 8 : sp === "goat" ? 10 : 9.5;
    const cy = sp === "frog" ? 19 : 17.5;
    ell(16, cy, rx + 1, ry + 1, (x, y) => px(x, y, OUT));
    ell(16, cy, rx, ry, (x, y, dx, dy) => px(x, y, dx > 0.45 ? shade : dx < -0.3 && dy < -0.3 ? light : base));
    if (sp === "moth") ell(16, 27, 9, 3, (x, y) => { if ((x + y) % 2 === 0) px(x, y, light); }); // fuzzy collar
    if (sp === "dog") for (const cx of [6.5, 25.5]) { ell(cx, 18, 3.2, 6.2, (x, y) => px(x, y, OUT)); ell(cx, 18, 2.2, 5.2, (x, y) => px(x, y, shade)); }

    if (t.mark === 1) ell(11.5, 15.5, 3.5, 3, (x, y) => px(x, y, shade));
    if (t.mark === 2) { rect(15, cy - ry + 1, 2, 6, shade); rect(13, cy - ry + 2, 1, 3, shade); rect(18, cy - ry + 2, 1, 3, shade); }

    if (["cat", "dog", "fox", "bear", "rat", "mouse", "rabbit", "goat"].includes(sp)) {
      const mw = sp === "bear" || sp === "dog" ? 4.5 : 3.5;
      ell(16, 22, mw, 3, (x, y) => px(x, y, sp === "fox" ? "#efe6d6" : light));
      rect(15, 20, 2, sp === "dog" || sp === "bear" ? 2 : 1, EYE);
      px(14, 23, INK); px(17, 23, INK); rect(15, 23, 2, 1, sp === "goat" ? INK : "rgba(0,0,0,0)");
      if (sp === "cat" || sp === "mouse" || sp === "rat" || sp === "fox") { rect(8, 21, 3, 1, light); rect(21, 21, 3, 1, light); } // whiskers
      if (sp === "goat") { rect(15, 25, 2, 3, "#e7e0cf"); } // beard
    } else if (sp === "owl") {
      tri(15, 18, 18, 18, 16, 23, "#c9a24a"); px(16, 22, "#8a6a2a");
    } else if (sp === "crow") {
      rect(15, 19, 9, 2, "#55555a"); rect(15, 21, 7, 1, "#3b3b40"); px(23, 19, "#77777c");
    } else if (sp === "frog") {
      rect(8, 23, 17, 1, INK); px(7, 22, INK); px(25, 22, INK);
    } else {
      rect(15, 22, 2, 1, INK);
    }

    const ex = [12, 20], ey = sp === "frog" ? 12 : 16;
    if (sp === "frog") for (const x of ex) { ell(x + 0.5, 12, 3.5, 3.5, (a, b) => px(a, b, OUT)); ell(x + 0.5, 12, 2.5, 2.5, (a, b) => px(a, b, light)); }
    if (sp === "owl") for (const x of ex) { ell(x + 0.5, 16.5, 3.5, 3.5, (a, b) => px(a, b, "#e8d48a")); ell(x + 0.5, 16.5, 2.5, 2.5, (a, b) => px(a, b, "#d2a83e")); }
    if (sp === "moth") for (const x of ex) { ell(x + (x < 16 ? -1 : 1) + 0.5, 16, 2.5, 3, (a, b) => px(a, b, EYE)); px(x + (x < 16 ? -2 : 1), 14, "#6a6a70"); }
    else for (const x of ex) {
      if (sp === "crow") rect(x - 1, ey - 1, 4, 4, "#b9b3a2");  // pale eye-ring so dark birds still have eyes
      switch (t.eyes % 4) {
        case 0: rect(x, ey, 2, 2, EYE); px(x, ey, "#fff8"); break;
        case 1: rect(x - 1, ey - 1, 4, 3, "#efe9dc"); rect(x, ey, 2, 2, EYE); break;
        case 2: rect(x - 1, ey, 4, 1, EYE); rect(x - 1, ey - 1, 4, 1, shade); break;
        default: rect(x - 1, ey, 4, 1, EYE); px(x, ey, "#fff6"); break;
      }
    }
    if (t.age === 2) { rect(10, ey - 3, 4, 1, "#c8c2b4"); rect(19, ey - 3, 4, 1, "#c8c2b4"); }

    if (t.glasses) {
      for (const x of ex) { rect(x - 2, ey - 2, 6, 1, INK); rect(x - 2, ey + 2, 6, 1, INK); rect(x - 2, ey - 2, 1, 5, INK); rect(x + 3, ey - 2, 1, 5, INK); }
      rect(15, ey - 1, 2, 1, INK);
    }
    if (t.scar) for (let i = 0; i < 6; i++) px(9 + i, ey - 3 + i, "#c86c5c");

    const top = Math.floor(cy - ry);
    if (t.hat === 1) { rect(7, top + 1, 18, 2, "#3a3226"); rect(9, top - 2, 14, 3, "#4a4030"); }
    else if (t.hat === 2) { ell(16, top + 2, 9, 4, (x, y) => { if (y <= top + 3) px(x, y, (x + y) % 3 ? "#7a3b3b" : "#8f4a4a"); }); rect(15, top - 3, 2, 2, "#d9d2bd"); }
    else if (t.hat === 3) { rect(6, top + 1, 20, 2, "#22262a"); rect(10, top - 5, 12, 6, "#2c3238"); rect(10, top - 1, 12, 1, "#7a2f2a"); }

    if (opts.photo) {
      ctx.fillStyle = "rgba(120, 95, 50, .18)";
      ctx.fillRect(0, 0, W, H);
    }
  };

  let tuftImg = null;
  art.drawTuft = function (ctx, frame = 0, row = 0, bg = "#18201b") {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    if (!tuftImg) {
      tuftImg = new Image();
      tuftImg.src = "/img/tuft.png";
    }
    const go = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tuftImg, frame * 80 + 4, row * 72 + 10, 60, 62, 1, 4, 30, 31);
    };
    if (tuftImg.complete && tuftImg.naturalWidth) go(); else tuftImg.addEventListener("load", go, { once: true });
  };

  art.portrait = function (t, scale, opts = {}) {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    c.className = "portrait";
    c.style.width = W * scale + "px";
    c.style.height = H * scale + "px";
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    if (opts.tuft) art.drawTuft(ctx, 0, 0, opts.photo ? "#c9c0a8" : undefined);
    else art.draw(ctx, t, opts);
    return c;
  };

  const SEALS = [
    ["....#....", "....#....", "...###...", "#########", ".#######.", "..#####..", "..##.##..", ".##...##.", "#.......#"],
    [".........", "..#####..", ".#.....#.", "#..###..#", "#.#####.#", "#..###..#", ".#.....#.", "..#####..", "........."],
    ["..###....", ".#...#...", ".#...#...", "..###....", "...#.....", "...####..", "...#.....", "...###...", "...#....."],
    ["#.......#", "##.....##", "###...###", "####.####", "#########", ".#######.", "..##.##..", "...#.#...", "........."],
    [".........", "#########", "#########", ".#######.", ".##.#.##.", ".#..#..#.", "....#....", "....#....", "........."],
    ["...####..", "..##.....", ".##......", ".##......", ".##......", ".##......", "..##.....", "...####..", "........."],
  ];
  art.seal = function (i, size = 44, color = "#a3392e") {
    const c = document.createElement("canvas");
    c.width = 15;
    c.height = 15;
    c.className = "seal";
    c.style.width = size + "px";
    c.style.height = size + "px";
    const x = c.getContext("2d");
    for (let y = 0; y < 15; y++) for (let xx = 0; xx < 15; xx++) {
      const d = Math.hypot(xx - 7, y - 7);
      if (d > 6.2 && d < 7.4) { x.fillStyle = color; x.fillRect(xx, y, 1, 1); }
    }
    const rows = SEALS[i % SEALS.length];
    x.fillStyle = color;
    rows.forEach((r, yy) => { for (let xx = 0; xx < r.length; xx++) if (r[xx] === "#") x.fillRect(3 + xx, 3 + yy, 1, 1); });
    return c;
  };
})();
