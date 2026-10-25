// catnet — by cole (github.com/yupthatscole)
#include <WiFi.h>
#include <esp_chip_info.h>
#include <esp_random.h>
#include <esp_ota_ops.h>
#include "config.h"
#include "storage.h"
#include "system.h"
#include "web.h"

void userJson(Json &j, const User &u, bool full) {
  j.obj();
  j.kn("id", u.id).kv("n", u.name).kv("c", u.color).kn("a", u.avatar);
  j.kv("r", u.role == ROLE_ADMIN ? "admin" : "member").kv("st", u.status);
  j.kb("on", userOnline(u.id));
  if (full) {
    j.kv("bio", u.bio).kn("since", u.created).kn("seen", u.lastSeen);
    j.key("stats").obj();
    j.kn("logins", u.sLogins).kn("msgs", u.sMsgs).kn("uploads", u.sUploads);
    j.kn("posts", u.sPosts).kn("games", u.sGames);
    j.end();
  }
  j.end();
}

static void maybeSetClock(Req &r) {
  if (clockKnown()) return;
  long long t = atoll(r.arg("t").c_str());
  if (t > 1700000000000LL) setClock((uint32_t)(t / 1000));
}

static void meJson(Json &j, Req &r) {
  const User &u = *r.user;
  j.obj();
  j.key("user");
  userJson(j, u, true);
  j.kv("csrf", r.sess->csrf);
  j.kn("accent", u.accent).kn("prefs", u.prefs);
  j.kb("admin", u.role == ROLE_ADMIN);
  j.kb("mustChange", u.flags & UF_MUST_CHANGE);
  j.kb("clock", clockKnown());
  j.end();
}

static void apiState(Req &r) {
  Json j(160);
  j.obj();
  j.kb("setup", userCount() == 0);
  j.kb("open", sysConfig().openSignup);
  j.kv("motd", sysConfig().motd);
  j.kv("ver", CATNET_VERSION);
  j.kb("assets", webAssetsOk());
  j.kb("in", r.user != nullptr);
  uint32_t wait = 0;
  j.kn("wait", loginAllowed(r.ip, &wait) ? 0 : (wait + 999) / 1000);
  j.end();
  sendJson(r, j);
}

static void loginResponse(Req &r, User *u) {
  loginSucceeded(r.ip);
  if (r.sess) sessionDestroy(r.sess);  // never reuse a pre-login session
  Session *s = sessionCreate(u->id, r.ip);
  r.sess = s;
  r.user = u;
  maybeSetClock(r);
  if (u->sLogins < 65535) u->sLogins++;
  u->lastSeen = nowEpoch();
  usersMarkDirty();
  sessionCookie(r.srv, s);
  Json j(400);
  meJson(j, r);
  sendJson(r, j);
}

static void lockedResponse(Req &r, uint32_t waitMs) {
  Json j(80);
  j.obj().kv("error", "too many attempts").kn("wait", (waitMs + 999) / 1000).end();
  sendJson(r, j, 429);
}

static void apiLogin(Req &r) {
  uint32_t wait = 0;
  if (!loginAllowed(r.ip, &wait)) return lockedResponse(r, wait);
  String name = lowerAscii(r.arg("user"));
  name.trim();
  String pass = r.arg("pass");
  User *u = userByName(name);
  bool ok = false;
  if (u) {
    ok = checkPassword(*u, pass);
  } else {
    uint8_t salt[16] = {0}, out[32];
    hashSecret(pass, salt, PBKDF2_ITERATIONS, out);
  }
  if (!ok) {
    loginFailed(r.ip);
    logEvent("login failed for '%.16s'", name.c_str());
    if (!loginAllowed(r.ip, &wait)) return lockedResponse(r, wait);
    return sendError(r, 401, "wrong username or password");
  }
  if (u->flags & UF_DISABLED) return sendError(r, 403, "this account is disabled");
  logEvent("%s logged in", u->name);
  loginResponse(r, u);
}

static void apiRegister(Req &r) {
  uint32_t wait = 0;
  if (!loginAllowed(r.ip, &wait)) return lockedResponse(r, wait);
  bool first = userCount() == 0;
  bool needKey = first || !sysConfig().openSignup;
  if (needKey && !portalKeyCheck(r.arg("key"))) {
    loginFailed(r.ip);
    if (!loginAllowed(r.ip, &wait)) return lockedResponse(r, wait);
    return sendError(r, 401, "that portal key is not right");
  }
  if (!registerAllowed(r.ip)) return sendError(r, 429, "too many new accounts from this device");
  uint8_t id = 0;
  UserErr e = createUser(r.arg("user"), r.arg("pass"), first ? ROLE_ADMIN : ROLE_MEMBER, &id);
  switch (e) {
    case UserErr::OK: break;
    case UserErr::BAD_NAME: return sendError(r, 400, "names are 3-16 chars: a-z 0-9 _ -");
    case UserErr::BAD_PASS: return sendError(r, 400, "passwords need 6-64 characters");
    case UserErr::TAKEN: return sendError(r, 409, "that name is taken");
    case UserErr::FULL: return sendError(r, 507, "catnet is full (account limit reached)");
    case UserErr::STORAGE: return sendError(r, 500, "could not save the account");
  }
  registerDone(r.ip);
  User *u = userById(id);
  logEvent("new account: %s%s", u->name, first ? " (admin)" : "");
  char line[64];
  snprintf(line, sizeof(line), "%s joined catnet. say hi!", u->name);
  chatSystemMessage(line);
  loginResponse(r, u);
}

static void apiLogout(Req &r) {
  sessionDestroy(r.sess);
  sessionCookie(r.srv, nullptr);
  sendOk(r);
}

static void apiMe(Req &r) {
  Json j(400);
  meJson(j, r);
  sendJson(r, j);
}

static void apiClock(Req &r) {
  maybeSetClock(r);
  Json j(32);
  j.obj().kb("clock", clockKnown()).kn("now", nowEpoch()).end();
  sendJson(r, j);
}

static void apiPulse(Req &r) {
  Json j(512);
  j.obj();
  j.kn("up", millis() / 1000).kn("sta", stationCount());
  j.kb("clock", clockKnown());
  j.kn("ann", announceLatestId());
  uint8_t ids[MAX_SESSIONS];
  int n = onlineUsers(ids, MAX_SESSIONS);
  j.key("on").arr();
  for (int i = 0; i < n; i++) {
    User *u = userById(ids[i]);
    if (!u) continue;
    j.obj().kv("n", u->name).kv("c", u->color).kn("a", u->avatar).end();
  }
  j.end();
  chatPulse(j, r, (uint32_t)r.argInt("c", 0), r.arg("chat") == "1", r.arg("typing") == "1");
  j.end();
  sendJson(r, j);
}

static void apiUsers(Req &r) {
  Json j(2048);
  j.obj().key("users").arr();
  for (int i = 0; i < MAX_USERS; i++) {
    User *u = userSlot(i);
    if (u && u->id && !(u->flags & UF_DISABLED)) userJson(j, *u, false);
  }
  j.end().end();
  sendJson(r, j);
}

static void apiUserGet(Req &r) {
  User *u = userByName(r.arg("n"));
  if (!u || (u->flags & UF_DISABLED)) return sendError(r, 404, "no such cat");
  Json j(600);
  j.obj().key("user");
  userJson(j, *u, true);
  Volume &v = filesVolume();
  String dir = String(v.pubRoot) + "/" + u->id;
  int count = 0;
  dirSize(*v.fs, dir.c_str(), &count);
  String site = dir + "/index.html";
  j.kn("files", count).kb("site", v.fs->exists(site.c_str()));
  j.end();
  sendJson(r, j);
}

static bool validColor(const String &c) {
  if (c.length() != 7 || c[0] != '#') return false;
  for (int i = 1; i < 7; i++)
    if (!isxdigit((unsigned char)c[i])) return false;
  return true;
}

static void apiProfile(Req &r) {
  User &u = *r.user;
  if (r.form.has("color")) {
    String c = lowerAscii(r.arg("color"));
    if (!validColor(c)) return sendError(r, 400, "colour must look like #a1b2c3");
    strncpy(u.color, c.c_str(), sizeof(u.color) - 1);
  }
  if (r.form.has("avatar")) u.avatar = (uint8_t)(r.argInt("avatar", 0) % 12);
  if (r.form.has("accent")) u.accent = (uint8_t)(r.argInt("accent", 0) % 6);
  if (r.form.has("prefs")) u.prefs = (uint8_t)(r.argInt("prefs", 0) & 0x0F);
  if (r.form.has("status")) {
    String s = cleanText(r.arg("status"), sizeof(u.status) - 1, false);
    strncpy(u.status, s.c_str(), sizeof(u.status) - 1);
    u.status[sizeof(u.status) - 1] = 0;
  }
  if (r.form.has("bio")) {
    String s = cleanText(r.arg("bio"), sizeof(u.bio) - 1, true);
    strncpy(u.bio, s.c_str(), sizeof(u.bio) - 1);
    u.bio[sizeof(u.bio) - 1] = 0;
  }
  if (!usersSaveNow()) return sendError(r, 500, "could not save");
  apiMe(r);
}

static void apiPassword(Req &r) {
  User &u = *r.user;
  uint32_t wait = 0;
  if (!loginAllowed(r.ip, &wait)) return lockedResponse(r, wait);
  if (!checkPassword(u, r.arg("old"))) {
    loginFailed(r.ip);
    return sendError(r, 401, "current password is wrong");
  }
  String np = r.arg("new");
  if (np.length() < PASS_MIN || np.length() > PASS_MAX)
    return sendError(r, 400, "passwords need 6-64 characters");
  setPassword(u, np);
  u.flags &= ~UF_MUST_CHANGE;
  if (!usersSaveNow()) return sendError(r, 500, "could not save");
  int n = sessionsDestroyUser(u.id, r.sess);
  logEvent("%s changed password (%d other sessions closed)", u.name, n);
  sendOk(r);
}

static void apiRevoke(Req &r) {
  int n = sessionsDestroyUser(r.user->id, r.sess);
  Json j(32);
  j.obj().kn("closed", n).end();
  sendJson(r, j);
}

static void apiSys(Req &r) {
  bool admin = r.isAdmin();
  Json j(1800);
  j.obj();
  j.kv("ver", CATNET_VERSION).kv("build", __DATE__ " " __TIME__);
  j.key("web").obj().kb("ok", webAssetsOk()).kv("id", webBuildId()).kn("files", webAssetCount()).end();
  j.kn("up", millis() / 1000).kn("boots", bootCount());
  j.kv("reset", resetReasonText()).kv("why", lastRestartReason());
  j.key("heap").obj().kn("free", ESP.getFreeHeap()).kn("min", ESP.getMinFreeHeap());
  j.kn("block", ESP.getMaxAllocHeap()).kn("total", ESP.getHeapSize()).end();
  esp_chip_info_t chip;
  esp_chip_info(&chip);
  j.key("chip").obj().kv("model", ESP.getChipModel()).kn("rev", chip.revision);
  j.kn("cores", chip.cores).kn("mhz", ESP.getCpuFreqMHz()).kn("flash", ESP.getFlashChipSize());
  const esp_partition_t *app = esp_ota_get_running_partition();
  j.kn("sketch", ESP.getSketchSize()).kn("sketchMax", app ? app->size : ESP.getSketchSize());
  j.kv("sdk", ESP.getSdkVersion()).end();
  j.key("fs").obj();
  j.key("web").obj().kn("t", webTotal()).kn("u", webUsed()).end();
  j.key("user").obj().kn("t", userTotal()).kn("u", userUsed()).end();
  j.end();
  SysConfig &c = sysConfig();
  j.key("wifi").obj().kv("ssid", c.ssid).kn("ch", c.channel).kn("sta", stationCount());
  j.kn("max", AP_MAX_CLIENTS).kb("captive", c.captive).kb("lowpow", c.lowPower);
  j.kv("ip", WiFi.softAPIP().toString()).end();
  j.kn("users", userCount()).kn("maxUsers", MAX_USERS).kn("sessions", sessionsActive());
  j.kb("clock", clockKnown()).kn("now", nowEpoch());
  if (admin) {
    j.kn("fails", loginFailuresTotal());
    j.key("stations").arr();
    Station st[AP_MAX_CLIENTS + 2];
    int n = stationList(st, AP_MAX_CLIENTS + 2);
    for (int i = 0; i < n; i++) {
      char mac[18];
      snprintf(mac, sizeof(mac), "%02x:%02x:%02x:%02x:%02x:%02x", st[i].mac[0], st[i].mac[1],
               st[i].mac[2], st[i].mac[3], st[i].mac[4], st[i].mac[5]);
      j.obj().kv("mac", mac).kv("ip", IPAddress(st[i].ip).toString()).kn("rssi", st[i].rssi).end();
    }
    j.end();
    j.key("events").arr();
    for (int i = 0; i < eventCount(); i++) {
      uint32_t up, ep;
      const char *t;
      if (eventAt(i, &up, &ep, &t)) j.obj().kn("up", up).kn("t", ep).kv("m", t).end();
    }
    j.end();
    j.key("cfg").obj().kv("ssid", c.ssid).kn("ch", c.channel).kb("captive", c.captive);
    j.kb("open", c.openSignup).kb("lowpow", c.lowPower).kv("motd", c.motd).end();
  }
  j.end();
  sendJson(r, j);
}

static void apiAdminUsers(Req &r) {
  Json j(3000);
  j.obj().key("users").arr();
  for (int i = 0; i < MAX_USERS; i++) {
    User *u = userSlot(i);
    if (!u || !u->id) continue;
    j.obj().kn("id", u->id).kv("n", u->name).kv("r", u->role == ROLE_ADMIN ? "admin" : "member");
    j.kb("disabled", u->flags & UF_DISABLED).kb("mustChange", u->flags & UF_MUST_CHANGE);
    j.kb("on", userOnline(u->id)).kn("seen", u->lastSeen).kn("since", u->created);
    j.kb("muted", u->mutedUntilMs && (int32_t)(u->mutedUntilMs - millis()) > 0);
    j.end();
  }
  j.end().end();
  sendJson(r, j);
}

static void apiAdminUser(Req &r) {
  User *u = userById((uint8_t)r.argInt("id", 0));
  if (!u) return sendError(r, 404, "no such user");
  String act = r.arg("action");
  bool self = u->id == r.user->id;
  bool lastAdmin = u->role == ROLE_ADMIN && adminCount() <= 1;
  if (act == "promote") {
    u->role = ROLE_ADMIN;
  } else if (act == "demote") {
    if (lastAdmin) return sendError(r, 409, "catnet needs at least one admin");
    u->role = ROLE_MEMBER;
  } else if (act == "disable") {
    if (self) return sendError(r, 409, "you can't disable yourself");
    if (lastAdmin) return sendError(r, 409, "catnet needs at least one admin");
    u->flags |= UF_DISABLED;
    sessionsDestroyUser(u->id, nullptr);
  } else if (act == "enable") {
    u->flags &= ~UF_DISABLED;
  } else if (act == "reset") {
    static const char ALPHA[] = "abcdefghjkmnpqrstuvwxyz23456789";
    char temp[11];
    for (int i = 0; i < 10; i++) temp[i] = ALPHA[esp_random() % (sizeof(ALPHA) - 1)];
    temp[10] = 0;
    setPassword(*u, temp);
    u->flags |= UF_MUST_CHANGE;
    sessionsDestroyUser(u->id, self ? r.sess : nullptr);
    if (!usersSaveNow()) return sendError(r, 500, "could not save");
    logEvent("%s reset the password of %s", r.user->name, u->name);
    Json j(64);
    j.obj().kb("ok", true).kv("temp", temp).end();
    return sendJson(r, j);
  } else if (act == "delete") {
    if (self) return sendError(r, 409, "you can't delete yourself");
    if (lastAdmin) return sendError(r, 409, "catnet needs at least one admin");
    uint8_t id = u->id;
    char name[USERNAME_MAX + 1];
    strncpy(name, u->name, sizeof(name));
    sessionsDestroyUser(id, nullptr);
    removeUserContent(id);
    if (!deleteUser(id)) return sendError(r, 500, "could not save");
    logEvent("%s deleted account %s", r.user->name, name);
    return sendOk(r);
  } else {
    return sendError(r, 400, "unknown action");
  }
  if (!usersSaveNow()) return sendError(r, 500, "could not save");
  logEvent("%s: %s -> %s", r.user->name, act.c_str(), u->name);
  sendOk(r);
}

static void apiAdminConfig(Req &r) {
  SysConfig &c = sysConfig();
  bool wifiChanged = false;
  if (r.form.has("ssid")) {
    String s = cleanText(r.arg("ssid"), 31, false);
    if (s.isEmpty()) return sendError(r, 400, "network name can't be empty");
    wifiChanged |= s != c.ssid;
    c.ssid = s;
  }
  if (r.form.has("wpass") && r.arg("wpass").length()) {
    String p = r.arg("wpass");
    if (p.length() < 8 || p.length() > 63) return sendError(r, 400, "wi-fi password: 8-63 characters");
    wifiChanged |= p != c.wifiPass;
    c.wifiPass = p;
  }
  if (r.form.has("ch")) {
    long ch = r.argInt("ch", c.channel);
    if (ch < 1 || ch > 11) return sendError(r, 400, "channel must be 1-11");
    wifiChanged |= ch != c.channel;
    c.channel = ch;
  }
  if (r.form.has("captive")) {
    bool v = r.arg("captive") == "1";
    wifiChanged |= v != c.captive;
    c.captive = v;
  }
  if (r.form.has("lowpow")) {
    bool v = r.arg("lowpow") == "1";
    wifiChanged |= v != c.lowPower;
    c.lowPower = v;
  }
  if (r.form.has("open")) c.openSignup = r.arg("open") == "1";
  if (r.form.has("motd")) c.motd = cleanText(r.arg("motd"), 120, false);
  if (!configSave()) return sendError(r, 500, "could not save settings");
  logEvent("%s changed settings%s", r.user->name, wifiChanged ? " (wi-fi restarts)" : "");
  Json j(48);
  j.obj().kb("ok", true).kb("wifiRestart", wifiChanged).end();
  sendJson(r, j);
  if (wifiChanged) scheduleRestart(1500, "wi-fi settings changed");
}

static void apiAdminKey(Req &r) {
  if (!portalKeySet(r.arg("key"))) return sendError(r, 400, "portal key: 4-64 characters");
  logEvent("%s changed the portal key", r.user->name);
  sendOk(r);
}

static void apiAdminRestart(Req &r) {
  scheduleRestart(1200, "restarted by admin");
  sendOk(r);
}

void registerCoreApi() {
  route(HTTP_GET, "/api/state", R_PUBLIC, apiState);
  route(HTTP_POST, "/api/login", R_PUBLIC, apiLogin);
  route(HTTP_POST, "/api/register", R_PUBLIC, apiRegister);
  route(HTTP_POST, "/api/logout", R_AUTH, apiLogout);
  route(HTTP_GET, "/api/me", R_AUTH, apiMe);
  route(HTTP_POST, "/api/clock", R_AUTH, apiClock);
  route(HTTP_GET, "/api/pulse", R_AUTH, apiPulse);
  route(HTTP_GET, "/api/users", R_AUTH, apiUsers);
  route(HTTP_GET, "/api/users/get", R_AUTH, apiUserGet);
  route(HTTP_POST, "/api/profile", R_AUTH, apiProfile);
  route(HTTP_POST, "/api/password", R_AUTH, apiPassword);
  route(HTTP_POST, "/api/sessions/revoke", R_AUTH, apiRevoke);
  route(HTTP_GET, "/api/sys", R_AUTH, apiSys);
  route(HTTP_GET, "/api/admin/users", R_ADMIN, apiAdminUsers);
  route(HTTP_POST, "/api/admin/user", R_ADMIN, apiAdminUser);
  route(HTTP_POST, "/api/admin/config", R_ADMIN, apiAdminConfig);
  route(HTTP_POST, "/api/admin/portalkey", R_ADMIN, apiAdminKey);
  route(HTTP_POST, "/api/admin/restart", R_ADMIN, apiAdminRestart);
}
