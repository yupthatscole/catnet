// catnet — by cole (github.com/yupthatscole)
"use strict";
(function (root) {
  const TAU = Math.PI * 2;
  const STEP = { f: 0.025, a: 0.02, p: TAU / 72 };   // knob resolution
  const RANGE = { f: [0.5, 8.5], a: [0, 1], p: [0, TAU] };
  const LOCK_AT = 0.9;
  const HOLD_SECONDS = 1.4;

  const LEVELS = [
    { n: 1, name: "LAMPLIGHT", k: 1, free: ["f"], time: 60 },
    { n: 2, name: "LOW STEADY", k: 1, free: ["f", "a"], time: 60 },
    { n: 3, name: "CHECKPOINT", k: 1, free: ["f", "a", "p"], time: 60 },
    { n: 4, name: "HEADCOUNT", k: 2, free: ["f"], time: 70 },
    { n: 5, name: "CARRIER", k: 2, free: ["f", "a"], time: 75 },
    { n: 6, name: "LAMPS LOW", k: 2, free: ["f", "a", "p"], time: 85 },
    { n: 7, name: "RIDGE RELAY", k: 1, free: ["f", "a", "p"], time: 50, noise: 0.3 },
    { n: 8, name: "SMALL LISTENER", k: 2, free: ["f", "a", "p"], time: 85, noise: 0.2 },
    { n: 9, name: "RESONANCE", k: 2, free: ["f", "a", "p"], time: 80, noise: 0.25, wobble: 0.08 },
    { n: 10, name: "OFF-GRID", k: 3, free: ["f"], time: 90 },
    { n: 11, name: "ALL BANDS", k: 3, free: ["f", "a"], time: 105, noise: 0.15 },
    { n: 12, name: "THE DOOR", k: 3, free: ["f", "a", "p"], time: 130, noise: 0.2, wobble: 0.05 },
  ];

  const MESSAGES = [
    "…this is Lamplight. If you can hear this, you have a receiver and a reason to use it. Stay on this frequency.",
    "Lamplight again. The valley has a new sound at night. Low. Steady. Our instruments put it at forty-one hertz.",
    "We have people near Facility 09. One clerk at Checkpoint C stamps faster than the rest. We're watching to see who they are.",
    "COUNT REPORT, SECTOR C, SEVEN DAYS. Workers in: 212. Workers out: 168. Forty-four unaccounted for. All Lowmarsh.",
    "The hum is not machinery. It is a carrier wave, and something is riding on it. We need more listeners. We need you.",
    "To the clerk at Checkpoint C, if you are listening: the lamps are low tonight.",
    "—they found our relay on the ridge— moving the transmitter. If this goes quiet, it isn't over. It is never over.",
    "A small listener wrote to us. Their name is Kip. They are looking for their mum. If anyone in Sector D can hear this: Kip is safe.",
    "Varga's notes confirm it. Forty-one hertz for six hours: no fear. Twelve hours: you hear the facility singing. They want everyone to sing.",
    "Somewhere in this valley there is a tiny network with a cat on it. No signal in or out. Smart. Stay small. Stay kind.",
    "Tonight we try to broadcast the Resonance files on every band at once. For that we need a door opened from the inside.",
    "If you are hearing this, the door opened. Turn your radio up. Let them hear what the hum really says. …and somewhere a cat sits on a warm router, unbothered. Goodnight from Lamplight.",
  ];

  const snap = (v, k) => {
    const [lo, hi] = RANGE[k];
    v = Math.round(v / STEP[k]) * STEP[k];
    if (k === "p") v = ((v % TAU) + TAU) % TAU;
    return Math.min(hi, Math.max(lo, +v.toFixed(4)));
  };

  function makeTarget(r, k) {
    const used = [];
    const comps = [];
    for (let i = 0; i < k; i++) {
      let f;
      do { f = snap(1 + r() * 7, "f"); f = Math.round(f * 4) / 4; } while (used.some((u) => Math.abs(u - f) < 1));
      used.push(f);
      const a = snap(i === 0 ? 0.55 + r() * 0.35 : 0.2 + r() * 0.3, "a");
      const p = snap(Math.round(r() * 24) * (TAU / 24), "p");
      comps.push({ f, a, p });
    }
    return comps;
  }

  function makeStart(r, target, free) {
    return target.map((c) => {
      const o = { f: c.f, a: c.a, p: c.p };
      if (free.includes("f")) { let f; do { f = snap(1 + r() * 7, "f"); } while (Math.abs(f - c.f) < 0.8); o.f = f; }
      if (free.includes("a")) { let a; do { a = snap(0.15 + r() * 0.8, "a"); } while (Math.abs(a - c.a) < 0.2); o.a = a; }
      if (free.includes("p")) o.p = snap(c.p + Math.PI * (0.5 + r()), "p");
      return o;
    });
  }

  function sample(comps, x, gain = 1) {
    let y = 0;
    for (const c of comps) y += c.a * Math.sin(TAU * c.f * x + c.p);
    return y * gain;
  }

  function similarity(target, player, gain = 1, n = 160) {
    let err = 0, norm = 0;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const t = sample(target, x, gain), p = sample(player, x);
      err += (t - p) * (t - p);
      norm += t * t;
    }
    if (norm < 1e-9) return 0;
    return Math.max(0, 1 - Math.sqrt(err / norm));
  }

  function score(level, timeLeft, sim) {
    return Math.round(100 + 20 * level + 3 * Math.max(0, timeLeft) + Math.max(0, (sim - LOCK_AT) * 1000));
  }
  function stars(timeLeft, total) {
    const f = timeLeft / total;
    return f > 0.5 ? 3 : f > 0.25 ? 2 : 1;
  }

  function scanLevel(round) {
    const k = Math.min(3, 1 + Math.floor(round / 3));
    return { n: round + 1, name: "SCAN " + String(round + 1).padStart(2, "0"), k, free: ["f", "a", "p"],
      time: Math.max(45, 80 - round * 3) + (k - 1) * 20, noise: Math.min(0.3, round * 0.03), wobble: round > 6 ? 0.05 : 0 };
  }

  const api = { TAU, STEP, RANGE, LOCK_AT, HOLD_SECONDS, LEVELS, MESSAGES, snap, makeTarget, makeStart, sample, similarity, score, stars, scanLevel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SIGNAL = api;
})(typeof window !== "undefined" ? window : globalThis);
