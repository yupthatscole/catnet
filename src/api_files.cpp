// catnet — by cole (github.com/yupthatscole)
#include "config.h"
#include "storage.h"
#include "system.h"
#include "web.h"

struct FileType {
  const char *ext;
  const char *mime;
  uint8_t mode;  // 0 download only, 1 inline-viewable, 2 hosted-web type
};

static const FileType TYPES[] = {
    {"png", "image/png", 1},        {"jpg", "image/jpeg", 1},      {"jpeg", "image/jpeg", 1},
    {"gif", "image/gif", 1},        {"webp", "image/webp", 1},     {"bmp", "image/bmp", 1},
    {"mp3", "audio/mpeg", 1},       {"ogg", "audio/ogg", 1},       {"wav", "audio/wav", 1},
    {"m4a", "audio/mp4", 1},        {"mp4", "video/mp4", 1},       {"webm", "video/webm", 1},
    {"pdf", "application/pdf", 1},  {"txt", "text/plain; charset=utf-8", 1},
    {"md", "text/plain; charset=utf-8", 1},  {"csv", "text/plain; charset=utf-8", 1},
    {"log", "text/plain; charset=utf-8", 1}, {"html", "text/html; charset=utf-8", 2},
    {"htm", "text/html; charset=utf-8", 2},  {"css", "text/css", 2},
    {"js", "text/javascript", 2},   {"json", "application/json", 2}, {"svg", "image/svg+xml", 2},
    {"zip", "application/zip", 0},  {"gb", "application/octet-stream", 0},
    {"gbc", "application/octet-stream", 0}, {"nes", "application/octet-stream", 0},
};

static const FileType *typeFor(const char *name) {
  const char *e = fileExt(name);
  for (auto &t : TYPES)
    if (strcasecmp(t.ext, e) == 0) return &t;
  return nullptr;
}

// make sure a .png is actually a png etc
static bool magicOk(const char *name, const uint8_t *b, size_t n) {
  auto starts = [&](const char *sig, size_t len, size_t off = 0) {
    return n >= off + len && memcmp(b + off, sig, len) == 0;
  };
  const char *e = fileExt(name);
  if (!strcasecmp(e, "png")) return starts("\x89PNG", 4);
  if (!strcasecmp(e, "jpg") || !strcasecmp(e, "jpeg")) return starts("\xFF\xD8\xFF", 3);
  if (!strcasecmp(e, "gif")) return starts("GIF8", 4);
  if (!strcasecmp(e, "webp")) return starts("RIFF", 4) && starts("WEBP", 4, 8);
  if (!strcasecmp(e, "wav")) return starts("RIFF", 4) && starts("WAVE", 4, 8);
  if (!strcasecmp(e, "bmp")) return starts("BM", 2);
  if (!strcasecmp(e, "pdf")) return starts("%PDF", 4);
  if (!strcasecmp(e, "zip")) return starts("PK", 2);
  const FileType *t = typeFor(name);
  if (t && (strncmp(t->mime, "text/", 5) == 0 || t->mode == 2)) {
    for (size_t i = 0; i < n; i++)
      if (b[i] == 0) return false;  // text files contain no NUL bytes
  }
  return true;
}

static String dirFor(const Volume &v, uint8_t uid, bool priv) {
  return String(priv ? v.privRoot : v.pubRoot) + "/" + uid;
}

static size_t userUsage(const Volume &v, uint8_t uid, int *count) {
  int a = 0, b = 0;
  size_t s = dirSize(*v.fs, dirFor(v, uid, false).c_str(), &a) +
             dirSize(*v.fs, dirFor(v, uid, true).c_str(), &b);
  if (count) *count = a + b;
  return s;
}

struct UploadState {
  bool active;
  bool failed;
  const char *error;
  int code;
  String tmp;
  String finalPath;
  String name;
  size_t written;
  size_t limit;
  bool sniffed;
  File f;
};
static UploadState g_up;

bool filesCanUpload(const String &uri) { return uri == "/api/files/upload"; }

static void failUpload(const char *msg, int code) {
  if (g_up.failed) return;
  g_up.failed = true;
  g_up.error = msg;
  g_up.code = code;
  if (g_up.f) g_up.f.close();
  if (g_up.tmp.length()) filesVolume().fs->remove(g_up.tmp.c_str());
}

void filesUpload(WebServer &srv, HTTPUpload &up, Req &r) {
  Volume &v = filesVolume();
  if (up.status == UPLOAD_FILE_START) {
    g_up.f = File();
    g_up = UploadState();
    g_up.active = true;
    if (!r.user) return failUpload("not logged in", 401);
    if (!requestTrusted(r)) return failUpload("bad csrf token, reload the page", 403);
    if (!userFsOk()) return failUpload("storage is offline", 503);
    String name = safeFileName(up.filename);
    if (name.isEmpty()) return failUpload("that file name can't be used", 400);
    if (!typeFor(name.c_str()))
      return failUpload("that file type isn't allowed on catnet", 415);
    bool priv = srv.arg("p") == "1";
    int count = 0;
    size_t mine = userUsage(v, r.user->id, &count);
    size_t freeBytes = v.total() > v.used() ? v.total() - v.used() : 0;
    size_t claimed = srv.clientContentLength();
    if (count >= FILES_PER_USER) return failUpload("you have the maximum number of files", 409);
    if (claimed > v.maxFile + 2048) return failUpload("file is larger than the limit", 413);
    size_t limit = v.maxFile;
    if (r.user->role != ROLE_ADMIN) {
      if (mine >= v.userQuota) return failUpload("your storage quota is full", 507);
      if (v.userQuota - mine < limit) limit = v.userQuota - mine;
    }
    if (freeBytes <= v.reserve) return failUpload("catnet storage is full", 507);
    if (freeBytes - v.reserve < limit) limit = freeBytes - v.reserve;
    if (claimed > limit + 2048) return failUpload("not enough space for that file", 507);
    g_up.limit = limit;
    g_up.name = name;
    String dir = dirFor(v, r.user->id, priv);
    String path = dir + "/" + name;
    int dot = name.lastIndexOf('.');
    for (int i = 2; v.fs->exists(path.c_str()) || v.fs->exists((dirFor(v, r.user->id, !priv) + "/" + g_up.name).c_str()); i++) {
      if (i > 50) return failUpload("too many files with that name", 409);
      g_up.name = name.substring(0, dot) + " (" + i + ")" + name.substring(dot);
      if (g_up.name.length() > FILE_NAME_MAX + 5) return failUpload("name too long", 400);
      path = dir + "/" + g_up.name;
    }
    g_up.finalPath = path;
    g_up.tmp = dir + "/.upload";
    g_up.f = v.fs->open(g_up.tmp.c_str(), "w", true);
    if (!g_up.f) return failUpload("could not create the file", 500);
  } else if (up.status == UPLOAD_FILE_WRITE) {
    if (!g_up.active || g_up.failed) return;
    if (!g_up.sniffed) {
      g_up.sniffed = true;
      if (!magicOk(g_up.name.c_str(), up.buf, up.currentSize))
        return failUpload("file contents don't match its type", 415);
    }
    if (g_up.written + up.currentSize > g_up.limit)
      return failUpload("file is larger than the space you have", 413);
    size_t w = g_up.f.write(up.buf, up.currentSize);
    g_up.written += w;
    if (w != up.currentSize) return failUpload("storage full while writing", 507);
  } else if (up.status == UPLOAD_FILE_END) {
    if (!g_up.active || g_up.failed) return;
    g_up.f.close();
    if (g_up.written == 0) return failUpload("empty file", 400);
    if (!v.fs->rename(g_up.tmp.c_str(), g_up.finalPath.c_str()))
      return failUpload("could not save the file", 500);
    g_up.tmp = String();
  } else if (up.status == UPLOAD_FILE_ABORTED) {
    failUpload("upload interrupted", 400);
  }
}

static void apiUploadDone(Req &r) {
  if (!g_up.active) return sendError(r, 400, "no file in the request");
  g_up.active = false;
  if (g_up.failed) return sendError(r, g_up.code, g_up.error);
  if (r.user->sUploads < 65535) r.user->sUploads++;
  usersMarkDirty();
  logEvent("%s uploaded %s (%u B)", r.user->name, g_up.name.c_str(), (unsigned)g_up.written);
  Json j(120);
  j.obj().kb("ok", true).kv("n", g_up.name).kn("s", g_up.written).end();
  sendJson(r, j);
}

static void listDir(Json &j, const Volume &v, const String &dir, uint8_t uid, bool priv) {
  File d = v.fs->open(dir.c_str());
  if (!d || !d.isDirectory()) return;
  User *owner = userById(uid);
  for (File f = d.openNextFile(); f; f = d.openNextFile()) {
    if (!f.isDirectory() && f.name()[0] != '.') {
      j.obj().kn("o", uid).kv("on", owner ? owner->name : "?").kv("n", f.name());
      j.kn("s", f.size()).kn("t", (long long)f.getLastWrite()).kb("p", priv).end();
    }
    f.close();
  }
  d.close();
}

static void apiList(Req &r) {
  Volume &v = filesVolume();
  int count = 0;
  size_t mine = userUsage(v, r.user->id, &count);
  Json j(2048);
  j.obj();
  j.key("vol").obj().kv("id", v.id).kv("label", v.label).kn("t", v.total()).kn("u", v.used());
  j.kn("max", v.maxFile).kn("quota", r.isAdmin() ? 0 : v.userQuota).kn("reserve", v.reserve);
  j.kn("perUser", FILES_PER_USER).end();
  j.key("mine").obj().kn("u", mine).kn("n", count).end();
  j.key("files").arr();
  for (int i = 0; i < MAX_USERS; i++) {
    User *u = userSlot(i);
    if (!u || !u->id) continue;
    listDir(j, v, dirFor(v, u->id, false), u->id, false);
    if (u->id == r.user->id || r.isAdmin()) listDir(j, v, dirFor(v, u->id, true), u->id, true);
  }
  j.end().end();
  sendJson(r, j);
}

static String resolve(Req &r, bool forWrite, const char **errOut) {
  Volume &v = filesVolume();
  long o = r.argInt("o", 0);
  String n = r.arg("n");
  bool priv = r.arg("p") == "1";
  *errOut = nullptr;
  if (o <= 0 || o > 254 || n.isEmpty() || safeFileName(n) != n || n[0] == '.') {
    *errOut = "bad file reference";
    return String();
  }
  bool own = r.user && r.user->id == o;
  if ((priv || forWrite) && !own && !r.isAdmin()) {
    *errOut = "that file isn't yours";
    return String();
  }
  String path = dirFor(v, (uint8_t)o, priv) + "/" + n;
  if (!v.fs->exists(path.c_str())) {
    *errOut = "file not found";
    return String();
  }
  return path;
}

static void contentDisposition(WebServer &srv, const String &name, bool attachment) {
  String safe = name;
  safe.replace("\"", "");
  srv.sendHeader("Content-Disposition",
                 String(attachment ? "attachment" : "inline") + "; filename=\"" + safe + "\"");
}

static void apiGet(Req &r) {
  const char *err;
  String path = resolve(r, false, &err);
  if (!path.length()) return sendError(r, strcmp(err, "file not found") ? 403 : 404, err);
  File f = filesVolume().fs->open(path.c_str(), "r");
  if (!f) return sendError(r, 500, "could not open file");
  String name = r.arg("n");
  const FileType *t = typeFor(name.c_str());
  bool inlineOk = t && t->mode == 1 && r.arg("dl") != "1";
  r.srv.sendHeader("X-Content-Type-Options", "nosniff");
  r.srv.sendHeader("Cache-Control", "private, no-cache");
  contentDisposition(r.srv, name, !inlineOk);
  if (inlineOk && strcmp(t->mime, "application/pdf") != 0)
    r.srv.sendHeader("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'");
  streamFileSafe(r.srv, f, inlineOk ? t->mime : "application/octet-stream", 200, false);
  f.close();
}

static void apiDelete(Req &r) {
  const char *err;
  String path = resolve(r, true, &err);
  if (!path.length()) return sendError(r, strcmp(err, "file not found") ? 403 : 404, err);
  if (!filesVolume().fs->remove(path.c_str())) return sendError(r, 500, "could not delete");
  if (r.user->id != r.argInt("o", 0))
    logEvent("%s deleted %s's file %s", r.user->name, userById(r.argInt("o", 0)) ? userById(r.argInt("o", 0))->name : "?", r.arg("n").c_str());
  sendOk(r);
}

static void apiMove(Req &r) {
  const char *err;
  String path = resolve(r, true, &err);
  if (!path.length()) return sendError(r, strcmp(err, "file not found") ? 403 : 404, err);
  Volume &v = filesVolume();
  bool priv = r.arg("p") == "1";
  String to = dirFor(v, (uint8_t)r.argInt("o", 0), !priv) + "/" + r.arg("n");
  if (v.fs->exists(to.c_str())) return sendError(r, 409, "a file with that name already exists there");
  File probe = v.fs->open((dirFor(v, (uint8_t)r.argInt("o", 0), !priv) + "/.keep").c_str(), "w", true);
  if (probe) probe.close();
  v.fs->remove((dirFor(v, (uint8_t)r.argInt("o", 0), !priv) + "/.keep").c_str());
  if (!v.fs->rename(path.c_str(), to.c_str())) return sendError(r, 500, "could not move the file");
  sendOk(r);
}

void filesServeHosted(Req &r) {
  WebServer &srv = r.srv;
  String rest = r.path.substring(2);
  int slash = rest.indexOf('/');
  String uname = slash < 0 ? rest : rest.substring(0, slash);
  String file = slash < 0 ? String() : rest.substring(slash + 1);
  User *u = userByName(uname);
  if (!u || (u->flags & UF_DISABLED)) {
    srv.send(404, "text/plain", "no such cat");
    return;
  }
  if (slash < 0) {  // /~name -> /~name/ so relative links work
    srv.sendHeader("Location", "/~" + String(u->name) + "/");
    srv.send(302, "text/plain", "");
    return;
  }
  if (file.isEmpty()) file = "index.html";
  if (safeFileName(file) != file || file[0] == '.') {
    srv.send(404, "text/plain", "not found");
    return;
  }
  Volume &v = filesVolume();
  String path = dirFor(v, u->id, false) + "/" + file;
  File f = v.fs->open(path.c_str(), "r");
  if (!f || f.isDirectory()) {
    if (f) f.close();
    srv.send(404, "text/plain", "not found");
    return;
  }
  const FileType *t = typeFor(file.c_str());
  srv.sendHeader("X-Content-Type-Options", "nosniff");
  srv.sendHeader("Cache-Control", "no-cache");
  srv.sendHeader("Content-Security-Policy",
                 "sandbox allow-scripts allow-forms allow-popups allow-modals; "
                 "default-src 'self' data: blob: 'unsafe-inline'; frame-ancestors 'self'");
  if (!t || t->mode == 0) contentDisposition(srv, file, true);
  streamFileSafe(srv, f, t && t->mode ? t->mime : "application/octet-stream", 200, false);
  f.close();
}

void registerFilesApi() {
  route(HTTP_GET, "/api/files", R_AUTH, apiList);
  route(HTTP_POST, "/api/files/upload", R_AUTH, apiUploadDone);
  route(HTTP_GET, "/api/files/get", R_AUTH, apiGet);
  route(HTTP_POST, "/api/files/delete", R_AUTH, apiDelete);
  route(HTTP_POST, "/api/files/move", R_AUTH, apiMove);
}
