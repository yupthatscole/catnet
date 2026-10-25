// catnet — by cole (github.com/yupthatscole)
#include <algorithm>
#include "config.h"
#include "storage.h"
#include "system.h"
#include "web.h"

static const char *GAMES[] = {"denied", "signal", "nine"};

static bool validGame(const String &g) {
  for (auto *x : GAMES)
    if (g == x) return true;
  return false;
}

static String notesDir(uint8_t uid) { return String("/n/") + uid; }

static void apiNotes(Req &r) {
  Json j(1024);
  j.obj().key("notes").arr();
  File d = userFs().open(notesDir(r.user->id).c_str());
  if (d && d.isDirectory()) {
    std::vector<String> c;
    for (File f = d.openNextFile(); f; f = d.openNextFile()) {
      String n = f.name();
      if (!f.isDirectory() && n.endsWith(".txt")) {
        String head = f.readStringUntil('\n');
        tsvSplit(head, c);
        j.obj().kn("id", n.toInt()).kv("title", c.size() > 0 ? c[0] : String("untitled"));
        j.kb("pin", c.size() > 1 && c[1] == "1");
        j.kn("t", c.size() > 2 ? atoll(c[2].c_str()) : 0).kn("s", f.size());
        char prev[90];
        size_t got = f.readBytes(prev, sizeof(prev) - 1);
        prev[got] = 0;
        j.kv("pv", cleanText(String(prev), 80, false)).end();
      }
      f.close();
    }
  }
  if (d) d.close();
  j.end().end();
  sendJson(r, j);
}

static String notePath(uint8_t uid, long id) { return notesDir(uid) + "/" + id + ".txt"; }

static void apiNoteGet(Req &r) {
  long id = r.argInt("id", 0);
  if (id <= 0) return sendError(r, 400, "bad note id");
  String raw = readSmallFile(userFs(), notePath(r.user->id, id).c_str(), NOTE_BODY_MAX + 256);
  if (raw.isEmpty()) return sendError(r, 404, "note not found");
  int nl = raw.indexOf('\n');
  std::vector<String> c;
  tsvSplit(nl < 0 ? raw : raw.substring(0, nl), c);
  Json j(raw.length() + 128);
  j.obj().kn("id", id).kv("title", c.size() > 0 ? c[0] : String("untitled"));
  j.kb("pin", c.size() > 1 && c[1] == "1").kn("t", c.size() > 2 ? atoll(c[2].c_str()) : 0);
  j.kv("body", nl < 0 ? String() : raw.substring(nl + 1)).end();
  sendJson(r, j);
}

static void apiNoteSave(Req &r) {
  long id = r.argInt("id", 0);
  String title = cleanText(r.arg("title"), NOTE_TITLE_MAX, false);
  if (title.isEmpty()) title = "untitled";
  String body = r.arg("body");
  if (body.length() > NOTE_BODY_MAX * 2) return sendError(r, 413, "note is too long");
  body = cleanText(body, NOTE_BODY_MAX, true);
  String dir = notesDir(r.user->id);
  if (id <= 0) {
    int count = 0;
    long maxId = 0;
    File d = userFs().open(dir.c_str());
    if (d && d.isDirectory()) {
      for (File f = d.openNextFile(); f; f = d.openNextFile()) {
        long n = String(f.name()).toInt();
        if (n > maxId) maxId = n;
        count++;
        f.close();
      }
    }
    if (d) d.close();
    if (count >= NOTES_PER_USER) return sendError(r, 409, "note limit reached, delete an old one");
    id = maxId + 1;
  } else if (!userFs().exists(notePath(r.user->id, id).c_str())) {
    return sendError(r, 404, "note not found");
  }
  String data = tsvEscape(title) + "\t" + (r.arg("pin") == "1" ? "1" : "0") + "\t" + nowEpoch() + "\n" + body;
  if (!writeFileAtomic(userFs(), notePath(r.user->id, id).c_str(), data))
    return sendError(r, 507, "could not save (storage full?)");
  Json j(48);
  j.obj().kb("ok", true).kn("id", id).kn("t", nowEpoch()).end();
  sendJson(r, j);
}

static void apiNoteDelete(Req &r) {
  long id = r.argInt("id", 0);
  if (id <= 0 || !userFs().remove(notePath(r.user->id, id).c_str()))
    return sendError(r, 404, "note not found");
  sendOk(r);
}

struct Post {
  uint16_t id;
  uint8_t uid;
  bool pinned;
  uint8_t replies;
  uint32_t ts;
  uint32_t last;
  char author[USERNAME_MAX + 1];
  char title[BOARD_TITLE_MAX + 1];
};
static std::vector<Post> g_posts;
static uint16_t g_nextPost = 1;

static String postPath(uint16_t id) { return String("/b/") + id + ".tsv"; }

static Post *findPost(uint16_t id) {
  for (auto &p : g_posts)
    if (p.id == id) return &p;
  return nullptr;
}

static bool indexPost(uint16_t id) {
  File f = userFs().open(postPath(id).c_str(), "r");
  if (!f) return false;
  std::vector<String> c;
  String head = f.readStringUntil('\n');
  tsvSplit(head, c);
  if (c.size() < 6) {
    f.close();
    return false;
  }
  Post p = {};
  p.id = id;
  p.uid = c[0].toInt();
  strncpy(p.author, c[1].c_str(), USERNAME_MAX);
  p.ts = p.last = strtoul(c[2].c_str(), nullptr, 10);
  p.pinned = c[3] == "1";
  strncpy(p.title, c[4].c_str(), BOARD_TITLE_MAX);
  while (f.available()) {
    String line = f.readStringUntil('\n');
    if (!line.length()) continue;
    tsvSplit(line, c);
    if (c.size() >= 4) {
      p.replies++;
      uint32_t t = strtoul(c[2].c_str(), nullptr, 10);
      if (t > p.last) p.last = t;
    }
  }
  f.close();
  Post *old = findPost(id);
  if (old) *old = p;
  else g_posts.push_back(p);
  return true;
}

void boardBegin() {
  g_posts.clear();
  File d = userFs().open("/b");
  if (d && d.isDirectory()) {
    std::vector<uint16_t> ids;
    for (File f = d.openNextFile(); f; f = d.openNextFile()) {
      long id = String(f.name()).toInt();
      if (id > 0 && id < 65535) ids.push_back(id);
      f.close();
    }
    d.close();
    for (auto id : ids) {
      indexPost(id);
      if (id >= g_nextPost) g_nextPost = id + 1;
    }
  }
  Serial.printf("[board] %u posts\n", (unsigned)g_posts.size());
}

static void apiBoard(Req &r) {
  std::vector<Post *> list;
  for (auto &p : g_posts) list.push_back(&p);
  std::sort(list.begin(), list.end(), [](Post *a, Post *b) {
    if (a->pinned != b->pinned) return a->pinned;
    if (a->last != b->last) return a->last > b->last;
    return a->id > b->id;
  });
  Json j(2048);
  j.obj().key("posts").arr();
  for (auto *p : list) {
    User *u = userById(p->uid);
    j.obj().kn("id", p->id).kv("title", p->title).kv("by", p->author);
    j.kv("c", u ? u->color : "#a397b8").kn("a", u ? u->avatar : 0);
    j.kn("t", p->ts).kn("last", p->last).kn("n", p->replies).kb("pin", p->pinned).end();
  }
  j.end().end();
  sendJson(r, j);
}

static void apiBoardGet(Req &r) {
  uint16_t id = r.argInt("id", 0);
  Post *p = findPost(id);
  if (!p) return sendError(r, 404, "that post is gone");
  File f = userFs().open(postPath(id).c_str(), "r");
  if (!f) return sendError(r, 404, "that post is gone");
  std::vector<String> c;
  tsvSplit(f.readStringUntil('\n'), c);
  Json j(f.size() + 512);
  User *au = userById(p->uid);
  j.obj().kn("id", id).kn("uid", p->uid).kv("by", p->author).kv("c", au ? au->color : "#a397b8");
  j.kn("a", au ? au->avatar : 0).kn("t", p->ts).kb("pin", p->pinned).kv("title", p->title);
  j.kv("body", c.size() > 5 ? c[5] : String());
  j.key("replies").arr();
  int idx = 0;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    if (!line.length()) continue;
    tsvSplit(line, c);
    if (c.size() < 4) continue;
    User *u = userById(c[0].toInt());
    j.obj().kn("i", idx++).kn("uid", c[0].toInt()).kv("by", c[1]).kv("c", u ? u->color : "#a397b8");
    j.kn("a", u ? u->avatar : 0).kn("t", atoll(c[2].c_str())).kv("body", c[3]).end();
  }
  f.close();
  j.end().end();
  sendJson(r, j);
}

static void apiBoardPost(Req &r) {
  String title = cleanText(r.arg("title"), BOARD_TITLE_MAX, false);
  String body = cleanText(r.arg("body"), BOARD_BODY_MAX, true);
  if (title.isEmpty()) return sendError(r, 400, "posts need a title");
  if (g_posts.size() >= BOARD_MAX_POSTS) {
    Post *oldest = nullptr;
    for (auto &p : g_posts)
      if (!p.pinned && (!oldest || p.last < oldest->last)) oldest = &p;
    if (!oldest) return sendError(r, 507, "the board is full of pinned posts");
    userFs().remove(postPath(oldest->id).c_str());
    g_posts.erase(g_posts.begin() + (oldest - &g_posts[0]));
  }
  uint16_t id = g_nextPost++;
  String line = String(r.user->id) + "\t" + r.user->name + "\t" + nowEpoch() + "\t0\t" +
                tsvEscape(title) + "\t" + tsvEscape(body) + "\n";
  if (!writeFileAtomic(userFs(), postPath(id).c_str(), line))
    return sendError(r, 507, "could not save (storage full?)");
  indexPost(id);
  if (r.user->sPosts < 65535) r.user->sPosts++;
  usersMarkDirty();
  Json j(32);
  j.obj().kb("ok", true).kn("id", id).end();
  sendJson(r, j);
}

static void apiBoardReply(Req &r) {
  uint16_t id = r.argInt("id", 0);
  Post *p = findPost(id);
  if (!p) return sendError(r, 404, "that post is gone");
  if (p->replies >= BOARD_MAX_REPLIES) return sendError(r, 409, "this thread is full");
  String body = cleanText(r.arg("body"), BOARD_REPLY_MAX, true);
  if (body.isEmpty()) return sendError(r, 400, "empty reply");
  String line = String(r.user->id) + "\t" + r.user->name + "\t" + nowEpoch() + "\t" + tsvEscape(body);
  if (!appendLine(userFs(), postPath(id).c_str(), line))
    return sendError(r, 507, "could not save (storage full?)");
  p->replies++;
  p->last = nowEpoch() ? nowEpoch() : p->last;
  if (r.user->sPosts < 65535) r.user->sPosts++;
  usersMarkDirty();
  sendOk(r);
}

static bool rewritePost(uint16_t id, int dropReply, int pinState) {
  String raw = readSmallFile(userFs(), postPath(id).c_str(), 32768);
  if (raw.isEmpty()) return false;
  String out;
  out.reserve(raw.length());
  int start = 0, lineNo = 0;
  std::vector<String> c;
  while (start < (int)raw.length()) {
    int nl = raw.indexOf('\n', start);
    if (nl < 0) nl = raw.length();
    String line = raw.substring(start, nl);
    start = nl + 1;
    if (!line.length()) continue;
    if (lineNo == 0 && pinState >= 0) {
      tsvSplit(line, c);
      if (c.size() >= 6) {
        c[3] = pinState ? "1" : "0";
        line = "";
        for (size_t i = 0; i < c.size(); i++) line += (i ? "\t" : "") + tsvEscape(c[i]);
      }
    }
    if (lineNo - 1 != dropReply || lineNo == 0) out += line + "\n";
    lineNo++;
  }
  return writeFileAtomic(userFs(), postPath(id).c_str(), out);
}

static void apiBoardDelete(Req &r) {
  uint16_t id = r.argInt("id", 0);
  Post *p = findPost(id);
  if (!p) return sendError(r, 404, "that post is gone");
  if (p->uid != r.user->id && !r.isAdmin()) return sendError(r, 403, "not your post");
  userFs().remove(postPath(id).c_str());
  if (p->uid != r.user->id) logEvent("%s removed board post by %s", r.user->name, p->author);
  g_posts.erase(g_posts.begin() + (p - &g_posts[0]));
  sendOk(r);
}

static void apiBoardDelReply(Req &r) {
  uint16_t id = r.argInt("id", 0);
  long idx = r.argInt("i", -1);
  Post *p = findPost(id);
  if (!p || idx < 0) return sendError(r, 404, "reply not found");
  File f = userFs().open(postPath(id).c_str(), "r");
  if (!f) return sendError(r, 404, "reply not found");
  f.readStringUntil('\n');
  int n = 0, owner = -1;
  std::vector<String> c;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    if (!line.length()) continue;
    if (n++ == idx) {
      tsvSplit(line, c);
      owner = c[0].toInt();
      break;
    }
  }
  f.close();
  if (owner < 0) return sendError(r, 404, "reply not found");
  if (owner != r.user->id && !r.isAdmin()) return sendError(r, 403, "not your reply");
  if (!rewritePost(id, idx, -1)) return sendError(r, 500, "could not save");
  indexPost(id);
  sendOk(r);
}

static void apiBoardPin(Req &r) {
  uint16_t id = r.argInt("id", 0);
  if (!findPost(id)) return sendError(r, 404, "that post is gone");
  if (!rewritePost(id, -1, r.arg("pin") == "1" ? 1 : 0)) return sendError(r, 500, "could not save");
  indexPost(id);
  sendOk(r);
}

struct Ann {
  uint32_t id, ts;
  uint8_t level;  // 0 info, 1 important
  String author, text;
};
static std::vector<Ann> g_ann;
static uint32_t g_annNext = 1;
static bool g_annLoaded = false;

static void annLoad() {
  if (g_annLoaded) return;
  g_annLoaded = true;
  File f = userFs().open("/sys/ann.tsv", "r");
  if (!f) return;
  std::vector<String> c;
  while (f.available()) {
    tsvSplit(f.readStringUntil('\n'), c);
    if (c.size() < 5) continue;
    Ann a{(uint32_t)c[0].toInt(), strtoul(c[1].c_str(), nullptr, 10), (uint8_t)c[2].toInt(), c[3], c[4]};
    if (a.id >= g_annNext) g_annNext = a.id + 1;
    g_ann.push_back(a);
  }
  f.close();
}

static bool annSave() {
  String out;
  for (auto &a : g_ann)
    out += String(a.id) + "\t" + a.ts + "\t" + a.level + "\t" + a.author + "\t" + tsvEscape(a.text) + "\n";
  return writeFileAtomic(userFs(), "/sys/ann.tsv", out);
}

uint32_t announceLatestId() {
  annLoad();
  return g_ann.empty() ? 0 : g_ann.back().id;
}

static void apiAnn(Req &r) {
  annLoad();
  Json j(512);
  j.obj().key("items").arr();
  for (int i = g_ann.size() - 1; i >= 0; i--) {
    Ann &a = g_ann[i];
    j.obj().kn("id", a.id).kn("t", a.ts).kn("lv", a.level).kv("by", a.author).kv("text", a.text).end();
  }
  j.end().end();
  sendJson(r, j);
}

static void apiAnnAdd(Req &r) {
  annLoad();
  String text = cleanText(r.arg("text"), ANNOUNCE_TEXT_MAX, false);
  if (text.isEmpty()) return sendError(r, 400, "announcement is empty");
  if (g_ann.size() >= ANNOUNCE_MAX) g_ann.erase(g_ann.begin());
  g_ann.push_back({g_annNext++, nowEpoch(), (uint8_t)(r.arg("lv") == "1"), r.user->name, text});
  if (!annSave()) return sendError(r, 507, "could not save");
  sendOk(r);
}

static void apiAnnDel(Req &r) {
  annLoad();
  uint32_t id = r.argInt("id", 0);
  for (size_t i = 0; i < g_ann.size(); i++) {
    if (g_ann[i].id == id) {
      g_ann.erase(g_ann.begin() + i);
      annSave();
      return sendOk(r);
    }
  }
  sendError(r, 404, "not found");
}

static void apiSaveGet(Req &r) {
  String g = r.arg("g");
  if (!validGame(g)) return sendError(r, 400, "unknown game");
  String path = String("/s/") + r.user->id + "/" + g + ".json";
  String raw = readSmallFile(userFs(), path.c_str(), SAVE_MAX_BYTES);
  Json j(raw.length() + 48);
  j.obj().kv("g", g).key("d");
  if (raw.length() && jsonValid(raw.c_str(), raw.length())) j.raw(raw.c_str());
  else j.null();
  j.end();
  sendJson(r, j);
}

static void apiSavePut(Req &r) {
  String g = r.arg("g");
  if (!validGame(g)) return sendError(r, 400, "unknown game");
  String d = r.arg("d");
  if (d.length() > SAVE_MAX_BYTES) return sendError(r, 413, "save is too big");
  if (!jsonValid(d.c_str(), d.length())) return sendError(r, 400, "save is not valid JSON");
  String path = String("/s/") + r.user->id + "/" + g + ".json";
  if (!writeFileAtomic(userFs(), path.c_str(), d)) return sendError(r, 507, "could not save");
  sendOk(r);
}

struct Score {
  String game, name, note;
  uint8_t uid;
  long score;
  uint32_t ts;
};

static std::vector<Score> loadScores() {
  std::vector<Score> out;
  File f = userFs().open("/sys/scores.tsv", "r");
  if (!f) return out;
  std::vector<String> c;
  while (f.available()) {
    tsvSplit(f.readStringUntil('\n'), c);
    if (c.size() < 6 || !validGame(c[0])) continue;
    out.push_back({c[0], c[2], c[5], (uint8_t)c[1].toInt(), c[3].toInt(), strtoul(c[4].c_str(), nullptr, 10)});
  }
  f.close();
  return out;
}

static void scoresJson(Json &j, std::vector<Score> &all, const char *game, int top, uint8_t me) {
  std::vector<Score *> list;
  for (auto &s : all)
    if (s.game == game) list.push_back(&s);
  std::sort(list.begin(), list.end(), [](Score *a, Score *b) { return a->score > b->score; });
  j.key(game).obj().key("top").arr();
  for (int i = 0; i < (int)list.size() && i < top; i++) {
    User *u = userById(list[i]->uid);
    j.obj().kv("n", list[i]->name).kv("c", u ? u->color : "#a397b8").kn("s", list[i]->score);
    j.kn("t", list[i]->ts).kv("x", list[i]->note).end();
  }
  j.end();
  for (int i = 0; i < (int)list.size(); i++)
    if (list[i]->uid == me) {
      j.kn("mine", list[i]->score).kn("rank", i + 1);
      break;
    }
  j.end();
}

static void apiScores(Req &r) {
  auto all = loadScores();
  String g = r.arg("g");
  Json j(1500);
  j.obj();
  if (g.length()) {
    if (!validGame(g)) return sendError(r, 400, "unknown game");
    scoresJson(j, all, g.c_str(), SCORES_PER_GAME, r.user->id);
  } else {
    for (auto *x : GAMES) scoresJson(j, all, x, 5, r.user->id);
  }
  j.end();
  sendJson(r, j);
}

static void apiScorePost(Req &r) {
  String g = r.arg("g");
  if (!validGame(g)) return sendError(r, 400, "unknown game");
  long s = r.argInt("s", -1);
  if (s < 0 || s > 10000000) return sendError(r, 400, "bad score");
  String note = cleanText(r.arg("x"), 40, false);
  auto all = loadScores();
  bool improved = true;
  bool found = false;
  for (auto &x : all) {
    if (x.game == g && x.uid == r.user->id) {
      found = true;
      improved = s > x.score;
      if (improved) {
        x.score = s;
        x.ts = nowEpoch();
        x.note = note;
        x.name = r.user->name;
      }
    }
  }
  if (!found) all.push_back({g, r.user->name, note, r.user->id, s, nowEpoch()});
  if (r.user->sGames < 65535) r.user->sGames++;
  usersMarkDirty();
  if (improved) {
    String out;
    for (auto &x : all)
      out += x.game + "\t" + x.uid + "\t" + x.name + "\t" + x.score + "\t" + x.ts + "\t" + tsvEscape(x.note) + "\n";
    if (!writeFileAtomic(userFs(), "/sys/scores.tsv", out)) return sendError(r, 507, "could not save");
  }
  Json j(600);
  j.obj().kb("ok", true).kb("best", improved);
  scoresJson(j, all, g.c_str(), SCORES_PER_GAME, r.user->id);
  j.end();
  sendJson(r, j);
}

void removeUserContent(uint8_t uid) {
  Volume &v = filesVolume();
  removeTree(*v.fs, (String(v.pubRoot) + "/" + uid).c_str());
  removeTree(*v.fs, (String(v.privRoot) + "/" + uid).c_str());
  removeTree(userFs(), notesDir(uid).c_str());
  removeTree(userFs(), (String("/s/") + uid).c_str());
}

void registerContentApi() {
  route(HTTP_GET, "/api/notes", R_AUTH, apiNotes);
  route(HTTP_GET, "/api/notes/get", R_AUTH, apiNoteGet);
  route(HTTP_POST, "/api/notes/save", R_AUTH, apiNoteSave);
  route(HTTP_POST, "/api/notes/delete", R_AUTH, apiNoteDelete);
  route(HTTP_GET, "/api/board", R_AUTH, apiBoard);
  route(HTTP_GET, "/api/board/get", R_AUTH, apiBoardGet);
  route(HTTP_POST, "/api/board/post", R_AUTH, apiBoardPost);
  route(HTTP_POST, "/api/board/reply", R_AUTH, apiBoardReply);
  route(HTTP_POST, "/api/board/delete", R_AUTH, apiBoardDelete);
  route(HTTP_POST, "/api/board/delreply", R_AUTH, apiBoardDelReply);
  route(HTTP_POST, "/api/board/pin", R_ADMIN, apiBoardPin);
  route(HTTP_GET, "/api/announce", R_AUTH, apiAnn);
  route(HTTP_POST, "/api/announce/add", R_ADMIN, apiAnnAdd);
  route(HTTP_POST, "/api/announce/delete", R_ADMIN, apiAnnDel);
  route(HTTP_GET, "/api/save", R_AUTH, apiSaveGet);
  route(HTTP_POST, "/api/save", R_AUTH, apiSavePut);
  route(HTTP_GET, "/api/scores", R_AUTH, apiScores);
  route(HTTP_POST, "/api/scores", R_AUTH, apiScorePost);
}
