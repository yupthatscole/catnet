// catnet — by cole (github.com/yupthatscole)
#include "storage.h"
#include "config.h"

static fs::LittleFSFS g_userFS;
static bool g_webOk = false;
static bool g_userOk = false;

bool storageBegin() {
  g_webOk = LittleFS.begin(false, "/www", 6, "spiffs");
  if (!g_webOk) Serial.println("[fs] web assets partition NOT mounted (run Upload Filesystem Image)");

  g_userOk = g_userFS.begin(false, "/ud", 8, "userdata");
  if (!g_userOk) {
    Serial.println("[fs] userdata not mountable, formatting (first boot?)");
    g_userOk = g_userFS.begin(true, "/ud", 8, "userdata");
  }
  if (g_userOk) {
    Serial.printf("[fs] userdata %u/%u bytes used\n", (unsigned)g_userFS.usedBytes(),
                  (unsigned)g_userFS.totalBytes());
  } else {
    Serial.println("[fs] userdata FAILED; running without persistence");
  }
  return g_webOk && g_userOk;
}

bool webFsOk() { return g_webOk; }
bool userFsOk() { return g_userOk; }
fs::FS &webFs() { return LittleFS; }
fs::FS &userFs() { return g_userFS; }
size_t webTotal() { return g_webOk ? LittleFS.totalBytes() : 0; }
size_t webUsed() { return g_webOk ? LittleFS.usedBytes() : 0; }
size_t userTotal() { return g_userOk ? g_userFS.totalBytes() : 0; }
size_t userUsed() { return g_userOk ? g_userFS.usedBytes() : 0; }

static Volume g_internal = {
    "int", "internal flash", &g_userFS, "/f", "/fp", userTotal, userUsed,
    FILE_MAX_BYTES, USER_QUOTA_BYTES, FS_RESERVE_BYTES,
};

Volume &filesVolume() { return g_internal; }

String readSmallFile(fs::FS &fs, const char *path, size_t maxBytes) {
  File f = fs.open(path, "r");
  if (!f || f.isDirectory()) return String();
  size_t n = f.size();
  if (n > maxBytes) n = maxBytes;
  String s;
  if (!s.reserve(n)) {
    f.close();
    return String();
  }
  char buf[256];
  size_t left = n;
  while (left) {
    size_t want = left < sizeof(buf) ? left : sizeof(buf);
    size_t got = f.read((uint8_t *)buf, want);
    if (!got) break;
    s.concat(buf, got);
    left -= got;
  }
  f.close();
  return s;
}

bool writeFileAtomic(fs::FS &fs, const char *path, const String &data) {
  String tmp = String(path) + ".t";
  File f = fs.open(tmp.c_str(), "w", true);
  if (!f) return false;
  size_t w = f.write((const uint8_t *)data.c_str(), data.length());
  f.close();
  if (w != data.length()) {
    fs.remove(tmp.c_str());
    return false;
  }
  if (!fs.rename(tmp.c_str(), path)) {
    fs.remove(path);
    if (!fs.rename(tmp.c_str(), path)) {
      fs.remove(tmp.c_str());
      return false;
    }
  }
  return true;
}

bool appendLine(fs::FS &fs, const char *path, const String &line) {
  File f = fs.open(path, "a", true);
  if (!f) return false;
  size_t w = f.print(line);
  w += f.print('\n');
  f.close();
  return w == line.length() + 1;
}

size_t dirSize(fs::FS &fs, const char *path, int *count) {
  size_t total = 0;
  int n = 0;
  File d = fs.open(path);
  if (d && d.isDirectory()) {
    for (File f = d.openNextFile(); f; f = d.openNextFile()) {
      if (!f.isDirectory()) {
        total += f.size();
        n++;
      }
      f.close();
    }
  }
  if (d) d.close();
  if (count) *count = n;
  return total;
}

bool removeTree(fs::FS &fs, const char *path) {
  File d = fs.open(path);
  if (!d) return true;
  if (!d.isDirectory()) {
    d.close();
    return fs.remove(path);
  }
  std::vector<String> files, dirs;
  for (File f = d.openNextFile(); f; f = d.openNextFile()) {
    String p = String(path) + "/" + f.name();
    if (f.isDirectory()) dirs.push_back(p);
    else files.push_back(p);
    f.close();
  }
  d.close();
  bool ok = true;
  for (auto &p : files) ok &= fs.remove(p.c_str());
  for (auto &p : dirs) ok &= removeTree(fs, p.c_str());
  ok &= fs.rmdir(path);
  return ok;
}
