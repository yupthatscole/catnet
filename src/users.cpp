// catnet — by cole (github.com/yupthatscole)
#include "users.h"
#include <mbedtls/pkcs5.h>
#include <esp_random.h>
#include <vector>
#include "storage.h"
#include "util.h"

static User g_users[MAX_USERS];
static bool g_dirty = false;
static uint32_t g_dirtySince = 0;
static uint8_t g_nextId = 1;
static const char *USERS_PATH = "/sys/users.tsv";

void hashSecret(const String &secret, const uint8_t *salt, uint16_t iter, uint8_t out[32]) {
  mbedtls_pkcs5_pbkdf2_hmac_ext(MBEDTLS_MD_SHA256, (const unsigned char *)secret.c_str(),
                                secret.length(), salt, 16, iter, 32, out);
}

static void copyStr(char *dst, size_t cap, const String &src) {
  strncpy(dst, src.c_str(), cap - 1);
  dst[cap - 1] = 0;
}

static String serialize() {
  String out;
  out.reserve(160 * userCount() + 32);
  out += "#catnet-users 1 ";
  out += g_nextId;
  out += '\n';
  char saltHex[33], hashHex[65];
  for (auto &u : g_users) {
    if (!u.id) continue;
    toHex(u.salt, 16, saltHex);
    toHex(u.hash, 32, hashHex);
    char head[200];
    snprintf(head, sizeof(head), "%u\t%s\t%u\t%u\t%s\t%s\t%u\t%lu\t%lu\t%u\t%u\t%u\t%s\t", u.id,
             u.name, u.role, u.flags, saltHex, hashHex, u.iter, (unsigned long)u.created,
             (unsigned long)u.lastSeen, u.avatar, u.accent, u.prefs, u.color);
    out += head;
    out += tsvEscape(u.status);
    out += '\t';
    out += tsvEscape(u.bio);
    char tail[64];
    snprintf(tail, sizeof(tail), "\t%u\t%u\t%u\t%u\t%u\n", u.sLogins, u.sMsgs, u.sUploads,
             u.sPosts, u.sGames);
    out += tail;
  }
  return out;
}

static void parseLine(const String &line) {
  std::vector<String> f;
  tsvSplit(line, f);
  if (f.size() < 15) return;
  int id = f[0].toInt();
  if (id <= 0 || id > 254 || !validUserName(f[1]) || userById(id) || userByName(f[1])) return;
  User *slot = nullptr;
  for (auto &u : g_users)
    if (!u.id) {
      slot = &u;
      break;
    }
  if (!slot) return;
  User u = {};
  u.id = id;
  copyStr(u.name, sizeof(u.name), f[1]);
  u.role = f[2].toInt() == ROLE_ADMIN ? ROLE_ADMIN : ROLE_MEMBER;
  u.flags = f[3].toInt();
  if (f[4].length() != 32 || f[5].length() != 64 || !fromHex(f[4].c_str(), u.salt, 16) ||
      !fromHex(f[5].c_str(), u.hash, 32))
    return;
  u.iter = f[6].toInt();
  if (u.iter < 1000) u.iter = PBKDF2_ITERATIONS;
  u.created = strtoul(f[7].c_str(), nullptr, 10);
  u.lastSeen = strtoul(f[8].c_str(), nullptr, 10);
  u.avatar = f[9].toInt() % 12;
  u.accent = f[10].toInt() % 6;
  u.prefs = f[11].toInt();
  copyStr(u.color, sizeof(u.color), f[12]);
  copyStr(u.status, sizeof(u.status), f[13]);
  copyStr(u.bio, sizeof(u.bio), f[14]);
  if (f.size() >= 20) {
    u.sLogins = f[15].toInt();
    u.sMsgs = f[16].toInt();
    u.sUploads = f[17].toInt();
    u.sPosts = f[18].toInt();
    u.sGames = f[19].toInt();
  }
  *slot = u;
}

void usersBegin() {
  memset(g_users, 0, sizeof(g_users));
  if (!userFsOk()) return;
  File f = userFs().open(USERS_PATH, "r");
  if (!f) {
    f = userFs().open((String(USERS_PATH) + ".t").c_str(), "r");
    if (f) Serial.println("[users] recovering from users.tsv.t");
  }
  if (!f) return;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    if (line.startsWith("#catnet-users 1 ")) {
      int n = line.substring(16).toInt();
      if (n > 0 && n < 256) g_nextId = n;
    } else if (line.length() && line[0] != '#') {
      parseLine(line);
    }
  }
  f.close();
  for (auto &u : g_users)
    if (u.id >= g_nextId) g_nextId = u.id + 1;
  Serial.printf("[users] %d accounts loaded\n", userCount());
}

int userCount() {
  int n = 0;
  for (auto &u : g_users)
    if (u.id) n++;
  return n;
}

int adminCount() {
  int n = 0;
  for (auto &u : g_users)
    if (u.id && u.role == ROLE_ADMIN && !(u.flags & UF_DISABLED)) n++;
  return n;
}

User *userSlot(int i) { return (i >= 0 && i < MAX_USERS) ? &g_users[i] : nullptr; }

User *userById(uint8_t id) {
  if (!id) return nullptr;
  for (auto &u : g_users)
    if (u.id == id) return &u;
  return nullptr;
}

User *userByName(const String &nameIn) {
  String name = lowerAscii(nameIn);
  for (auto &u : g_users)
    if (u.id && name == u.name) return &u;
  return nullptr;
}

bool setPassword(User &u, const String &pass) {
  if (pass.length() < PASS_MIN || pass.length() > PASS_MAX) return false;
  esp_fill_random(u.salt, sizeof(u.salt));
  u.iter = PBKDF2_ITERATIONS;
  hashSecret(pass, u.salt, u.iter, u.hash);
  return true;
}

bool checkPassword(const User &u, const String &pass) {
  if (pass.length() > PASS_MAX) return false;
  uint8_t h[32];
  hashSecret(pass, u.salt, u.iter, h);
  return constTimeEq(h, u.hash, 32);
}

UserErr createUser(const String &nameIn, const String &pass, uint8_t role, uint8_t *outId) {
  String name = lowerAscii(nameIn);
  if (!validUserName(name)) return UserErr::BAD_NAME;
  if (pass.length() < PASS_MIN || pass.length() > PASS_MAX) return UserErr::BAD_PASS;
  if (userByName(name)) return UserErr::TAKEN;
  User *slot = nullptr;
  for (auto &u : g_users)
    if (!u.id) {
      slot = &u;
      break;
    }
  if (!slot) return UserErr::FULL;
  uint8_t id = g_nextId;
  if (id == 0 || id >= 255) {  // counter exhausted: fall back to the lowest free id
    for (id = 1; id < 255 && userById(id); id++) {
    }
  }
  User u = {};
  u.id = id;
  copyStr(u.name, sizeof(u.name), name);
  u.role = role;
  u.created = nowEpoch();
  u.avatar = esp_random() % 12;
  static const char *COLORS[] = {"#b8a3fb", "#f49ad8", "#8fe3c4", "#ffc977", "#8fc7ff", "#ff9f8f"};
  copyStr(u.color, sizeof(u.color), COLORS[esp_random() % 6]);
  setPassword(u, pass);
  *slot = u;
  uint8_t prevNext = g_nextId;
  if (id >= g_nextId) g_nextId = id + 1;
  if (!usersSaveNow()) {
    g_nextId = prevNext;
    memset(slot, 0, sizeof(User));
    return UserErr::STORAGE;
  }
  if (outId) *outId = id;
  return UserErr::OK;
}

bool deleteUser(uint8_t id) {
  User *u = userById(id);
  if (!u) return false;
  memset(u, 0, sizeof(User));
  return usersSaveNow();
}

bool usersSaveNow() {
  if (!userFsOk()) return false;
  bool ok = writeFileAtomic(userFs(), USERS_PATH, serialize());
  if (ok) g_dirty = false;
  return ok;
}

void usersMarkDirty() {
  if (!g_dirty) g_dirtySince = millis();
  g_dirty = true;
}

void usersTick() {
  if (g_dirty && millis() - g_dirtySince > 60000UL) usersSaveNow();
}
