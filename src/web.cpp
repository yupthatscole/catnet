// catnet — by cole (github.com/yupthatscole)
#include "web.h"
#include <LittleFS.h>
#include <esp_task_wdt.h>
#include <vector>
#include "config.h"
#include "storage.h"
#include "system.h"

struct Route {
  HTTPMethod m;
  const char *path;
  uint8_t flags;
  RouteFn fn;
};
static std::vector<Route> g_routes;

struct Asset {
  String path;
  char etag[12];
  bool gz;
  bool ok;  // file present with the size the manifest promised
};
static std::vector<Asset> g_assets;
static String g_buildId;
static bool g_assetsOk = false;
static int g_assetsBroken = 0;

static String g_body;
static bool g_bodyOverflow = false;

static const char *CSP =
    "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; "
    "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; "
    "font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; "
    "frame-ancestors 'none'";

void route(HTTPMethod m, const char *path, uint8_t flags, RouteFn fn) {
  g_routes.push_back({m, path, flags, fn});
}

bool webAssetsOk() { return g_assetsOk && g_assetsBroken == 0; }
const char *webBuildId() { return g_buildId.c_str(); }
int webAssetCount() { return (int)g_assets.size(); }

uint32_t clientIp(WebServer &srv) { return (uint32_t)srv.client().remoteIP(); }

String Req::arg(const char *k) const {
  if (method == HTTP_POST && form.has(k)) return form.get(k);
  return srv.arg(k);
}

long Req::argInt(const char *k, long def) const {
  String v = arg(k);
  if (v.isEmpty()) return def;
  char *end = nullptr;
  long n = strtol(v.c_str(), &end, 10);
  return (end && end != v.c_str()) ? n : def;
}

static void loadManifest() {
  g_assets.clear();
  g_assetsOk = false;
  g_assetsBroken = 0;
  if (!webFsOk()) return;
  File f = webFs().open("/manifest.txt", "r");
  if (!f) {
    logEvent("web assets: manifest.txt missing");
    return;
  }
  String head = f.readStringUntil('\n');
  if (!head.startsWith("catnet-web ")) {
    f.close();
    logEvent("web assets: bad manifest");
    return;
  }
  int sp = head.indexOf(' ', 11);
  int ver = head.substring(11, sp).toInt();
  g_buildId = sp > 0 ? head.substring(sp + 1) : String("?");
  g_buildId.trim();
  if (ver != WEB_API_VERSION) logEvent("web assets v%d but firmware expects v%d", ver, WEB_API_VERSION);
  std::vector<String> cols;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    tsvSplit(line, cols);
    if (cols.size() < 4 || !cols[0].startsWith("/")) continue;
    Asset a;
    a.path = cols[0];
    strncpy(a.etag, cols[1].c_str(), sizeof(a.etag) - 1);
    a.etag[sizeof(a.etag) - 1] = 0;
    a.gz = cols[2] == "1";
    size_t want = cols[3].toInt();
    String file = a.path + (a.gz ? ".gz" : "");
    File af = webFs().open(file.c_str(), "r");
    a.ok = af && !af.isDirectory() && af.size() == want && want > 0;
    if (af) af.close();
    if (!a.ok) {
      g_assetsBroken++;
      logEvent("web asset damaged: %s", a.path.c_str());
    }
    g_assets.push_back(a);
  }
  f.close();
  g_assetsOk = !g_assets.empty();
  Serial.printf("[web] %u assets, build %s, %d damaged\n", (unsigned)g_assets.size(),
                g_buildId.c_str(), g_assetsBroken);
}

static const Asset *findAsset(const String &path) {
  for (auto &a : g_assets)
    if (a.path == path) return &a;
  return nullptr;
}

static const char *mimeFor(const String &p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".woff")) return "font/woff";
  if (p.endsWith(".woff2")) return "font/woff2";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".json")) return "application/json";
  if (p.endsWith(".ico")) return "image/x-icon";
  if (p.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

static void baseHeaders(WebServer &srv) {
  srv.sendHeader("X-Content-Type-Options", "nosniff");
  srv.sendHeader("Referrer-Policy", "same-origin");
}

void setNoStore(WebServer &srv) { srv.sendHeader("Cache-Control", "no-store"); }

void sendJson(Req &r, Json &j, int code) {
  baseHeaders(r.srv);
  setNoStore(r.srv);
  r.srv.send(code, "application/json", j.s);
}

void sendOk(Req &r) {
  Json j(16);
  j.obj().kb("ok", true).end();
  sendJson(r, j);
}

void sendError(Req &r, int code, const char *msg) {
  Json j(64);
  j.obj().kv("error", msg).end();
  sendJson(r, j, code);
}

void sessionCookie(WebServer &srv, const Session *s) {
  if (s) {
    srv.sendHeader("Set-Cookie", String("cn_sid=") + s->token +
                                     "; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400");
  } else {
    srv.sendHeader("Set-Cookie", "cn_sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  }
}

static const char FALLBACK_PAGE[] PROGMEM =
    "<!doctype html><html lang=en><meta charset=utf-8>"
    "<meta name=viewport content='width=device-width,initial-scale=1'>"
    "<title>catnet - assets missing</title>"
    "<body style='background:#0d0a12;color:#ece6f7;font:16px system-ui;padding:24px;max-width:560px;margin:auto'>"
    "<h1 style='color:#b8a3fb'>catnet.</h1>"
    "<p>the firmware is running, but the web files on the ESP32 are missing or damaged.</p>"
    "<p>in VS Code run <b>PlatformIO &rarr; Upload Filesystem Image</b> "
    "(or <code>pio run -t uploadfs</code>) with the board connected, then reload.</p>"
    "<p style='color:#a397b8'>tuft is sitting on the empty box the files came in.</p></body></html>";

static void sendFallback(WebServer &srv, int code) {
  baseHeaders(srv);
  setNoStore(srv);
  srv.send_P(code, "text/html; charset=utf-8", FALLBACK_PAGE);
}

// sends files in chunks so a slow phone can't trip the watchdog
size_t streamFileSafe(WebServer &srv, File &f, const char *mime, int code, bool gzip) {
  size_t size = f.size();
  if (gzip) srv.sendHeader("Content-Encoding", "gzip");
  srv.setContentLength(size);
  srv.send(code, mime, "");
  NetworkClient client = srv.client();
  static uint8_t buf[1436];
  size_t sent = 0;
  uint32_t stalledSince = 0;
  while (sent < size && client.connected()) {
    esp_task_wdt_reset();
    size_t n = f.read(buf, sizeof(buf));
    if (!n) break;
    size_t off = 0;
    while (off < n && client.connected()) {
      size_t w = client.write(buf + off, n - off);
      if (w) {
        off += w;
        stalledSince = 0;
      } else {
        if (!stalledSince) stalledSince = millis();
        if (millis() - stalledSince > 8000) return sent + off;  // client stopped reading
        esp_task_wdt_reset();
        delay(5);
      }
    }
    sent += off;
  }
  return sent;
}

static bool streamAsset(WebServer &srv, const Asset &a, int code, bool versioned) {
  if (!a.ok) return false;
  String file = a.path + (a.gz ? ".gz" : "");
  File f = webFs().open(file.c_str(), "r");
  if (!f || f.size() == 0) {
    if (f) f.close();
    return false;
  }
  baseHeaders(srv);
  if (a.path.endsWith(".html")) {
    srv.sendHeader("Content-Security-Policy", CSP);
    srv.sendHeader("X-Frame-Options", "DENY");
  }
  if (code == 200) {
    srv.sendHeader("ETag", String("\"") + a.etag + "\"");
    srv.sendHeader("Cache-Control",
                   versioned ? "public, max-age=31536000, immutable" : "no-cache");
  } else {
    setNoStore(srv);
  }
  streamFileSafe(srv, f, mimeFor(a.path), code, a.gz);
  f.close();
  return true;
}

static void sendErrorPage(WebServer &srv, int code) {
  const Asset *a = findAsset(code == 404 ? "/404.html" : "/oops.html");
  if (!a || !streamAsset(srv, *a, code, false)) {
    if (code == 404) {
      baseHeaders(srv);
      srv.send(404, "text/plain", "404 - the cat ate this page");
    } else {
      sendFallback(srv, code);
    }
  }
}

static void redirect(WebServer &srv, const String &to) {
  srv.sendHeader("Location", to);
  setNoStore(srv);
  srv.send(302, "text/plain", "");
}

static bool isPublicPage(const String &p) {
  return p == "/login.html" || p == "/404.html" || p == "/oops.html";
}

static void serveStatic(Req &r) {
  WebServer &srv = r.srv;
  if (r.method != HTTP_GET && r.method != HTTP_HEAD) {
    baseHeaders(srv);
    srv.send(405, "text/plain", "method not allowed");
    return;
  }
  if (!webFsOk() || !g_assetsOk) {
    sendFallback(srv, 503);
    return;
  }
  String p = r.path;
  if (p.indexOf("..") >= 0 || p.indexOf("//") >= 0) {
    sendErrorPage(srv, 404);
    return;
  }
  if (p == "/") p = "/index.html";
  int slash = p.lastIndexOf('/');
  if (p.indexOf('.', slash) < 0) p += ".html";  // /chat -> /chat.html
  const Asset *a = findAsset(p);
  if (!a) {
    sendErrorPage(srv, 404);
    return;
  }
  bool html = p.endsWith(".html");
  if (html && !isPublicPage(p) && !r.user) {
    String next = r.path;
    redirect(srv, next == "/" ? String("/login") : "/login?next=" + next);
    return;
  }
  if (html && p == "/login.html" && r.user) {
    redirect(srv, "/");
    return;
  }
  String inm = srv.header("If-None-Match");
  if (inm.length() && inm.indexOf(a->etag) >= 0 && a->ok) {
    baseHeaders(srv);
    srv.sendHeader("ETag", String("\"") + a->etag + "\"");
    srv.send(304, "text/plain", "");
    return;
  }
  if (!streamAsset(srv, *a, 200, srv.hasArg("v"))) {
    logEvent("asset unreadable: %s", p.c_str());
    sendFallback(srv, 503);
  }
}

static String cookieToken(WebServer &srv) {
  String c = srv.header("Cookie");
  int i = c.indexOf("cn_sid=");
  while (i > 0 && c[i - 1] != ' ' && c[i - 1] != ';') i = c.indexOf("cn_sid=", i + 1);
  if (i < 0) return String();
  int end = c.indexOf(';', i);
  String t = c.substring(i + 7, end < 0 ? c.length() : end);
  t.trim();
  return t;
}

static bool hostIsOurs(WebServer &srv) {
  String h = srv.hostHeader();
  int colon = h.indexOf(':');
  if (colon >= 0) h = h.substring(0, colon);
  h.toLowerCase();
  return h.isEmpty() || h == "192.168.4.1" || h == AP_LOCAL_DOMAIN || h == "catnet";
}

static bool originOk(WebServer &srv) {
  String o = srv.header("Origin");
  if (o.isEmpty()) return true;  // same-origin form posts in old browsers
  String h = srv.hostHeader();
  return o == "http://" + h;
}

bool requestTrusted(Req &r) {
  if (!originOk(r.srv) || !r.sess) return false;
  String t = r.srv.header("X-CSRF");
  return t.length() == 32 &&
         constTimeEq((const uint8_t *)t.c_str(), (const uint8_t *)r.sess->csrf, 32);
}

static void attachSession(Req &r) {
  String tok = cookieToken(r.srv);
  if (tok.length() != 32) return;
  Session *s = sessionFind(tok.c_str(), r.ip);
  if (!s) return;
  User *u = userById(s->uid);
  if (!u || (u->flags & UF_DISABLED)) {
    sessionDestroy(s);
    return;
  }
  r.sess = s;
  r.user = u;
  uint32_t now = nowEpoch();
  if (now && now - u->lastSeen > 300) {  // persisted lazily
    u->lastSeen = now;
    usersMarkDirty();
  }
}

static void handleApi(Req &r) {
  const Route *found = nullptr;
  bool pathMatched = false;
  for (auto &rt : g_routes) {
    if (r.path == rt.path) {
      pathMatched = true;
      if (rt.m == r.method) {
        found = &rt;
        break;
      }
    }
  }
  if (!found) {
    sendError(r, pathMatched ? 405 : 404, pathMatched ? "method not allowed" : "no such endpoint");
    return;
  }
  if ((found->flags & (R_AUTH | R_ADMIN)) && !r.user) {
    sendError(r, 401, "not logged in");
    return;
  }
  if ((found->flags & R_ADMIN) && !r.isAdmin()) {
    sendError(r, 403, "admins only");
    return;
  }
  if (r.method == HTTP_POST) {
    if (!originOk(r.srv)) {
      sendError(r, 403, "cross-site request blocked");
      return;
    }
    if (r.sess && (found->flags & (R_AUTH | R_ADMIN))) {
      String t = r.srv.header("X-CSRF");
      if (t.length() != 32 || !constTimeEq((const uint8_t *)t.c_str(),
                                           (const uint8_t *)r.sess->csrf, 32)) {
        sendError(r, 403, "bad csrf token, reload the page");
        return;
      }
    }
    if (g_bodyOverflow) {
      sendError(r, 413, "request too large");
      return;
    }
    if (r.srv.header("Content-Type").startsWith("application/x-www-form-urlencoded"))
      r.form.parse(g_body.c_str(), g_body.length());
  }
  found->fn(r);
}

// every single request goes through this
class CatnetHandler : public RequestHandler {
public:
  bool canHandle(WebServer &, HTTPMethod, const String &) override { return true; }
  bool canRaw(WebServer &, const String &uri) override { return uri.startsWith("/api/"); }
  bool canUpload(WebServer &, const String &uri) override { return filesCanUpload(uri); }

  void raw(WebServer &srv, const String &, HTTPRaw &raw) override {
    esp_task_wdt_reset();
    if (raw.status == RAW_START) {
      g_body = String();
      g_bodyOverflow = srv.clientContentLength() > MAX_BODY_BYTES;
      if (!g_bodyOverflow) g_body.reserve(srv.clientContentLength() + 1);
    } else if (raw.status == RAW_WRITE && !g_bodyOverflow) {
      if (g_body.length() + raw.currentSize > MAX_BODY_BYTES) {
        g_bodyOverflow = true;
        g_body = String();
      } else {
        g_body.concat((const char *)raw.buf, raw.currentSize);
      }
    }
  }

  void upload(WebServer &srv, const String &uri, HTTPUpload &up) override {
    esp_task_wdt_reset();  // a big upload is parsed inside one handleClient() call
    Req r(srv, srv.method(), uri, clientIp(srv), g_body);
    attachSession(r);
    filesUpload(srv, up, r);
  }

  bool handle(WebServer &srv, HTTPMethod m, const String &uri) override {
    Req r(srv, m, uri, clientIp(srv), g_body);
    if (!floodAllow(r.ip)) {
      baseHeaders(srv);
      srv.send(429, "text/plain", "slow down");
    } else if (!hostIsOurs(srv)) {
      redirect(srv, "http://192.168.4.1/login");
    } else {
      attachSession(r);
      if (uri.startsWith("/api/")) handleApi(r);
      else if (uri.startsWith("/~")) filesServeHosted(r);
      else serveStatic(r);
    }
    g_body = String();
    g_bodyOverflow = false;
    return true;
  }
};

void webBegin(WebServer &srv) {
  loadManifest();
  const char *headers[] = {"Cookie", "Origin", "X-CSRF", "Content-Type"};
  srv.collectHeaders(headers, 4);
  srv.addHandler(new CatnetHandler());
}
