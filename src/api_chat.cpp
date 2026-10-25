// catnet — by cole (github.com/yupthatscole)
#include "config.h"
#include "storage.h"
#include "system.h"
#include "web.h"

enum : uint8_t { K_MSG = 0, K_JOIN = 1, K_LEAVE = 2, K_SYS = 3, K_ACTION = 4, K_REMOVED = 5 };

struct ChatMsg {
  uint32_t id;
  uint32_t ts;
  uint8_t uid;
  uint8_t kind;
  char name[USERNAME_MAX + 1];
  char color[8];
  char text[CHAT_TEXT_MAX + 1];
};

struct Presence {
  uint8_t uid;
  bool here;
  uint32_t lastPoll;
  uint32_t typingAt;
  float tokens;
  uint32_t refillAt;
};

static ChatMsg g_ring[CHAT_RING];
static int g_count = 0;  // valid messages in ring
static int g_head = 0;   // next write slot
static uint32_t g_lastId = 0;
static Presence g_pres[MAX_USERS];
static const char *LOG_PATH = "/sys/chat.log";

static ChatMsg *msgAt(int i) {  // 0 = oldest
  if (i < 0 || i >= g_count) return nullptr;
  return &g_ring[(g_head - g_count + i + CHAT_RING) % CHAT_RING];
}

static ChatMsg *msgById(uint32_t id) {
  for (int i = 0; i < g_count; i++)
    if (msgAt(i)->id == id) return msgAt(i);
  return nullptr;
}

static String logLine(const ChatMsg &m) {
  char head[64];
  snprintf(head, sizeof(head), "%lu\t%lu\t%u\t%u\t", (unsigned long)m.id, (unsigned long)m.ts,
           m.uid, m.kind);
  String s = head;
  s += m.name;
  s += '\t';
  s += m.color;
  s += '\t';
  s += tsvEscape(m.text);
  return s;
}

static void rewriteLog() {
  if (!userFsOk()) return;
  String all;
  all.reserve(g_count * 80);
  for (int i = 0; i < g_count; i++) {
    all += logLine(*msgAt(i));
    all += '\n';
  }
  writeFileAtomic(userFs(), LOG_PATH, all);
}

static void persist(const ChatMsg &m) {
  if (!userFsOk()) return;
  File f = userFs().open(LOG_PATH, "r");
  size_t size = f ? f.size() : 0;
  if (f) f.close();
  if (size > CHAT_LOG_ROTATE) rewriteLog();  // ring already holds m
  else appendLine(userFs(), LOG_PATH, logLine(m));
}

static ChatMsg &push(uint8_t uid, uint8_t kind, const char *name, const char *color,
                     const String &text) {
  ChatMsg &m = g_ring[g_head];
  memset(&m, 0, sizeof(m));
  m.id = ++g_lastId;
  m.ts = nowEpoch();
  m.uid = uid;
  m.kind = kind;
  strncpy(m.name, name, USERNAME_MAX);
  strncpy(m.color, color, 7);
  strncpy(m.text, text.c_str(), CHAT_TEXT_MAX);
  g_head = (g_head + 1) % CHAT_RING;
  if (g_count < CHAT_RING) g_count++;
  persist(m);
  return m;
}

void chatSystemMessage(const char *text) { push(0, K_SYS, "tuft", "#b8a3fb", text); }

void chatBegin() {
  if (!userFsOk()) return;
  File f = userFs().open(LOG_PATH, "r");
  if (!f) return;
  std::vector<String> c;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    tsvSplit(line, c);
    if (c.size() == 2 && c[0] == "D") {  // deletion marker
      ChatMsg *m = msgById(strtoul(c[1].c_str(), nullptr, 10));
      if (m) {
        m->kind = K_REMOVED;
        m->text[0] = 0;
      }
      continue;
    }
    if (c.size() < 7) continue;
    ChatMsg &m = g_ring[g_head];
    memset(&m, 0, sizeof(m));
    m.id = strtoul(c[0].c_str(), nullptr, 10);
    m.ts = strtoul(c[1].c_str(), nullptr, 10);
    m.uid = c[2].toInt();
    m.kind = c[3].toInt();
    strncpy(m.name, c[4].c_str(), USERNAME_MAX);
    strncpy(m.color, c[5].c_str(), 7);
    strncpy(m.text, c[6].c_str(), CHAT_TEXT_MAX);
    if (m.id > g_lastId) g_lastId = m.id;
    g_head = (g_head + 1) % CHAT_RING;
    if (g_count < CHAT_RING) g_count++;
  }
  f.close();
  rewriteLog();  // compact deletions and old lines
  Serial.printf("[chat] %d messages restored\n", g_count);
}

static Presence *presence(uint8_t uid, bool create) {
  Presence *free = nullptr;
  for (auto &p : g_pres) {
    if (p.uid == uid) return &p;
    if (!p.uid && !free) free = &p;
  }
  if (!create || !free) return nullptr;
  memset(free, 0, sizeof(Presence));
  free->uid = uid;
  free->tokens = CHAT_BURST;
  free->refillAt = millis();
  return free;
}

void chatTick() {
  uint32_t now = millis();
  for (auto &p : g_pres) {
    if (p.uid && p.here && now - p.lastPoll > CHAT_PRESENCE_MS) {
      p.here = false;
      User *u = userById(p.uid);
      if (u) push(u->id, K_LEAVE, u->name, u->color, "");
    }
  }
}

static void msgJson(Json &j, const ChatMsg &m) {
  j.obj().kn("i", m.id).kn("t", m.ts).kn("u", m.uid).kn("k", m.kind);
  j.kv("n", m.name).kv("c", m.color).kv("x", m.text).end();
}

void chatPulse(Json &j, Req &r, uint32_t since, bool inChat, bool typing) {
  uint32_t now = millis();
  j.key("chat").obj();
  if (inChat) {
    Presence *p = presence(r.user->id, true);
    if (p) {
      if (!p->here) {
        p->here = true;
        p->lastPoll = now;
        push(r.user->id, K_JOIN, r.user->name, r.user->color, "");
      }
      p->lastPoll = now;
      p->typingAt = typing ? now : 0;
    }
  }
  j.kn("last", g_lastId);
  if (inChat) {
    j.key("msgs").arr();
    for (int i = 0; i < g_count; i++) {
      ChatMsg *m = msgAt(i);
      if (m->id > since) msgJson(j, *m);
    }
    j.end();
    j.key("here").arr();
    for (auto &p : g_pres) {
      if (!p.uid || !p.here) continue;
      User *u = userById(p.uid);
      if (!u) continue;
      j.obj().kv("n", u->name).kv("c", u->color).kn("a", u->avatar);
      j.kb("typing", p.typingAt && now - p.typingAt < 6000 && p.uid != r.user->id).end();
    }
    j.end();
    j.key("removed").arr();
    for (int i = 0; i < g_count; i++) {
      ChatMsg *m = msgAt(i);
      if (m->kind == K_REMOVED && m->id <= since) j.num(m->id);
    }
    j.end();
  } else {
    int unread = 0;
    for (int i = 0; i < g_count; i++) {
      ChatMsg *m = msgAt(i);
      if (m->id > since && (m->kind == K_MSG || m->kind == K_ACTION) && m->uid != r.user->id)
        unread++;
    }
    j.kn("unread", unread);
  }
  j.end();
}

static void apiSend(Req &r) {
  User &u = *r.user;
  uint32_t now = millis();
  if (u.mutedUntilMs && (int32_t)(u.mutedUntilMs - now) > 0) {
    Json j(64);
    j.obj().kv("error", "you are muted for a bit").kn("wait", (u.mutedUntilMs - now) / 1000).end();
    return sendJson(r, j, 403);
  }
  Presence *p = presence(u.id, true);
  if (p) {
    p->tokens += (now - p->refillAt) / (float)CHAT_REFILL_MS;
    if (p->tokens > CHAT_BURST) p->tokens = CHAT_BURST;
    p->refillAt = now;
    if (p->tokens < 1) return sendError(r, 429, "slow down a little");
    p->tokens -= 1;
    p->typingAt = 0;
  }
  String text = cleanText(r.arg("text"), CHAT_TEXT_MAX, false);
  if (text.isEmpty()) return sendError(r, 400, "empty message");
  uint8_t kind = K_MSG;
  if (text.startsWith("/me ")) {
    kind = K_ACTION;
    text = text.substring(4);
    text.trim();
    if (text.isEmpty()) return sendError(r, 400, "empty message");
  }
  ChatMsg &m = push(u.id, kind, u.name, u.color, text);
  if (u.sMsgs < 65535) u.sMsgs++;
  usersMarkDirty();
  Json j(400);
  j.obj().kb("ok", true).key("msg");
  msgJson(j, m);
  j.end();
  sendJson(r, j);
}

static void apiDelete(Req &r) {
  ChatMsg *m = msgById((uint32_t)r.argInt("id", 0));
  if (!m) return sendError(r, 404, "message is gone already");
  bool own = m->uid == r.user->id && (m->kind == K_MSG || m->kind == K_ACTION);
  if (!own && !r.isAdmin()) return sendError(r, 403, "you can only delete your own messages");
  m->kind = K_REMOVED;
  m->text[0] = 0;
  if (userFsOk()) appendLine(userFs(), LOG_PATH, String("D\t") + m->id);
  if (!own) logEvent("%s removed a chat message by %s", r.user->name, m->name);
  sendOk(r);
}

static void apiMute(Req &r) {
  User *u = userById((uint8_t)r.argInt("id", 0));
  if (!u) return sendError(r, 404, "no such user");
  long minutes = r.argInt("min", 10);
  if (minutes < 0 || minutes > 1440) return sendError(r, 400, "0-1440 minutes");
  u->mutedUntilMs = minutes ? millis() + minutes * 60000UL : 0;
  char line[80];
  if (minutes) snprintf(line, sizeof(line), "%s was muted for %ld min", u->name, minutes);
  else snprintf(line, sizeof(line), "%s can talk again", u->name);
  chatSystemMessage(line);
  logEvent("%s: %s", r.user->name, line);
  sendOk(r);
}

static void apiClear(Req &r) {
  g_count = 0;
  g_head = 0;
  if (userFsOk()) userFs().remove(LOG_PATH);
  char line[64];
  snprintf(line, sizeof(line), "%s swept the chat clean", r.user->name);
  chatSystemMessage(line);
  logEvent("%s", line);
  sendOk(r);
}

void registerChatApi() {
  route(HTTP_POST, "/api/chat/send", R_AUTH, apiSend);
  route(HTTP_POST, "/api/chat/delete", R_AUTH, apiDelete);
  route(HTTP_POST, "/api/chat/mute", R_ADMIN, apiMute);
  route(HTTP_POST, "/api/chat/clear", R_ADMIN, apiClear);
}
