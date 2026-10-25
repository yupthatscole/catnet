// catnet — by cole (github.com/yupthatscole)
#include "auth.h"
#include "util.h"

static Session g_sessions[MAX_SESSIONS];

Session *sessionCreate(uint8_t uid, uint32_t ip) {
  Session *slot = nullptr;
  for (auto &s : g_sessions)
    if (!s.uid) {
      slot = &s;
      break;
    }
  if (!slot) {  // evict the least recently used session
    slot = &g_sessions[0];
    for (auto &s : g_sessions)
      if (s.lastSeen < slot->lastSeen) slot = &s;
  }
  memset(slot, 0, sizeof(Session));
  randomHex(slot->token, 16);
  randomHex(slot->csrf, 16);
  slot->uid = uid;
  slot->ip = ip;
  slot->created = slot->lastSeen = millis();
  return slot;
}

static bool expired(const Session &s, uint32_t now) {
  return now - s.lastSeen > SESSION_IDLE_MS || now - s.created > SESSION_MAX_MS;
}

Session *sessionFind(const char *token, uint32_t ip) {
  if (!token || strlen(token) != 32) return nullptr;
  uint32_t now = millis();
  for (auto &s : g_sessions) {
    if (!s.uid) continue;
    if (constTimeEq((const uint8_t *)s.token, (const uint8_t *)token, 32)) {
      if (expired(s, now) || s.ip != ip) return nullptr;
      s.lastSeen = now;
      return &s;
    }
  }
  return nullptr;
}

void sessionDestroy(Session *s) {
  if (s) memset(s, 0, sizeof(Session));
}

int sessionsDestroyUser(uint8_t uid, const Session *except) {
  int n = 0;
  for (auto &s : g_sessions)
    if (s.uid == uid && &s != except) {
      memset(&s, 0, sizeof(Session));
      n++;
    }
  return n;
}

int sessionsActive() {
  int n = 0;
  for (auto &s : g_sessions)
    if (s.uid) n++;
  return n;
}

int onlineUsers(uint8_t *out, int max) {
  int n = 0;
  uint32_t now = millis();
  for (auto &s : g_sessions) {
    if (!s.uid || now - s.lastSeen > ONLINE_WINDOW_MS) continue;
    bool dup = false;
    for (int i = 0; i < n; i++)
      if (out[i] == s.uid) dup = true;
    if (!dup && n < max) out[n++] = s.uid;
  }
  return n;
}

bool userOnline(uint8_t uid) {
  uint32_t now = millis();
  for (auto &s : g_sessions)
    if (s.uid == uid && now - s.lastSeen <= ONLINE_WINDOW_MS) return true;
  return false;
}

void sessionsTick() {
  uint32_t now = millis();
  for (auto &s : g_sessions)
    if (s.uid && expired(s, now)) memset(&s, 0, sizeof(Session));
}

struct IpRecord {
  uint32_t ip;
  uint8_t fails;
  uint32_t lockUntil;  // millis
  uint32_t lastTouch;
  uint8_t registrations;
  uint32_t regWindow;
  uint16_t reqCount;
  uint32_t reqSecond;
};
static IpRecord g_ips[16];
static uint32_t g_failTotal = 0;

static IpRecord &ipRec(uint32_t ip) {
  IpRecord *oldest = &g_ips[0];
  for (auto &r : g_ips) {
    if (r.ip == ip) {
      r.lastTouch = millis();
      return r;
    }
    if (r.lastTouch < oldest->lastTouch) oldest = &r;
  }
  memset(oldest, 0, sizeof(IpRecord));
  oldest->ip = ip;
  oldest->lastTouch = millis();
  return *oldest;
}

bool loginAllowed(uint32_t ip, uint32_t *waitMs) {
  IpRecord &r = ipRec(ip);
  uint32_t now = millis();
  if (r.lockUntil && (int32_t)(r.lockUntil - now) > 0) {
    if (waitMs) *waitMs = r.lockUntil - now;
    return false;
  }
  return true;
}

void loginFailed(uint32_t ip) {
  IpRecord &r = ipRec(ip);
  g_failTotal++;
  if (r.fails < 250) r.fails++;
  if (r.fails >= LOGIN_FREE_FAILS) {
    uint32_t lock = LOGIN_LOCK_BASE_MS;
    for (int i = LOGIN_FREE_FAILS; i < r.fails && lock < LOGIN_LOCK_MAX_MS; i++) lock *= 2;
    if (lock > LOGIN_LOCK_MAX_MS) lock = LOGIN_LOCK_MAX_MS;
    r.lockUntil = millis() + lock;
  }
}

void loginSucceeded(uint32_t ip) {
  IpRecord &r = ipRec(ip);
  r.fails = 0;
  r.lockUntil = 0;
}

uint32_t loginFailuresTotal() { return g_failTotal; }

bool registerAllowed(uint32_t ip) {
  IpRecord &r = ipRec(ip);
  if (millis() - r.regWindow > 3600000UL) {
    r.regWindow = millis();
    r.registrations = 0;
  }
  return r.registrations < REGISTER_PER_IP_PER_HOUR;
}

void registerDone(uint32_t ip) {
  IpRecord &r = ipRec(ip);
  if (r.registrations < 255) r.registrations++;
}

bool floodAllow(uint32_t ip) {
  IpRecord &r = ipRec(ip);
  uint32_t sec = millis() / 1000;
  if (r.reqSecond != sec) {
    r.reqSecond = sec;
    r.reqCount = 0;
  }
  return ++r.reqCount <= REQ_PER_SEC_PER_IP;
}
