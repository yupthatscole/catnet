// catnet — by cole (github.com/yupthatscole)
"use strict";
(function (root) {
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function ordinal(y, m, d) {
    let n = 0;
    for (let yy = 1980; yy < y; yy++) n += yy % 4 === 0 ? 366 : 365;
    for (let mm = 0; mm < m - 1; mm++) n += DAYS_IN[mm] + (mm === 1 && y % 4 === 0 ? 1 : 0);
    return n + d - 1;
  }
  function fromOrdinal(n) {
    let y = 1980;
    for (;;) { const len = y % 4 === 0 ? 366 : 365; if (n < len) break; n -= len; y++; }
    let m = 0;
    for (;;) { const len = DAYS_IN[m] + (m === 1 && y % 4 === 0 ? 1 : 0); if (n < len) break; n -= len; m++; }
    return { y, m: m + 1, d: n + 1 };
  }
  function fmtDate(n) {
    const { y, m, d } = fromOrdinal(n);
    return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
  }
  const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
  const DAY1 = ordinal(1987, 11, 2); // Monday 2 Nov 1987

  const DISTRICTS = ["NORTHWALL", "LOWMARSH", "KESSLER", "OUTER RING", "VANTA"];
  const DISTRICT_CODE = { NORTHWALL: "NW", LOWMARSH: "LM", KESSLER: "KS", "OUTER RING": "OR", VANTA: "VA" };
  const SECTORS = ["A", "B", "C", "D"];
  const SECTOR_LEVEL = { A: 1, B: 2, C: 3, D: 4 };
  const PURPOSES = ["WORK", "VISIT", "TRANSIT", "MEDICAL"];
  const EMPLOYERS_OK = ["HALVORSEN WORKS", "09 SANITATION", "GREYLINE FREIGHT", "ORCHARD LABS", "MERIDIAN CANTEEN"];
  const EMPLOYERS_BAD = ["VOSKOV & SONS", "BLUEFEN TRADING", "NIGHTJAR CO.", "ORCHID LABS", "HALVERSEN WORKS"];
  const SEAL_NAMES = ["STAR", "EYE", "KEY", "WING", "TOOTH", "MOON"];
  const SPECIES = ["cat", "dog", "rabbit", "mouse", "owl", "fox", "frog", "bear", "moth", "goat", "crow", "rat"];
  const FIRST = ["PELL", "MIRA", "ODO", "ILSE", "TOMAS", "VERA", "ANSEL", "BRIN", "CORA", "DEKLAN", "EMIL", "FENNA", "GUSTAV",
    "HANNE", "IVO", "JUDIT", "KAREL", "LIDA", "MATEO", "NADJA", "OSKAR", "PETRA", "RUDI", "SANNE", "TEODOR", "UNA", "VIKTOR",
    "WILMA", "YOSEF", "ZORA", "ALBIN", "BETA", "CASPAR", "DORA", "ELKE", "FILIP", "GRETA", "HUGO", "IRMA", "JONAS"];
  const LAST = ["ARNO", "HOLT", "KESSEL", "VARGA", "LINDQVIST", "MAREK", "OSTROVA", "BRANDT", "CZERNY", "DAHL", "EBERT",
    "FALK", "GRUBER", "HALASZ", "IVANOV", "JANSEN", "KOVAC", "LANG", "MOREAU", "NOVAK", "ORBAN", "PAVLIK", "QUIST", "ROSS",
    "SOKOL", "TAMM", "URBAN", "VOGEL", "WEISS", "ZELENKA", "AALTO", "BECK", "CRANE", "DUSK", "ELLER", "FROST", "GLASS", "HESS"];
  const PERSONALITIES = ["nervous", "gruff", "chatty", "formal", "weary", "cryptic", "cheerful"];

  const DAYS = [
    { n: 1, sectors: ["A", "B"], seals: [0, 1, 2], work: false, healthFor: null, badgeFor: [], vantaRevoked: false, sectorCWork: false,
      watch: 0, detain: false, directive: null, forge: 0.38, double: 0, quota: 9,
      bulletin: ["Names and ID numbers must match on every document.", "No expired documents.", "Entry permits must carry a valid seal.", "Only sectors A and B are open."] },
    { n: 2, sectors: ["A", "B"], seals: [0, 1, 3], work: true, healthFor: null, badgeFor: [], vantaRevoked: false, sectorCWork: false,
      watch: 0, detain: false, directive: null, forge: 0.42, double: 0, quota: 10,
      bulletin: ["NEW: entrants with purpose WORK need a work order.", "Work orders: employer must be on the approved list, sector must match the permit.", "Valid seals have changed. Check the book."] },
    { n: 3, sectors: ["A", "B", "C"], seals: [1, 3, 4], work: true, healthFor: ["LOWMARSH"], badgeFor: [], vantaRevoked: true, sectorCWork: true,
      watch: 0, detain: false, directive: null, forge: 0.45, double: 0.1, quota: 10,
      bulletin: ["SPORE ADVISORY: LOWMARSH residents need a health slip, tested within 7 days, result CLEAR.", "VANTA district ID cards are revoked.", "Sector C opens — WORK purpose only."] },
    { n: 4, sectors: ["A", "B", "C"], seals: [1, 2, 4], work: true, healthFor: ["LOWMARSH"], badgeFor: ["C"], vantaRevoked: true, sectorCWork: true,
      watch: 2, detain: true, directive: "LOWMARSH", forge: 0.48, double: 0.15, quota: 11,
      bulletin: ["Sector C entrants need a clearance badge, level 3 or higher.", "WATCHLIST in effect: DETAIN listed persons on sight.", "DIRECTIVE 4-L: deny entry to all LOWMARSH residents today. No exceptions."] },
    { n: 5, sectors: ["A", "B", "C", "D"], seals: [0, 2, 5], work: true, healthFor: "ALL", badgeFor: ["C", "D"], vantaRevoked: true, sectorCWork: true,
      watch: 2, detain: true, directive: null, forge: 0.5, double: 0.2, quota: 11,
      bulletin: ["Directive 4-L is lifted.", "Health slips now required for EVERYONE.", "Sector D opens for badge level 4 only."] },
    { n: 6, sectors: ["A", "B", "C"], seals: [3, 4, 5], work: true, healthFor: "ALL", badgeFor: ["C", "D"], vantaRevoked: true, sectorCWork: true,
      watch: 3, detain: true, directive: null, forge: 0.55, double: 0.25, quota: 12,
      bulletin: ["SECTOR D IS SEALED. Nobody enters sector D.", "Infiltration suspected. Watchlist extended.", "Valid seals have changed."] },
    { n: 7, sectors: ["A", "B", "C"], seals: [0, 4, 5], work: true, healthFor: "ALL", badgeFor: ["C", "D"], vantaRevoked: true, sectorCWork: true,
      watch: 3, detain: true, directive: null, forge: 0.55, double: 0.3, quota: 12,
      bulletin: ["Final week audit. Every rule applies.", "Sector D remains sealed.", "Facility 09 thanks you for your continued vigilance."] },
  ];
  function dayRules(n) {
    const d = DAYS[Math.min(DAYS.length, Math.max(1, n)) - 1];
    return Object.assign({ today: DAY1 + d.n - 1, weekday: WEEKDAYS[d.n - 1] }, d);
  }
  function needsHealth(rules, district) {
    return rules.healthFor === "ALL" || (Array.isArray(rules.healthFor) && rules.healthFor.includes(district));
  }
  function needsBadge(rules, sector) { return rules.badgeFor.includes(sector); }

  function makeIdno(r, district) {
    const A = "ABCDEFGHJKLMNPRSTUVWXYZ";
    return DISTRICT_CODE[district] + "-" + r.int(10) + A[r.int(A.length)] + r.int(10) + r.int(10) + "-" + A[r.int(A.length)] + r.int(10);
  }
  function makeTraits(r, species) {
    return {
      species,
      fur: r.int(6),
      eyes: r.int(4),     // 0 dot, 1 wide, 2 sleepy, 3 narrow
      glasses: r.chance(0.2),
      hat: r.chance(0.25) ? 1 + r.int(3) : 0,
      scar: r.chance(0.12),
      coat: r.int(6),
      mark: r.int(3),     // 0 none, 1 patch, 2 stripe
      age: r.int(3),      // 0 young, 1 adult, 2 old
    };
  }
  function cloneDocs(docs) { return JSON.parse(JSON.stringify(docs)); }
  function mangle(r, s) {
    const chars = s.split("");
    const idx = [];
    chars.forEach((c, i) => { if (/[A-Z]/.test(c)) idx.push(i); });
    const i = idx[1 + r.int(Math.max(1, idx.length - 2))] || idx[0];
    const kind = r.int(3);
    if (kind === 0 && i + 1 < chars.length && /[A-Z]/.test(chars[i + 1]) && chars[i] !== chars[i + 1]) {
      [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    } else if (kind === 1 || chars.length < 5) {
      const V = "AEIOUY", C = "BCDFGKLMNPRSTVZ";
      const pool = V.includes(chars[i]) ? V : C;
      let nc = chars[i];
      while (nc === chars[i]) nc = pool[r.int(pool.length)];
      chars[i] = nc;
    } else {
      chars.splice(i, 1);
    }
    const out = chars.join("");
    return out === s ? s + "S" : out;
  }
  function mangleIdno(r, s) {
    const chars = s.split("");
    const digits = [];
    chars.forEach((c, i) => { if (/[0-9]/.test(c)) digits.push(i); });
    const i = digits[r.int(digits.length)];
    chars[i] = String((Number(chars[i]) + 1 + r.int(8)) % 10);
    return chars.join("");
  }
  function mutateTraits(r, t) {
    const n = Object.assign({}, t);
    const what = r.int(4);
    if (what === 0) n.fur = (t.fur + 1 + r.int(5)) % 6;
    else if (what === 1) n.glasses = !t.glasses;
    else if (what === 2) n.eyes = (t.eyes + 1 + r.int(3)) % 4;
    else n.mark = (t.mark + 1 + r.int(2)) % 3;
    return n;
  }

  function makeVisitor(r, rules, overrides = {}) {
    const species = overrides.species || r.pick(SPECIES);
    const traits = overrides.traits || makeTraits(r, species);
    const allowedDistricts = DISTRICTS.filter((d) => !(rules.vantaRevoked && d === "VANTA") && rules.directive !== d);
    const district = overrides.district || r.pick(allowedDistricts);
    const first = overrides.first || r.pick(FIRST), last = overrides.last || r.pick(LAST);
    const name = `${last}, ${first}`;
    const idno = makeIdno(r, district);
    const sectors = rules.sectors.filter((s) => s !== "D" || r.chance(0.5));
    const sector = overrides.sector || r.pick(sectors);
    let purpose = overrides.purpose || r.pick(PURPOSES);
    if (rules.sectorCWork && sector === "C") purpose = "WORK";
    if (sector === "D") purpose = "WORK";
    const t = rules.today;
    const docs = {
      id: { name, idno, district, dob: t - (6000 + r.int(18000)), expiry: t + 30 + r.int(900), photo: traits },
      permit: { name, idno, purpose, sector, expiry: t + 1 + r.int(60), seal: r.pick(rules.seals) },
    };
    if (rules.work && purpose === "WORK") {
      docs.work = { name, employer: r.pick(EMPLOYERS_OK), sector, weeks: 1 + r.int(12) };
    }
    if (needsHealth(rules, district)) {
      docs.health = { name, idno, result: "CLEAR", tested: t - r.int(7) };
    }
    if (needsBadge(rules, sector)) {
      docs.badge = { name, level: Math.max(SECTOR_LEVEL[sector], Math.min(5, SECTOR_LEVEL[sector] + r.int(2))), expiry: t + 5 + r.int(120) };
    }
    return {
      first, last, name, species, traits, district,
      personality: overrides.personality || r.pick(PERSONALITIES),
      docs, statedPurpose: purpose, forged: [], watch: false, story: overrides.story || null,
    };
  }

  function forgeriesFor(rules, v) {
    const list = ["name", "idno", "id_expired", "permit_expired", "seal", "photo"];
    if (rules.sectors.length < 4) list.push("sector_closed");
    if (rules.work) list.push("purpose_lie");
    if (rules.work && v.docs.work) list.push("employer", "work_sector", "missing_work");
    if (rules.vantaRevoked) list.push("district");
    if (rules.sectorCWork) list.push("sector_c_purpose");
    if (v.docs.health) list.push("health_exposed", "health_old", "missing_health", "health_idno");
    if (v.docs.badge) list.push("badge_level", "badge_expired", "missing_badge");
    if (rules.directive) list.push("directive", "directive");  // weighted: the point of day 4
    return list;
  }
  const FORGERY_CODE = {
    name: "name_mismatch", idno: "idno_mismatch", id_expired: "id_expired", permit_expired: "permit_expired", seal: "seal_invalid",
    photo: "photo_mismatch", sector_closed: "sector_closed", purpose_lie: "purpose_lie", employer: "employer_unlisted",
    work_sector: "work_sector", missing_work: "missing_work", district: "district_revoked", sector_c_purpose: "sector_c_purpose",
    health_exposed: "health_exposed", health_old: "health_old", missing_health: "missing_health", health_idno: "idno_mismatch",
    badge_level: "badge_level", badge_expired: "badge_expired", missing_badge: "missing_badge", directive: "directive",
  };
  function applyForgery(r, rules, v, f) {
    const d = v.docs, t = rules.today;
    switch (f) {
      case "name": {
        const targets = ["permit", "work", "health", "badge"].filter((k) => d[k]);
        const k = r.pick(targets);
        d[k].name = r.chance(0.6) ? mangle(r, v.last) + ", " + v.first : v.last + ", " + mangle(r, v.first);
        if (d[k].name === d.id.name) d[k].name = v.last + "S, " + v.first;
        break;
      }
      case "directive": {
        const re = (s) => "LM" + s.slice(2);
        d.id.district = "LOWMARSH";
        d.id.idno = re(d.id.idno);
        d.permit.idno = d.id.idno;
        v.district = "LOWMARSH";
        if (needsHealth(rules, "LOWMARSH")) d.health = { name: d.id.name, idno: d.id.idno, result: "CLEAR", tested: t - r.int(7) };
        else if (d.health) d.health.idno = d.id.idno;
        break;
      }
      case "idno": d.permit.idno = mangleIdno(r, d.permit.idno); break;
      case "health_idno": d.health.idno = mangleIdno(r, d.health.idno); break;
      case "id_expired": d.id.expiry = t - 1 - r.int(300); break;
      case "permit_expired": d.permit.expiry = t - 1 - r.int(20); break;
      case "seal": d.permit.seal = r.pick([0, 1, 2, 3, 4, 5].filter((s) => !rules.seals.includes(s))); break;
      case "photo": d.id.photo = mutateTraits(r, v.traits); break;
      case "sector_closed": {
        const closed = SECTORS.filter((s) => !rules.sectors.includes(s));
        d.permit.sector = r.pick(closed);
        if (d.work) d.work.sector = d.permit.sector;
        if (d.permit.sector === "C" || d.permit.sector === "D") {
          d.permit.purpose = "WORK";
          v.statedPurpose = "WORK";
        }
        if (needsBadge(rules, d.permit.sector) && !d.badge) d.badge = { name: d.id.name, level: SECTOR_LEVEL[d.permit.sector], expiry: t + 30 };
        if (rules.work && d.permit.purpose === "WORK" && !d.work) d.work = { name: d.id.name, employer: r.pick(EMPLOYERS_OK), sector: d.permit.sector, weeks: 2 };
        break;
      }
      case "purpose_lie": v.statedPurpose = r.pick(PURPOSES.filter((p) => p !== d.permit.purpose)); break;
      case "employer": d.work.employer = r.pick(EMPLOYERS_BAD); break;
      case "work_sector": d.work.sector = r.pick(rules.sectors.filter((s) => s !== d.permit.sector)); break;
      case "missing_work": delete d.work; break;
      case "district": {
        d.id.district = "VANTA";
        const re = (s) => "VA" + s.slice(2);
        d.id.idno = re(d.id.idno);
        d.permit.idno = re(d.permit.idno);
        if (d.health) d.health.idno = re(d.health.idno);
        v.district = "VANTA";
        break;
      }
      case "sector_c_purpose":
        if (d.permit.sector !== "C") return false;
        d.permit.purpose = r.pick(["VISIT", "TRANSIT", "MEDICAL"]);
        v.statedPurpose = d.permit.purpose;
        delete d.work;
        break;
      case "health_exposed": d.health.result = "EXPOSED"; break;
      case "health_old": d.health.tested = t - 8 - r.int(30); break;
      case "missing_health": delete d.health; break;
      case "badge_level": d.badge.level = SECTOR_LEVEL[d.permit.sector] - 1 - r.int(Math.max(1, SECTOR_LEVEL[d.permit.sector] - 1)); if (d.badge.level < 1) d.badge.level = 1; break;
      case "badge_expired": d.badge.expiry = t - 1 - r.int(40); break;
      case "missing_badge": delete d.badge; break;
      default: return false;
    }
    v.forged.push(f);
    return true;
  }

  function watchlist(r, rules) {
    const out = [];
    for (let i = 0; i < rules.watch; i++) {
      const species = r.pick(SPECIES);
      out.push({ first: r.pick(FIRST), last: r.pick(LAST), traits: makeTraits(r, species), crime: r.pick(["SABOTAGE", "FORGERY", "SEDITION", "THEFT OF RECORDS", "UNLICENSED BROADCAST"]) });
    }
    return out;
  }

  function generate(r, rules, opts = {}) {
    if (opts.watch) {
      const w = opts.watch;
      const alias = r.chance(0.6);
      const v = makeVisitor(r, rules, { species: w.traits.species, traits: Object.assign({}, w.traits), first: alias ? r.pick(FIRST) : w.first, last: alias ? r.pick(LAST) : w.last });
      v.watch = true;
      return v;
    }
    const v = makeVisitor(r, rules, opts.overrides || {});
    if (opts.clean) return v;
    if (r.chance(opts.forge != null ? opts.forge : rules.forge)) {
      const n = r.chance(rules.double) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const snapshot = JSON.stringify(v);
        const options = forgeriesFor(rules, v).filter((f) => !v.forged.includes(f));
        for (let tries = 0; tries < 6; tries++) if (applyForgery(r, rules, v, r.pick(options))) break;
        const codes = check(v, rules).map((x) => x.code);
        if (i > 0 && !v.forged.every((f) => codes.includes(FORGERY_CODE[f]))) Object.assign(v, JSON.parse(snapshot));
      }
    }
    return v;
  }

  const NAME_DOCS = ["permit", "work", "health", "badge"];
  // finds everything wrong with a visitor using only their papers (same info the player has)
  function check(v, rules, extra = {}) {
    const d = v.docs, t = rules.today, out = [];
    const add = (code, text, a, b) => out.push({ code, text, pair: [a, b] });
    if (v.story === "tuft") { add("no_papers", "Entrant carries no documents at all.", "missing:id", "rule:docs"); return out; }
    if (!d.id || !d.permit) { add("no_papers", "Entrant is missing an ID card or entry permit.", "missing:" + (!d.id ? "id" : "permit"), "rule:docs"); return out; }
    for (const k of NAME_DOCS) if (d[k] && d[k].name !== d.id.name) add("name_mismatch", `Name on the ${DOC_LABEL[k].toLowerCase()} does not match the ID card.`, "id.name", k + ".name");
    if (d.permit.idno !== d.id.idno) add("idno_mismatch", "ID number on the permit does not match the ID card.", "id.idno", "permit.idno");
    if (d.health && d.health.idno !== d.id.idno) add("idno_mismatch", "ID number on the health slip does not match the ID card.", "id.idno", "health.idno");
    if (d.id.expiry < t) add("id_expired", "ID card has expired.", "id.expiry", "TODAY");
    if (d.permit.expiry < t) add("permit_expired", "Entry permit has expired.", "permit.expiry", "TODAY");
    if (!rules.seals.includes(d.permit.seal)) add("seal_invalid", "Permit seal is not valid today.", "permit.seal", "book:seals");
    if (!sameFace(d.id.photo, v.traits)) add("photo_mismatch", "ID photo does not match the entrant.", "id.photo", "FACE");
    if (!rules.sectors.includes(d.permit.sector)) add("sector_closed", `Sector ${d.permit.sector} is closed.`, "permit.sector", "rule:sectors");
    if (rules.sectorCWork && d.permit.sector === "C" && d.permit.purpose !== "WORK") add("sector_c_purpose", "Sector C admits WORK purpose only.", "permit.purpose", "rule:sectorC");
    if (rules.vantaRevoked && d.id.district === "VANTA") add("district_revoked", "VANTA ID cards are revoked.", "id.district", "book:districts");
    if (rules.directive && d.id.district === rules.directive) add("directive", `Directive 4-L: ${rules.directive} residents are denied today.`, "id.district", "rule:directive");
    if (rules.work && d.permit.purpose === "WORK") {
      if (!d.work) add("missing_work", "WORK entrants need a work order.", "missing:work", "rule:work");
      else {
        if (!EMPLOYERS_OK.includes(d.work.employer)) add("employer_unlisted", "Employer is not on the approved list.", "work.employer", "book:employers");
        if (d.work.sector !== d.permit.sector) add("work_sector", "Work order sector does not match the permit.", "work.sector", "permit.sector");
      }
    }
    if (needsHealth(rules, d.id.district)) {
      if (!d.health) add("missing_health", "Entrant needs a health slip.", "missing:health", "rule:health");
      else {
        if (d.health.result !== "CLEAR") add("health_exposed", "Health slip shows spore EXPOSURE.", "health.result", "rule:health");
        if (t - d.health.tested > 7) add("health_old", "Health slip is older than 7 days.", "health.tested", "TODAY");
      }
    }
    if (needsBadge(rules, d.permit.sector)) {
      if (!d.badge) add("missing_badge", `Sector ${d.permit.sector} needs a clearance badge.`, "missing:badge", "rule:badge");
      else {
        if (d.badge.level < SECTOR_LEVEL[d.permit.sector]) add("badge_level", `Badge level ${d.badge.level} is too low for sector ${d.permit.sector}.`, "badge.level", "permit.sector");
        if (d.badge.expiry < t) add("badge_expired", "Clearance badge has expired.", "badge.expiry", "TODAY");
      }
    }
    if (v.statedPurpose !== d.permit.purpose) add("purpose_lie", `Entrant says ${v.statedPurpose} but the permit says ${d.permit.purpose}.`, "STATEMENT", "permit.purpose");
    if (v.watch) add("watchlist", "Entrant is on the watchlist. Detain.", "FACE", "book:watch");
    return out;
  }
  function sameFace(a, b) {
    return a.species === b.species && a.fur === b.fur && a.eyes === b.eyes && !!a.glasses === !!b.glasses && a.mark === b.mark;
  }
  function verdict(v, rules) {
    const vs = check(v, rules);
    if (vs.some((x) => x.code === "watchlist") && rules.detain) return "detain";
    return vs.length ? "deny" : "approve";
  }

  function inspect(v, rules, a, b) {
    const vs = check(v, rules);
    const hit = vs.find((x) => (x.pair[0] === a && x.pair[1] === b) || (x.pair[0] === b && x.pair[1] === a));
    return hit || null;
  }

  const DOC_LABEL = { id: "IDENTITY CARD", permit: "ENTRY PERMIT", work: "WORK ORDER", health: "HEALTH SLIP", badge: "CLEARANCE BADGE" };

  const LINES = {
    nervous: {
      greet: ["H-hello. Is this the right line?", "Sorry. Sorry. Here are my papers.", "I've never done this before.", "Please be quick, they're watching."],
      purpose: (p) => `I-I'm here for ${p.toLowerCase()}. That's all. Honest.`,
      stay: (w) => `${w} week${w === 1 ? "" : "s"}? Maybe less. I don't want trouble.`,
      confront: ["That... that must be a mistake at the office.", "I didn't notice. Is that bad? Is that very bad?", "Oh no. Oh no no no."],
      approved: ["Thank you. Thank you so much.", "Oh thank goodness."], denied: ["I knew it. I knew this would happen.", "But I— okay. Okay."],
    },
    gruff: {
      greet: ["Papers.", "Let's get this over with.", "Make it fast, clerk."],
      purpose: (p) => `${p}. Obviously.`,
      stay: (w) => `${w} week${w === 1 ? "" : "s"}. Write it down.`,
      confront: ["Not my problem. Take it up with your office.", "You people never get anything right.", "So? Stamp it."],
      approved: ["About time.", "Hmph."], denied: ["You'll regret this.", "Unbelievable."],
    },
    chatty: {
      greet: ["Morning! Cold one today, isn't it?", "Hi! Love what you've done with the booth.", "You must see so many faces. Do you remember them?"],
      purpose: (p) => `Oh, ${p.toLowerCase()}, mostly! Well — also the canteen. The soup is famous.`,
      stay: (w) => `About ${w} week${w === 1 ? "" : "s"}, unless I fall in love with the place.`,
      confront: ["Ha! Would you look at that. Typo, surely.", "Oh, that's funny, I hadn't noticed.", "You're sharp! But it's fine, really."],
      approved: ["Wonderful! Have a lovely shift!", "You're a star."], denied: ["Oh. Well. That's a shame.", "Right. Okay! I'll... sort it."],
    },
    formal: {
      greet: ["Good morning. My documents, as required.", "I trust everything is in order.", "Inspector."],
      purpose: (p) => `My purpose is ${p.toLowerCase()}, as stated on the permit.`,
      stay: (w) => `${w} week${w === 1 ? "" : "s"}, in accordance with my order.`,
      confront: ["I assure you the documents were issued correctly.", "I will be filing a complaint with the issuing office.", "An administrative error, clearly."],
      approved: ["Thank you, inspector.", "Very good."], denied: ["I see. This will be reported.", "Most irregular."],
    },
    weary: {
      greet: ["Long walk.", "...here.", "Another day."],
      purpose: (p) => `${p.toLowerCase()}. same as always.`,
      stay: (w) => `${w} week${w === 1 ? "" : "s"}. or until i drop.`,
      confront: ["...is it. i didn't check.", "does it matter.", "fine."],
      approved: ["...thanks.", "mm."], denied: ["of course.", "...right."],
    },
    cryptic: {
      greet: ["The lamps are low tonight.", "You have a kind booth.", "Do you hear it too? The hum."],
      purpose: (p) => `${p}. Among other things.`,
      stay: (w) => `${w} week${w === 1 ? "" : "s"}. Time works differently past the gate.`,
      confront: ["Paper lies. Faces lie more.", "Look closer. Not at me — at them.", "Some mistakes are deliberate."],
      approved: ["We'll remember this.", "The door remembers who opened it."], denied: ["As expected.", "Another time, then."],
    },
    cheerful: {
      greet: ["Hello hello! Beautiful day for paperwork!", "Hi there! Big fan of your stamp.", "Good morning, friend!"],
      purpose: (p) => `${p}! Very exciting!`,
      stay: (w) => `${w} week${w === 1 ? "" : "s"}! Can't wait!`,
      confront: ["Whoopsie! Is that wrong?", "Oh! Well, nobody's perfect!", "Hmm! I'll ask them to fix it!"],
      approved: ["Yay! Thank you!", "You're the best!"], denied: ["Aw. Okay! Rules are rules!", "Oh no! Well, bye!"],
    },
  };
  const CONFRONT_SPECIFIC = {
    name_mismatch: ["They spelled it wrong at the office.", "That's my maiden name. Or... it was."],
    idno_mismatch: ["They reissued my card. The permit must be old.", "Numbers, numbers. Who can remember numbers?"],
    id_expired: ["I've been meaning to renew it.", "The office has been closed for weeks."],
    permit_expired: ["It's only a few days over.", "The renewal is in the post."],
    seal_invalid: ["That's the seal they gave me.", "A seal is a seal."],
    photo_mismatch: ["It's an old photo. I've changed.", "Bad lighting. Everyone looks different in photos."],
    purpose_lie: ["Did I say that? I meant what the permit says.", "Does it matter why?"],
    employer_unlisted: ["They're a new company. Very legitimate.", "Everyone works for them now."],
    health_exposed: ["I feel fine. It's just a cough.", "The test was wrong. They're always wrong."],
    health_old: ["The clinic had a queue for a week.", "It was clear then. It's clear now."],
    badge_level: ["They said it was enough.", "I'll be upgraded next week."],
    district_revoked: ["Vanta is home. I can't change that.", "Nobody told us."],
  };

  const STORY = {
    1: [
      { key: "pell", at: 2, overrides: { first: "PELL", last: "ARNO", species: "mouse", personality: "nervous", district: "KESSLER", sector: "B", purpose: "VISIT" },
        tweak: (v, t) => { v.docs.permit.expiry = t - 1; },
        greet: "Please. My daughter Nima works in Sector B. She hasn't written in three weeks.",
        plea: "It expired YESTERDAY. One day. Please — I just need to know she's alright.",
        approveFlag: "pell_helped", denyFlag: "pell_denied" },
    ],
    2: [
      { key: "wren", at: 1, overrides: { first: "WREN", last: "MOTT", species: "moth", personality: "cryptic", sector: "A", purpose: "TRANSIT" },
        greet: "The lamps are low tonight. You'll find something under the permit. Read it later.",
        after: "note" },
      { key: "pell2", at: 4, needs: "pell_denied", overrides: { first: "PELL", last: "ARNO", species: "mouse", personality: "nervous", district: "KESSLER", sector: "B", purpose: "VISIT" },
        greet: "I renewed it. Stood in line all night. Is it — is it right now?", approveFlag: "pell_reunited" },
      { key: "tuft", at: 6, greet: "mrrp." },
    ],
    3: [
      { key: "odo", at: 1, overrides: { first: "ODO", last: "KESSEL", species: "bear", personality: "weary", district: "LOWMARSH", sector: "C", purpose: "WORK" },
        tweak: (v) => { v.docs.health.result = "EXPOSED"; },
        greet: "Thirty years at the Halvorsen works. Never missed a shift.", plea: "It's a cough. If I miss today they'll give my job to someone else." },
      { key: "juniper", at: 3, overrides: { first: "JUNIPER", last: "SOKOL", species: "fox", personality: "chatty", sector: "B", purpose: "VISIT" },
        tweak: (v, t, rules) => { v.docs.permit.seal = [0, 1, 2, 3, 4, 5].find((s) => !rules.seals.includes(s)); },
        greet: "Hi! Wren says you have a kind booth.", plea: "The seal is... homemade. I need to get to the archive in B. Please.",
        approveFlag: "juniper_in", static: { approve: 2, deny: -1 }, suspicion: { approve: 10 } },
    ],
    4: [
      { key: "ambrose", at: 2, overrides: { first: "AMBROSE", last: "TELL", species: "goat", personality: "gruff", sector: "C", purpose: "WORK" },
        tweak: (v) => { if (v.docs.badge) v.docs.badge.level = 2; },
        greet: "Thirty credits says you don't look at the badge.", bribe: 30 },
    ],
    5: [
      { key: "kip", at: 1, overrides: { first: "KIP", last: "", species: "cat", personality: "nervous" },
        tweak: (v) => { v.docs = {}; v.traits.age = 0; v.traits.hat = 0; v.traits.glasses = false; }, greet: "um. hi. i'm looking for my mum. she went into sector D for work on tuesday.",
        plea: "she said she'd be back. she always comes back. can i go look?", kid: true },
      { key: "varga", at: 3, overrides: { first: "ILSE", last: "VARGA", species: "owl", personality: "formal", district: "NORTHWALL", sector: "D", purpose: "WORK" },
        greet: "Doctor Varga, resonance division. The trials are going beautifully.", lore: "varga" },
      { key: "tuft", at: 6, greet: "mrrp?" },
    ],
    6: [
      { key: "sato", at: 1, needs: "static2", overrides: { first: "SATO", last: "LUNDE", species: "crow", personality: "cryptic", sector: "B", purpose: "TRANSIT" },
        tweak: (v, t, rules) => { v.docs.permit.seal = [0, 1, 2, 3, 4, 5].find((s) => !rules.seals.includes(s)); },
        greet: "The lamps are low tonight. Tomorrow, the door.", static: { approve: 1 }, suspicion: { approve: 8 } },
      { key: "grell", at: 3, overrides: { first: "GRELL", last: "HAUK", species: "crow", personality: "formal", sector: "A", purpose: "MEDICAL" },
        greet: "Inspector Grell, internal audit. Don't mind me. Carry on as you normally would.", inspector: true },
    ],
    7: [
      { key: "wren_final", at: 2, needs: "static3", overrides: { first: "WREN", last: "MOTT", species: "moth", personality: "cryptic", sector: "D", purpose: "WORK" },
        greet: "It's time. Sector D. Open the gate and the whole valley hears what they've been doing.", final: true },
      { key: "tuft", at: 5, greet: "mrrrp." },
    ],
  };

  const HEADLINES = [
    () => "FACILITY 09 WELCOMES NEW INTAKE STAFF",
    (f) => f.pell_helped ? "\"A FATHER'S LOVE\": RESIDENT CROSSES CHECKPOINT ON LAPSED PAPERS" : "CHECKPOINT C: ORDER MAINTAINED, SAYS SUPERVISOR",
    (f) => f.note_kept ? "LEAFLETS FOUND IN SECTOR A — 'LISTEN TO THE HUM'" : "SPORE CASES RISE IN LOWMARSH",
    (f) => f.juniper_in ? "ARCHIVE BREAK-IN: FILES ON 'RESONANCE' MISSING" : "LOWMARSH QUARANTINE: 'TEMPORARY', SAYS DIRECTOR",
    (f) => f.directive_broken ? "CLERK DEFIES DIRECTIVE 4-L — INQUIRY OPENED" : "DIRECTIVE 4-L 'A SUCCESS'",
    (f) => f.kip_hidden ? "CHILD MISSING NEAR CHECKPOINT C — 'HAVE YOU SEEN KIP?'" : "SECTOR D SEALED AFTER 'MINOR INCIDENT'",
    (f) => (f.static || 0) >= 3 ? "STRANGE SIGNAL HEARD ACROSS VALLEY AT NIGHT" : "FACILITY 09 TO EXPAND. AGAIN.",
  ];

  const LORE = {
    orientation: { title: "ORIENTATION MEMO", body: "Welcome to Intake Control, Checkpoint C. Your duty is simple: compare, verify, decide. You are not required to understand what happens beyond the gate. You are required not to ask.\n\n— Supervisor Hesk" },
    note: { title: "NOTE (FOLDED FOUR TIMES)", body: "We are not the enemy. Look closer at Sector C. Count the workers who go in. Count the ones who come out. When the lamps are low, we will ask you to open a door.\n\n— W." },
    spores: { title: "SPORE ADVISORY 3-B", body: "Exposure presents as a dry cough, a fondness for low sounds, and an inability to sleep in silence. Exposed residents must not pass. Exposure is not contagious. Probably." },
    directive: { title: "DIRECTIVE 4-L", body: "Effective immediately and for one shift only: all residents of LOWMARSH district are to be denied entry regardless of documentation. Reason: classified. Compliance will be measured." },
    varga: { title: "RESONANCE TRIAL 7 (STOLEN PAGE)", body: "Subjects exposed to the 41 Hz carrier for six hours no longer report fear. Subjects exposed for twelve report hearing the facility 'singing'. Recommend expansion to the general workforce. — I.V." },
    kip: { title: "A DRAWING IN CRAYON", body: "A small cat holding a big cat's hand. Behind them, a building with no windows. In the corner, in careful letters: KIP + MUM. Someone has added, in pen: + YOU." },
    you: { title: "PERSONNEL FILE: INTAKE CLERK", body: "Seven shifts at Checkpoint C. Every stamp recorded. Every hesitation timed. File retained indefinitely." },
    tuft: { title: "VISITOR WITHOUT PAPERS", body: "Species: cat. Name: Tuft (per collar). Documents: none. Admitted three times, by the same clerk, against regulations. Current location: everywhere at once, apparently." },
  };

  const ENDINGS = {
    terminated: { title: "TERMINATED", text: "Too many citations. Your badge is clipped in half at the gate. Somebody new will sit in your booth tomorrow, and they will not know your name." },
    detained: { title: "DETAINED", text: "They come for you at the end of the shift. Inspector Grell is very polite about it. The booth's lamp stays on all night." },
    evicted: { title: "EVICTED", text: "Two nights without rent. Your room is given to a worker from Sector C who doesn't talk much. You sleep in the booth, which is technically not allowed." },
    promoted: { title: "PROMOTED", text: "Supervisor of Intake Control. A bigger desk. A quieter mind. Some nights you hear the hum through the floor, and it sounds almost like singing." },
    exposed: { title: "EXPOSED", text: "The gate opens. Wren's people carry the Resonance files out into the valley. By morning every radio is playing the hum, and everyone finally knows what it is." },
    gone: { title: "GONE", text: "You leave your stamp on the desk and walk out the back with Kip. Nobody stops you. Nobody ever really looks at the clerks." },
    cat: { title: "THE CAT", text: "On the seventh day Tuft sits on your permit and refuses to move. You understand, finally: you were never inspecting them. Tuft was inspecting you. APPROVED." },
    quiet: { title: "ANOTHER WEEK", text: "Seven shifts complete. No promotions, no scandals. Facility 09 thanks you for your continued vigilance. See you Monday." },
  };

  const api = {
    DAY1, fmtDate, ordinal, fromOrdinal, dayRules, DAYS, DISTRICTS, SECTORS, SECTOR_LEVEL, PURPOSES, EMPLOYERS_OK, EMPLOYERS_BAD,
    SEAL_NAMES, SPECIES, LINES, CONFRONT_SPECIFIC, STORY, HEADLINES, LORE, ENDINGS, DOC_LABEL, FORGERY_CODE,
    makeVisitor, generate, applyForgery, watchlist, forgeriesFor, check, verdict, inspect, sameFace, needsHealth, needsBadge, mutateTraits, makeTraits,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DENIED = api;
})(typeof window !== "undefined" ? window : globalThis);
