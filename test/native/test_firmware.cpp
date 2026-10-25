// catnet — by cole (github.com/yupthatscole)
#include <cstdio>
#include <vector>
#include "Arduino.h"
#include "../../src/util.h"
#include "../../src/auth.h"
#include "../../src/config.h"

uint32_t g_fake_millis = 1000;
long g_fake_clock = 0;

static int g_fail = 0, g_pass = 0;
#define CHECK(cond)                                                           \
  do {                                                                        \
    if (cond) g_pass++;                                                       \
    else { g_fail++; printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); } \
  } while (0)
#define EQ(a, b) CHECK(String(a) == String(b))

static void testJson() {
  Json j;
  j.obj().kv("name", "tuft").kn("lives", 9).kb("cat", true).key("list").arr().num(1).num(2).obj().kv("x", "y").end().end().key("nil").null().end();
  EQ(j.s, "{\"name\":\"tuft\",\"lives\":9,\"cat\":true,\"list\":[1,2,{\"x\":\"y\"}],\"nil\":null}");
  Json k;
  k.obj().kv("evil", "</script><b>\"\\\n\x01&").end();
  EQ(k.s, "{\"evil\":\"\\u003c/script\\u003e\\u003cb\\u003e\\\"\\\\\\n\\u0001\\u0026\"}");
  CHECK(jsonValid(j.s.c_str(), j.s.length()));
  CHECK(jsonValid(k.s.c_str(), k.s.length()));
  Json e;
  e.obj().end();
  EQ(e.s, "{}");
}

static void testJsonValid() {
  const char *good[] = {"{}", "[]", "null", "0", "-1.5e3", "\"a\\u00e9\"", "{\"a\":[1,{\"b\":false}],\"c\":\"\"}", " [ 1 , 2 ] "};
  const char *bad[] = {"", "{", "[1,]", "{\"a\":}", "01", "nul", "\"unterminated", "{\"a\" 1}", "[1] 2", "\"\x01\"", "{a:1}", "1.", "[\"\\x\"]"};
  for (auto g : good) CHECK(jsonValid(g, strlen(g)));
  for (auto b : bad) {
    bool v = jsonValid(b, strlen(b));
    if (v) printf("  (accepted bad json: %s)\n", b);
    CHECK(!v);
  }
  std::string deep(40, '[');
  deep += std::string(40, ']');
  CHECK(!jsonValid(deep.c_str(), deep.size(), 16));  // depth limit
}

static void testForm() {
  Form f;
  const char *body = "user=t%C3%BCft&pass=a+b%26c&empty=&flag&x=%zz";
  f.parse(body, strlen(body));
  EQ(f.get("user"), "t\xC3\xBC" "ft");
  EQ(f.get("pass"), "a b&c");
  CHECK(f.has("empty") && f.get("empty").isEmpty());
  CHECK(f.has("flag"));
  EQ(f.get("x"), "%zz");
  CHECK(!f.has("nope"));
  CHECK(f.getInt("nope", 7) == 7);
  Form g;
  g.parse("n=42&m=abc", 10);
  CHECK(g.getInt("n", 0) == 42);
  CHECK(g.getInt("m", -1) == -1);
}

static void testCleanText() {
  EQ(cleanText("  hello  ", 100, false), "hello");
  EQ(cleanText("a\nb\tc\rd", 100, false), "a b cd");
  EQ(cleanText("a\n\n\n\n\nb", 100, true), "a\n\nb");
  EQ(cleanText(String("bad\xFF\xFEutf"), 100, false), "bad??utf");
  EQ(cleanText(String("x\xE2\x80\xAEy"), 100, false), "xy");          // bidi override removed
  EQ(cleanText(String("ctl\x01\x07\x7F!"), 100, false), "ctl!");
  String s = cleanText(String("aa\xC3\xA9\xC3\xA9"), 5, false);  // "aaéé" is 6 bytes
  EQ(s, "aa\xC3\xA9");
  EQ(cleanText(String("\xF0\x9F\x90\xB1 cat"), 100, false), "\xF0\x9F\x90\xB1 cat");
  EQ(cleanText(String("\xC0\xAF"), 100, false), "??");  // overlong encodings rejected
}

static void testNames() {
  CHECK(validUserName("tuft"));
  CHECK(validUserName("a_b-c9"));
  CHECK(!validUserName("ab"));
  CHECK(!validUserName("Tuft"));
  CHECK(!validUserName("-tuft"));
  CHECK(!validUserName("_tuft"));
  CHECK(!validUserName("tu ft"));
  CHECK(!validUserName("abcdefghijklmnopq"));
  CHECK(!validUserName("t\xC3\xBC" "ft"));
  EQ(lowerAscii("TuFt"), "tuft");
}

static void testFileNames() {
  EQ(safeFileName("photo.png"), "photo.png");
  EQ(safeFileName("../../etc/passwd.txt"), "passwd.txt");
  EQ(safeFileName("..\\..\\boot.ini"), "boot.ini");
  EQ(safeFileName("/abs/path/x.html"), "x.html");
  EQ(safeFileName(".htaccess"), "");
  EQ(safeFileName("noext"), "");
  EQ(safeFileName("a..b.png"), "a.b.png");
  EQ(safeFileName("..png"), "");
  EQ(safeFileName("weird<>:\"|?*name.txt"), "weird_name.txt");
  EQ(safeFileName("caf\xC3\xA9.jpg"), "caf_.jpg");
  EQ(safeFileName("trailing.png. . "), "trailing.png");
  EQ(safeFileName("x.toolongext"), "");
  String longName = safeFileName("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpeg");
  CHECK(longName.length() <= FILE_NAME_MAX);
  CHECK(longName.endsWith(".jpeg"));
  const char *samples[] = {"photo.png", "a b (2).txt", "x-y_z.json"};
  for (auto n : samples) EQ(safeFileName(safeFileName(n)), safeFileName(n));
  CHECK(extIs("A.PNG", "png"));
  CHECK(!extIs("a.png.exe", "png"));
}

static void testTsv() {
  String nasty = "tab\there\nnew\\line\\t";
  String esc = tsvEscape(nasty);
  CHECK(esc.indexOf('\t') < 0 && esc.indexOf('\n') < 0);
  std::vector<String> out;
  tsvSplit(String("a\t") + esc + "\t\tz", out);
  CHECK(out.size() == 4);
  EQ(out[0], "a");
  EQ(out[1], nasty);
  EQ(out[2], "");
  EQ(out[3], "z");
}

static void testHex() {
  uint8_t in[4] = {0x00, 0xab, 0x10, 0xff}, back[4];
  char hex[9];
  toHex(in, 4, hex);
  EQ(hex, "00ab10ff");
  CHECK(fromHex(hex, back, 4) && memcmp(in, back, 4) == 0);
  CHECK(!fromHex("zz", back, 1));
  CHECK(constTimeEq(in, back, 4));
  back[3] = 0;
  CHECK(!constTimeEq(in, back, 4));
  char r1[33], r2[33];
  randomHex(r1, 16);
  randomHex(r2, 16);
  CHECK(strlen(r1) == 32 && strcmp(r1, r2) != 0);
}

static void testClock() {
  CHECK(!clockKnown());
  CHECK(nowEpoch() == 0);
  setClock(12345);  // nonsense clocks are ignored
  CHECK(!clockKnown());
  setClock(1800000000UL);
  CHECK(clockKnown());
  CHECK(g_fake_clock == 1800000000L);
}

static void testSessions() {
  const uint32_t IP1 = 0x0104A8C0, IP2 = 0x0204A8C0;
  Session *s = sessionCreate(7, IP1);
  CHECK(s && s->uid == 7 && strlen(s->token) == 32 && strlen(s->csrf) == 32);
  CHECK(strcmp(s->token, s->csrf) != 0);
  char tok[33];
  strcpy(tok, s->token);
  CHECK(sessionFind(tok, IP1) == s);
  CHECK(sessionFind(tok, IP2) == nullptr);        // bound to the client address
  CHECK(sessionFind("short", IP1) == nullptr);
  char wrong[33];
  strcpy(wrong, tok);
  wrong[0] = wrong[0] == 'a' ? 'b' : 'a';
  CHECK(sessionFind(wrong, IP1) == nullptr);
  uint8_t ids[MAX_SESSIONS];
  CHECK(onlineUsers(ids, MAX_SESSIONS) == 1 && ids[0] == 7);
  CHECK(userOnline(7));
  g_fake_millis += SESSION_IDLE_MS + 1;
  CHECK(sessionFind(tok, IP1) == nullptr);
  sessionsTick();
  CHECK(sessionsActive() == 0);
  Session *a = sessionCreate(3, IP1);
  Session *b = sessionCreate(3, IP2);
  Session *c = sessionCreate(4, IP2);
  CHECK(sessionsDestroyUser(3, a) == 1);
  CHECK(a->uid == 3 && b->uid == 0 && c->uid == 4);
  sessionDestroy(a);
  sessionDestroy(c);
  for (int i = 0; i < MAX_SESSIONS + 5; i++) { g_fake_millis += 10; sessionCreate(9, IP1); }
  CHECK(sessionsActive() == MAX_SESSIONS);
  Session *z = sessionCreate(11, IP1);
  strcpy(tok, z->token);
  for (int i = 0; i < 30; i++) { g_fake_millis += SESSION_MAX_MS / 25; sessionFind(tok, IP1); }
  CHECK(sessionFind(tok, IP1) == nullptr);
}

static void testLockout() {
  const uint32_t IP = 0x0904A8C0;
  uint32_t wait = 0;
  for (int i = 0; i < LOGIN_FREE_FAILS - 1; i++) {
    CHECK(loginAllowed(IP, &wait));
    loginFailed(IP);
  }
  CHECK(loginAllowed(IP, &wait));
  loginFailed(IP);  // 5th failure -> locked
  CHECK(!loginAllowed(IP, &wait) && wait > 0 && wait <= LOGIN_LOCK_BASE_MS);
  g_fake_millis += LOGIN_LOCK_BASE_MS + 1;
  CHECK(loginAllowed(IP, &wait));
  loginFailed(IP);  // 6th: lock doubles
  CHECK(!loginAllowed(IP, &wait) && wait > LOGIN_LOCK_BASE_MS);
  for (int i = 0; i < 20; i++) loginFailed(IP);
  loginAllowed(IP, &wait);
  CHECK(wait <= LOGIN_LOCK_MAX_MS);
  loginSucceeded(IP);
  CHECK(loginAllowed(IP, &wait));
  CHECK(loginAllowed(IP + 1, &wait));
  const uint32_t R = 0x0A04A8C0;
  for (int i = 0; i < REGISTER_PER_IP_PER_HOUR; i++) { CHECK(registerAllowed(R)); registerDone(R); }
  CHECK(!registerAllowed(R));
  g_fake_millis += 3600001UL;
  CHECK(registerAllowed(R));
  const uint32_t F = 0x0B04A8C0;
  g_fake_millis = (g_fake_millis / 1000 + 1) * 1000;
  int allowed = 0;
  for (int i = 0; i < REQ_PER_SEC_PER_IP + 10; i++) allowed += floodAllow(F);
  CHECK(allowed == REQ_PER_SEC_PER_IP);
  g_fake_millis += 1000;
  CHECK(floodAllow(F));
}

int main() {
  srand(1);
  testJson();
  testJsonValid();
  testForm();
  testCleanText();
  testNames();
  testFileNames();
  testTsv();
  testHex();
  testClock();
  testSessions();
  testLockout();
  printf("native firmware tests: %d passed, %d failed\n", g_pass, g_fail);
  return g_fail ? 1 : 0;
}
