# catnet — by cole (github.com/yupthatscole)
"""fake catnet for working on the ui without the esp32.

  python tools/devserver.py [--port 8080] [--fresh]

serves data/ like the firmware does and fakes the same api in python.
"""
import argparse
import gzip
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import shutil
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
STATE_DIR = os.path.join(HERE, ".devstate")
FILES_DIR = os.path.join(STATE_DIR, "files")
sys.path.insert(0, HERE)

LOCK = threading.RLock()
PORTAL_KEY = "dev-key"  # dev only
CSP = ("default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; "
       "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; "
       "font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; "
       "frame-ancestors 'none'")
GAMES = ["denied", "signal", "nine"]
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,15}$")
COLORS = ["#b8a3fb", "#f49ad8", "#8fe3c4", "#ffc977", "#8fc7ff", "#ff9f8f"]
TYPES = {
    "png": ("image/png", 1), "jpg": ("image/jpeg", 1), "jpeg": ("image/jpeg", 1), "gif": ("image/gif", 1),
    "webp": ("image/webp", 1), "bmp": ("image/bmp", 1), "mp3": ("audio/mpeg", 1), "ogg": ("audio/ogg", 1),
    "wav": ("audio/wav", 1), "m4a": ("audio/mp4", 1), "mp4": ("video/mp4", 1), "webm": ("video/webm", 1),
    "pdf": ("application/pdf", 1), "txt": ("text/plain; charset=utf-8", 1), "md": ("text/plain; charset=utf-8", 1),
    "csv": ("text/plain; charset=utf-8", 1), "log": ("text/plain; charset=utf-8", 1),
    "html": ("text/html; charset=utf-8", 2), "htm": ("text/html; charset=utf-8", 2), "css": ("text/css", 2),
    "js": ("text/javascript", 2), "json": ("application/json", 2), "svg": ("image/svg+xml", 2),
    "zip": ("application/zip", 0), "gb": ("application/octet-stream", 0), "gbc": ("application/octet-stream", 0),
    "nes": ("application/octet-stream", 0),
}
MAX_FILE = 384 * 1024
QUOTA = 640 * 1024
FS_TOTAL = 0x160000

S = {}  # persisted state
SESSIONS = {}
FAILS = {}
BOOT = time.time()


def now():
    return int(time.time())


def save_state():
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = os.path.join(STATE_DIR, "state.json.t")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(S, f)
    os.replace(tmp, os.path.join(STATE_DIR, "state.json"))


def load_state(fresh):
    global S
    if fresh and os.path.isdir(STATE_DIR):
        shutil.rmtree(STATE_DIR)
    p = os.path.join(STATE_DIR, "state.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            S = json.load(f)
    S.setdefault("users", [])
    S.setdefault("next_id", 1)
    S.setdefault("chat", [])
    S.setdefault("chat_last", 0)
    S.setdefault("notes", {})
    S.setdefault("posts", [])
    S.setdefault("next_post", 1)
    S.setdefault("ann", [])
    S.setdefault("next_ann", 1)
    S.setdefault("saves", {})
    S.setdefault("scores", [])
    S.setdefault("cfg", {"ssid": "catnet", "ch": 6, "captive": True, "open": False, "lowpow": False, "motd": ""})
    os.makedirs(FILES_DIR, exist_ok=True)


def pbkdf(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 3000).hex()


def user_by_name(n):
    n = (n or "").lower()
    return next((u for u in S["users"] if u["n"] == n), None)


def user_by_id(i):
    return next((u for u in S["users"] if u["id"] == i), None)


def online_ids():
    t = time.time()
    return sorted({s["uid"] for s in SESSIONS.values() if t - s["seen"] < 45})


def user_json(u, full):
    d = {"id": u["id"], "n": u["n"], "c": u["c"], "a": u["a"], "r": u["r"], "st": u.get("st", ""),
         "on": u["id"] in online_ids()}
    if full:
        d.update({"bio": u.get("bio", ""), "since": u.get("since", 0), "seen": u.get("seen", 0),
                  "stats": u.setdefault("stats", {"logins": 0, "msgs": 0, "uploads": 0, "posts": 0, "games": 0})})
    return d


def clean(s, n, multiline=False):
    s = (s or "").replace("\r", "")
    s = "".join(ch if (ch == "\n" and multiline) or ord(ch) >= 32 else " " if ch in "\t\n" else "" for ch in s)
    s = re.sub(r"[‪-‮⁦-⁩]", "", s)
    if multiline:
        s = re.sub(r"\n{3,}", "\n\n", s)
    b = s.encode("utf-8")[:n]
    return b.decode("utf-8", "ignore").strip()


def safe_name(name):
    name = re.split(r"[\\/]", name or "")[-1]
    out = re.sub(r"[^A-Za-z0-9 ._()-]", "_", name)
    out = re.sub(r"_+", "_", out)
    out = re.sub(r"\.{2,}", ".", out).strip(" .")
    if "." not in out or out.startswith("."):
        return ""
    base, ext = out.rsplit(".", 1)
    if not 1 <= len(ext) <= 5 or not base:
        return ""
    if len(out) > 40:
        out = base[: 40 - len(ext) - 1].strip() + "." + ext
    return out


def magic_ok(name, b):
    """mirror of magicOk() in src/api_files.cpp"""
    e = name.rsplit(".", 1)[-1].lower()
    sig = {"png": (0, b"\x89PNG"), "jpg": (0, b"\xff\xd8\xff"), "jpeg": (0, b"\xff\xd8\xff"), "gif": (0, b"GIF8"),
           "bmp": (0, b"BM"), "pdf": (0, b"%PDF"), "zip": (0, b"PK")}
    if e in sig:
        off, s = sig[e]
        return b[off:off + len(s)] == s
    if e == "webp":
        return b[:4] == b"RIFF" and b[8:12] == b"WEBP"
    if e == "wav":
        return b[:4] == b"RIFF" and b[8:12] == b"WAVE"
    t = TYPES.get(e)
    if t and (t[0].startswith("text/") or t[1] == 2):
        return b"\x00" not in b
    return True


def push_chat(uid, kind, name, color, text):
    S["chat_last"] += 1
    m = {"i": S["chat_last"], "t": now(), "u": uid, "k": kind, "n": name, "c": color, "x": text}
    S["chat"].append(m)
    S["chat"] = S["chat"][-64:]
    return m


PRESENCE = {}
BUCKETS = {}


def json_ok(s):
    try:
        json.loads(s)
        return True
    except ValueError:
        return False


class Handler(BaseHTTPRequestHandler):
    server_version = "catnet-dev"

    def log_message(self, fmt, *args):
        if "--quiet" not in sys.argv:
            sys.stderr.write("%s %s\n" % (self.command, self.path))

    def ip(self):
        return self.client_address[0]

    def send_json(self, obj, code=200, cookie=None):
        body = json.dumps(obj).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026").encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def err(self, code, msg, **extra):
        self.send_json({"error": msg, **extra}, code)

    def session(self):
        c = self.headers.get("Cookie", "")
        m = re.search(r"(?:^|[ ;])cn_sid=([0-9a-f]{32})", c)
        if not m:
            return None, None
        s = SESSIONS.get(m.group(1))
        if not s or s["ip"] != self.ip() or time.time() - s["seen"] > 3 * 3600:
            return None, None
        u = user_by_id(s["uid"])
        if not u or u.get("disabled"):
            return None, None
        s["seen"] = time.time()
        return s, u

    def arg(self, k, d=""):
        v = self.form.get(k)
        if v is None:
            v = self.query.get(k)
        return d if v is None else v

    def do_GET(self):
        self.handle_any("GET")

    def do_POST(self):
        self.handle_any("POST")

    def handle_any(self, method):
        with LOCK:
            u = urllib.parse.urlsplit(self.path)
            self.route = u.path
            self.query = {k: v[0] for k, v in urllib.parse.parse_qs(u.query, keep_blank_values=True).items()}
            self.form = {}
            self.raw = b""
            if method == "POST":
                n = int(self.headers.get("Content-Length") or 0)
                ctype = self.headers.get("Content-Type", "")
                if not ctype.startswith("multipart/"):
                    if n > 24576:
                        self.rfile.read(n)
                        return self.err(413, "request too large")
                    self.raw = self.rfile.read(n)
                    if ctype.startswith("application/x-www-form-urlencoded"):
                        self.form = {k: v[0] for k, v in urllib.parse.parse_qs(self.raw.decode("utf-8", "replace"), keep_blank_values=True).items()}
            self.sess, self.user = self.session()
            if self.route.startswith("/api/"):
                return self.api(method)
            if self.route.startswith("/~"):
                return self.hosted()
            return self.static()

    def manifest(self):
        assets = {}
        with open(os.path.join(DATA, "manifest.txt"), encoding="utf-8") as f:
            f.readline()
            for line in f:
                c = line.rstrip("\n").split("\t")
                if len(c) >= 4:
                    assets[c[0]] = (c[1], c[2] == "1")
        return assets

    def static(self):
        rebuild_if_changed()
        p = self.route
        if p == "/":
            p = "/index.html"
        if "." not in p.rsplit("/", 1)[-1]:
            p += ".html"
        try:
            assets = self.manifest()
        except OSError:
            return self.err(503, "data/ missing: run python tools/build_web.py")
        if p not in assets or ".." in p:
            return self.send_asset(assets, "/404.html", 404)
        html = p.endswith(".html")
        public = p in ("/login.html", "/404.html", "/oops.html")
        if html and not public and not self.user:
            nxt = self.route
            self.send_response(302)
            self.send_header("Location", "/login" if nxt == "/" else "/login?next=" + nxt)
            self.end_headers()
            return
        if html and p == "/login.html" and self.user:
            self.send_response(302)
            self.send_header("Location", "/")
            self.end_headers()
            return
        etag = assets[p][0]
        if etag in (self.headers.get("If-None-Match") or ""):
            self.send_response(304)
            self.end_headers()
            return
        self.send_asset(assets, p, 200)

    def send_asset(self, assets, p, code):
        if p not in assets:
            self.send_response(code)
            self.end_headers()
            self.wfile.write(b"404 - the cat ate this page")
            return
        etag, gz = assets[p]
        with open(os.path.join(DATA, p.lstrip("/") + (".gz" if gz else "")), "rb") as f:
            body = f.read()
        ext = p.rsplit(".", 1)[-1]
        ctype = {"html": "text/html; charset=utf-8", "css": "text/css; charset=utf-8",
                 "js": "application/javascript; charset=utf-8", "png": "image/png", "woff": "font/woff",
                 "svg": "image/svg+xml", "json": "application/json", "txt": "text/plain"}.get(ext, "application/octet-stream")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("X-Content-Type-Options", "nosniff")
        if gz:
            self.send_header("Content-Encoding", "gzip")
        if p.endswith(".html"):
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("X-Frame-Options", "DENY")
        self.send_header("ETag", '"%s"' % etag)
        self.send_header("Cache-Control", "public, max-age=31536000, immutable" if "v" in self.query else "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def hosted(self):
        rest = self.route[2:]
        name, _, file = rest.partition("/")
        u = user_by_name(urllib.parse.unquote(name))
        if not u:
            self.send_response(404)
            self.end_headers()
            return
        file = urllib.parse.unquote(file) or "index.html"
        path = os.path.join(FILES_DIR, "pub", str(u["id"]), file)
        if safe_name(file) != file or not os.path.isfile(path):
            self.send_response(404)
            self.end_headers()
            return
        t = TYPES.get(file.rsplit(".", 1)[-1].lower(), ("application/octet-stream", 0))
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", t[0] if t[1] else "application/octet-stream")
        self.send_header("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-popups allow-modals; default-src 'self' data: blob: 'unsafe-inline'; frame-ancestors 'self'")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def api(self, method):
        routes = {
            ("GET", "/api/state"): (0, self.a_state), ("POST", "/api/login"): (0, self.a_login),
            ("POST", "/api/register"): (0, self.a_register), ("POST", "/api/logout"): (1, self.a_logout),
            ("GET", "/api/me"): (1, self.a_me), ("POST", "/api/clock"): (1, self.a_clock),
            ("GET", "/api/pulse"): (1, self.a_pulse), ("GET", "/api/users"): (1, self.a_users),
            ("GET", "/api/users/get"): (1, self.a_user_get), ("POST", "/api/profile"): (1, self.a_profile),
            ("POST", "/api/password"): (1, self.a_password), ("POST", "/api/sessions/revoke"): (1, self.a_revoke),
            ("GET", "/api/sys"): (1, self.a_sys), ("GET", "/api/admin/users"): (2, self.a_admin_users),
            ("POST", "/api/admin/user"): (2, self.a_admin_user), ("POST", "/api/admin/config"): (2, self.a_admin_config),
            ("POST", "/api/admin/portalkey"): (2, lambda: self.send_json({"ok": True})),
            ("POST", "/api/admin/restart"): (2, lambda: self.send_json({"ok": True})),
            ("POST", "/api/chat/send"): (1, self.a_chat_send), ("POST", "/api/chat/delete"): (1, self.a_chat_delete),
            ("POST", "/api/chat/mute"): (2, self.a_chat_mute), ("POST", "/api/chat/clear"): (2, self.a_chat_clear),
            ("GET", "/api/files"): (1, self.a_files), ("POST", "/api/files/upload"): (1, self.a_upload),
            ("GET", "/api/files/get"): (1, self.a_file_get), ("POST", "/api/files/delete"): (1, self.a_file_delete),
            ("POST", "/api/files/move"): (1, self.a_file_move),
            ("GET", "/api/notes"): (1, self.a_notes), ("GET", "/api/notes/get"): (1, self.a_note_get),
            ("POST", "/api/notes/save"): (1, self.a_note_save), ("POST", "/api/notes/delete"): (1, self.a_note_delete),
            ("GET", "/api/board"): (1, self.a_board), ("GET", "/api/board/get"): (1, self.a_board_get),
            ("POST", "/api/board/post"): (1, self.a_board_post), ("POST", "/api/board/reply"): (1, self.a_board_reply),
            ("POST", "/api/board/delete"): (1, self.a_board_delete), ("POST", "/api/board/delreply"): (1, self.a_board_delreply),
            ("POST", "/api/board/pin"): (2, self.a_board_pin),
            ("GET", "/api/announce"): (1, self.a_ann), ("POST", "/api/announce/add"): (2, self.a_ann_add),
            ("POST", "/api/announce/delete"): (2, self.a_ann_del),
            ("GET", "/api/save"): (1, self.a_save_get), ("POST", "/api/save"): (1, self.a_save_put),
            ("GET", "/api/scores"): (1, self.a_scores), ("POST", "/api/scores"): (1, self.a_score_post),
        }
        r = routes.get((method, self.route))
        if not r:
            known = any(p == self.route for (_, p) in routes)
            return self.err(405 if known else 404, "method not allowed" if known else "no such endpoint")
        level, fn = r
        if level and not self.user:
            return self.err(401, "not logged in")
        if level == 2 and self.user["r"] != "admin":
            return self.err(403, "admins only")
        if method == "POST":
            origin = self.headers.get("Origin")
            if origin and origin != "http://" + self.headers.get("Host", ""):
                return self.err(403, "cross-site request blocked")
            if level and self.sess and not hmac.compare_digest(self.headers.get("X-CSRF", ""), self.sess["csrf"]):
                return self.err(403, "bad csrf token, reload the page")
        fn()
        save_state()

    def locked(self):
        f = FAILS.get(self.ip())
        if f and f["until"] > time.time():
            return int(f["until"] - time.time()) + 1
        return 0

    def fail(self):
        f = FAILS.setdefault(self.ip(), {"n": 0, "until": 0})
        f["n"] += 1
        if f["n"] >= 5:
            f["until"] = time.time() + min(30 * 2 ** (f["n"] - 5), 900)

    def a_state(self):
        self.send_json({"setup": not S["users"], "open": S["cfg"]["open"], "motd": S["cfg"]["motd"], "ver": "1.0.0-dev",
                        "assets": True, "in": bool(self.user), "wait": self.locked()})

    def me_json(self):
        u = self.user
        return {"user": user_json(u, True), "csrf": self.sess["csrf"], "accent": u.get("accent", 0),
                "prefs": u.get("prefs", 0), "admin": u["r"] == "admin", "mustChange": bool(u.get("must")), "clock": True}

    def login_as(self, u):
        FAILS.pop(self.ip(), None)
        if self.sess:
            SESSIONS.pop(self.sess["token"], None)
        tok = secrets.token_hex(16)
        self.sess = SESSIONS[tok] = {"token": tok, "csrf": secrets.token_hex(16), "uid": u["id"], "ip": self.ip(), "seen": time.time()}
        self.user = u
        u.setdefault("stats", {"logins": 0, "msgs": 0, "uploads": 0, "posts": 0, "games": 0})["logins"] += 1
        u["seen"] = now()
        self.send_json(self.me_json(), cookie="cn_sid=%s; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400" % tok)

    def a_login(self):
        w = self.locked()
        if w:
            return self.err(429, "too many attempts", wait=w)
        u = user_by_name(self.arg("user").strip())
        if not u or pbkdf(self.arg("pass"), u["salt"]) != u["hash"]:
            self.fail()
            w = self.locked()
            if w:
                return self.err(429, "too many attempts", wait=w)
            return self.err(401, "wrong username or password")
        if u.get("disabled"):
            return self.err(403, "this account is disabled")
        self.login_as(u)

    def a_register(self):
        w = self.locked()
        if w:
            return self.err(429, "too many attempts", wait=w)
        first = not S["users"]
        if (first or not S["cfg"]["open"]) and self.arg("key") != PORTAL_KEY:
            self.fail()
            return self.err(401, "that portal key is not right")
        name = self.arg("user").lower().strip()
        pw = self.arg("pass")
        if not NAME_RE.match(name):
            return self.err(400, "names are 3-16 chars: a-z 0-9 _ -")
        if not 6 <= len(pw) <= 64:
            return self.err(400, "passwords need 6-64 characters")
        if user_by_name(name):
            return self.err(409, "that name is taken")
        salt = secrets.token_hex(16)
        u = {"id": S["next_id"], "n": name, "r": "admin" if first else "member", "salt": salt, "hash": pbkdf(pw, salt),
             "c": secrets.choice(COLORS), "a": secrets.randbelow(12), "st": "", "bio": "", "since": now(), "seen": now(),
             "accent": 0, "prefs": 0}
        S["next_id"] += 1
        S["users"].append(u)
        push_chat(0, 3, "tuft", "#b8a3fb", f"{name} joined catnet. say hi!")
        self.login_as(u)

    def a_logout(self):
        SESSIONS.pop(self.sess["token"], None)
        self.send_json({"ok": True}, cookie="cn_sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0")

    def a_me(self):
        self.send_json(self.me_json())

    def a_clock(self):
        self.send_json({"clock": True, "now": now()})

    def a_pulse(self):
        d = {"up": int(time.time() - BOOT), "sta": max(1, len(online_ids())), "clock": True,
             "ann": S["ann"][-1]["id"] if S["ann"] else 0, "on": []}
        for i in online_ids():
            u = user_by_id(i)
            if u:
                d["on"].append({"n": u["n"], "c": u["c"], "a": u["a"]})
        since = int(self.arg("c", "0") or 0)
        uid = self.user["id"]
        chat = {"last": S["chat_last"]}
        if self.arg("chat") == "1":
            p = PRESENCE.setdefault(uid, {"here": False, "poll": 0, "typing": 0})
            if not p["here"]:
                p["here"] = True
                push_chat(uid, 1, self.user["n"], self.user["c"], "")
                chat["last"] = S["chat_last"]
            p["poll"] = time.time()
            p["typing"] = time.time() if self.arg("typing") == "1" else 0
            chat["msgs"] = [m for m in S["chat"] if m["i"] > since]
            chat["here"] = []
            for k, v in PRESENCE.items():
                uu = user_by_id(k)
                if v["here"] and uu:
                    chat["here"].append({"n": uu["n"], "c": uu["c"], "a": uu["a"],
                                         "typing": bool(v["typing"] and time.time() - v["typing"] < 6 and k != uid)})
            chat["removed"] = [m["i"] for m in S["chat"] if m["k"] == 5 and m["i"] <= since]
        else:
            chat["unread"] = len([m for m in S["chat"] if m["i"] > since and m["k"] in (0, 4) and m["u"] != uid])
        for k, v in list(PRESENCE.items()):
            if v["here"] and time.time() - v["poll"] > 25:
                v["here"] = False
                uu = user_by_id(k)
                if uu:
                    push_chat(k, 2, uu["n"], uu["c"], "")
        d["chat"] = chat
        self.send_json(d)

    def a_users(self):
        self.send_json({"users": [user_json(u, False) for u in S["users"] if not u.get("disabled")]})

    def a_user_get(self):
        u = user_by_name(self.arg("n"))
        if not u:
            return self.err(404, "no such cat")
        d = os.path.join(FILES_DIR, "pub", str(u["id"]))
        files = os.listdir(d) if os.path.isdir(d) else []
        self.send_json({"user": user_json(u, True), "files": len(files), "site": "index.html" in files})

    def a_profile(self):
        u = self.user
        if "color" in self.form:
            c = self.form["color"].lower()
            if not re.match(r"^#[0-9a-f]{6}$", c):
                return self.err(400, "colour must look like #a1b2c3")
            u["c"] = c
        for k, mod in (("avatar", 12), ("accent", 6)):
            if k in self.form:
                u["a" if k == "avatar" else "accent"] = int(self.form[k] or 0) % mod
        if "prefs" in self.form:
            u["prefs"] = int(self.form["prefs"] or 0) & 15
        if "status" in self.form:
            u["st"] = clean(self.form["status"], 40)
        if "bio" in self.form:
            u["bio"] = clean(self.form["bio"], 160, True)
        self.a_me()

    def a_password(self):
        u = self.user
        if pbkdf(self.arg("old"), u["salt"]) != u["hash"]:
            self.fail()
            return self.err(401, "current password is wrong")
        pw = self.arg("new")
        if not 6 <= len(pw) <= 64:
            return self.err(400, "passwords need 6-64 characters")
        u["salt"] = secrets.token_hex(16)
        u["hash"] = pbkdf(pw, u["salt"])
        u.pop("must", None)
        for t in [t for t, s in SESSIONS.items() if s["uid"] == u["id"] and t != self.sess["token"]]:
            SESSIONS.pop(t)
        self.send_json({"ok": True})

    def a_revoke(self):
        ts = [t for t, s in SESSIONS.items() if s["uid"] == self.user["id"] and t != self.sess["token"]]
        for t in ts:
            SESSIONS.pop(t)
        self.send_json({"closed": len(ts)})

    def a_sys(self):
        used = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(FILES_DIR) for f in fs) + 40000
        d = {"ver": "1.0.0-dev", "build": "devserver", "web": {"ok": True, "id": "dev", "files": len(self.manifest())},
             "up": int(time.time() - BOOT), "boots": 1, "reset": "power on", "why": "",
             "heap": {"free": 142000, "min": 118000, "block": 98000, "total": 290000},
             "chip": {"model": "ESP32-D0WD-V3 (simulated)", "rev": 3, "cores": 2, "mhz": 160, "flash": 4194304,
                      "sketch": 1240304, "sketchMax": 1769472, "sdk": "devserver"},
             "fs": {"web": {"t": 0xD0000, "u": 300000}, "user": {"t": FS_TOTAL, "u": used}},
             "wifi": {"ssid": S["cfg"]["ssid"], "ch": S["cfg"]["ch"], "sta": len(online_ids()), "max": 8,
                      "captive": S["cfg"]["captive"], "lowpow": S["cfg"]["lowpow"], "ip": "192.168.4.1"},
             "users": len(S["users"]), "maxUsers": 24, "sessions": len(SESSIONS), "clock": True, "now": now()}
        if self.user["r"] == "admin":
            d["fails"] = sum(f["n"] for f in FAILS.values())
            d["stations"] = [{"mac": "a4:c3:f0:12:34:56", "ip": "192.168.4.2", "rssi": -48}]
            d["events"] = [{"up": 3, "t": now() - 600, "m": "catnet online (boot #1, power on)"}]
            d["cfg"] = S["cfg"]
        self.send_json(d)

    def a_admin_users(self):
        self.send_json({"users": [{"id": u["id"], "n": u["n"], "r": u["r"], "disabled": bool(u.get("disabled")),
                                   "mustChange": bool(u.get("must")), "on": u["id"] in online_ids(),
                                   "seen": u.get("seen", 0), "since": u.get("since", 0), "muted": bool(u.get("muted"))}
                                  for u in S["users"]]})

    def a_admin_user(self):
        u = user_by_id(int(self.arg("id", "0") or 0))
        if not u:
            return self.err(404, "no such user")
        act = self.arg("action")
        admins = [x for x in S["users"] if x["r"] == "admin" and not x.get("disabled")]
        last_admin = u["r"] == "admin" and len(admins) <= 1
        me = u["id"] == self.user["id"]
        if act == "promote":
            u["r"] = "admin"
        elif act == "demote":
            if last_admin:
                return self.err(409, "catnet needs at least one admin")
            u["r"] = "member"
        elif act == "disable":
            if me or last_admin:
                return self.err(409, "you can't disable yourself" if me else "catnet needs at least one admin")
            u["disabled"] = True
        elif act == "enable":
            u.pop("disabled", None)
        elif act == "reset":
            temp = secrets.token_hex(5)
            u["salt"] = secrets.token_hex(16)
            u["hash"] = pbkdf(temp, u["salt"])
            u["must"] = True
            for t in [t for t, s in SESSIONS.items() if s["uid"] == u["id"] and t != self.sess["token"]]:
                SESSIONS.pop(t)
            return self.send_json({"ok": True, "temp": temp})
        elif act == "delete":
            if me or last_admin:
                return self.err(409, "you can't delete yourself" if me else "catnet needs at least one admin")
            S["users"].remove(u)
            for sub in ("pub", "prv"):
                shutil.rmtree(os.path.join(FILES_DIR, sub, str(u["id"])), ignore_errors=True)
        else:
            return self.err(400, "unknown action")
        self.send_json({"ok": True})

    def a_admin_config(self):
        c = S["cfg"]
        restart = False
        if "ssid" in self.form:
            restart |= self.form["ssid"] != c["ssid"]
            c["ssid"] = clean(self.form["ssid"], 31) or c["ssid"]
        if self.form.get("wpass"):
            if not 8 <= len(self.form["wpass"]) <= 63:
                return self.err(400, "wi-fi password: 8-63 characters")
            restart = True
        for k in ("captive", "open", "lowpow"):
            if k in self.form:
                v = self.form[k] == "1"
                restart |= k != "open" and v != c[k]
                c[k] = v
        if "ch" in self.form:
            c["ch"] = int(self.form["ch"])
        if "motd" in self.form:
            c["motd"] = clean(self.form["motd"], 120)
        self.send_json({"ok": True, "wifiRestart": restart})

    def a_chat_send(self):
        u = self.user
        if u.get("muted", 0) > time.time():
            return self.err(403, "you are muted for a bit", wait=int(u["muted"] - time.time()))
        b = BUCKETS.setdefault(u["id"], [5.0, time.time()])
        b[0] = min(5.0, b[0] + (time.time() - b[1]) / 1.5)
        b[1] = time.time()
        if b[0] < 1:
            return self.err(429, "slow down a little")
        b[0] -= 1
        text = clean(self.arg("text"), 280)
        if not text:
            return self.err(400, "empty message")
        kind = 0
        if text.startswith("/me "):
            kind, text = 4, text[4:].strip()
        m = push_chat(u["id"], kind, u["n"], u["c"], text)
        u["stats"]["msgs"] += 1
        self.send_json({"ok": True, "msg": m})

    def a_chat_delete(self):
        m = next((m for m in S["chat"] if m["i"] == int(self.arg("id", "0") or 0)), None)
        if not m:
            return self.err(404, "message is gone already")
        own = m["u"] == self.user["id"] and m["k"] in (0, 4)
        if not own and self.user["r"] != "admin":
            return self.err(403, "you can only delete your own messages")
        m["k"], m["x"] = 5, ""
        self.send_json({"ok": True})

    def a_chat_mute(self):
        u = user_by_id(int(self.arg("id", "0") or 0))
        if not u:
            return self.err(404, "no such user")
        mins = int(self.arg("min", "10") or 10)
        u["muted"] = time.time() + mins * 60 if mins else 0
        push_chat(0, 3, "tuft", "#b8a3fb", f"{u['n']} was muted for {mins} min" if mins else f"{u['n']} can talk again")
        self.send_json({"ok": True})

    def a_chat_clear(self):
        S["chat"] = []
        push_chat(0, 3, "tuft", "#b8a3fb", f"{self.user['n']} swept the chat clean")
        self.send_json({"ok": True})

    def fdir(self, uid, priv):
        return os.path.join(FILES_DIR, "prv" if priv else "pub", str(uid))

    def usage(self, uid):
        tot, n = 0, 0
        for priv in (False, True):
            d = self.fdir(uid, priv)
            if os.path.isdir(d):
                for f in os.listdir(d):
                    tot += os.path.getsize(os.path.join(d, f))
                    n += 1
        return tot, n

    def a_files(self):
        used, n = self.usage(self.user["id"])
        allu = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(FILES_DIR) for f in fs) + 40000
        files = []
        for u in S["users"]:
            for priv in (False, True):
                if priv and u["id"] != self.user["id"] and self.user["r"] != "admin":
                    continue
                d = self.fdir(u["id"], priv)
                if os.path.isdir(d):
                    for f in os.listdir(d):
                        st = os.stat(os.path.join(d, f))
                        files.append({"o": u["id"], "on": u["n"], "n": f, "s": st.st_size, "t": int(st.st_mtime), "p": priv})
        self.send_json({"vol": {"id": "int", "label": "internal flash", "t": FS_TOTAL, "u": allu, "max": MAX_FILE,
                                "quota": 0 if self.user["r"] == "admin" else QUOTA, "reserve": 96 * 1024, "perUser": 40},
                        "mine": {"u": used, "n": n}, "files": files})

    def a_upload(self):
        ctype = self.headers.get("Content-Type", "")
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n)
        if not self.sess or not hmac.compare_digest(self.headers.get("X-CSRF", ""), self.sess["csrf"]):
            return self.err(403, "bad csrf token, reload the page")
        m = re.search(r"boundary=(.+)", ctype)
        if not m:
            return self.err(400, "no file in the request")
        b = ("--" + m.group(1).strip('"')).encode()
        for part in body.split(b):
            if b"filename=" not in part:
                continue
            head, _, data = part.partition(b"\r\n\r\n")
            data = data[:-2] if data.endswith(b"\r\n") else data
            fn = re.search(rb'filename="([^"]*)"', head).group(1).decode("utf-8", "replace")
            name = safe_name(fn)
            if not name:
                return self.err(400, "that file name can't be used")
            if name.rsplit(".", 1)[-1].lower() not in TYPES:
                return self.err(415, "that file type isn't allowed on catnet")
            if len(data) > MAX_FILE:
                return self.err(413, "file is larger than the limit")
            if not magic_ok(name, data[:16]):
                return self.err(415, "file contents don't match its type")
            used, cnt = self.usage(self.user["id"])
            if self.user["r"] != "admin" and used + len(data) > QUOTA:
                return self.err(507, "your storage quota is full")
            if not data:
                return self.err(400, "empty file")
            priv = self.query.get("p") == "1"
            d = self.fdir(self.user["id"], priv)
            os.makedirs(d, exist_ok=True)
            final, i = name, 2
            while os.path.exists(os.path.join(d, final)) or os.path.exists(os.path.join(self.fdir(self.user["id"], not priv), final)):
                base, ext = name.rsplit(".", 1)
                final, i = f"{base} ({i}).{ext}", i + 1
            with open(os.path.join(d, final), "wb") as f:
                f.write(data)
            self.user["stats"]["uploads"] += 1
            return self.send_json({"ok": True, "n": final, "s": len(data)})
        self.err(400, "no file in the request")

    def resolve(self, write):
        try:
            o = int(self.arg("o", "0"))
        except ValueError:
            o = 0
        n = self.arg("n")
        priv = self.arg("p") == "1"
        if o <= 0 or not n or safe_name(n) != n:
            return None, "bad file reference"
        own = o == self.user["id"]
        if (priv or write) and not own and self.user["r"] != "admin":
            return None, "that file isn't yours"
        path = os.path.join(self.fdir(o, priv), n)
        if not os.path.isfile(path):
            return None, "file not found"
        return path, None

    def a_file_get(self):
        path, e = self.resolve(False)
        if not path:
            return self.err(404 if e == "file not found" else 403, e)
        n = self.arg("n")
        t = TYPES.get(n.rsplit(".", 1)[-1].lower(), ("application/octet-stream", 0))
        inline = t[1] == 1 and self.arg("dl") != "1"
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", t[0] if inline else "application/octet-stream")
        self.send_header("Content-Disposition", ('inline' if inline else 'attachment') + '; filename="%s"' % n.replace('"', ""))
        self.send_header("X-Content-Type-Options", "nosniff")
        if inline and t[0] != "application/pdf":
            self.send_header("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def a_file_delete(self):
        path, e = self.resolve(True)
        if not path:
            return self.err(404 if e == "file not found" else 403, e)
        os.remove(path)
        self.send_json({"ok": True})

    def a_file_move(self):
        path, e = self.resolve(True)
        if not path:
            return self.err(404 if e == "file not found" else 403, e)
        priv = self.arg("p") == "1"
        d = self.fdir(int(self.arg("o")), not priv)
        os.makedirs(d, exist_ok=True)
        to = os.path.join(d, self.arg("n"))
        if os.path.exists(to):
            return self.err(409, "a file with that name already exists there")
        os.replace(path, to)
        self.send_json({"ok": True})

    def mynotes(self):
        return S["notes"].setdefault(str(self.user["id"]), {})

    def a_notes(self):
        out = [{"id": int(k), "title": v["title"], "pin": v["pin"], "t": v["t"], "s": len(v["body"]),
                "pv": clean(v["body"][:89], 80)} for k, v in self.mynotes().items()]
        self.send_json({"notes": out})

    def a_note_get(self):
        v = self.mynotes().get(self.arg("id"))
        if not v:
            return self.err(404, "note not found")
        self.send_json({"id": int(self.arg("id")), **v})

    def a_note_save(self):
        notes = self.mynotes()
        nid = int(self.arg("id", "0") or 0)
        if nid <= 0:
            if len(notes) >= 40:
                return self.err(409, "note limit reached, delete an old one")
            nid = max([int(k) for k in notes] + [0]) + 1
        elif str(nid) not in notes:
            return self.err(404, "note not found")
        notes[str(nid)] = {"title": clean(self.arg("title"), 60) or "untitled", "pin": self.arg("pin") == "1",
                           "t": now(), "body": clean(self.arg("body"), 6000, True)}
        self.send_json({"ok": True, "id": nid, "t": now()})

    def a_note_delete(self):
        if not self.mynotes().pop(self.arg("id"), None):
            return self.err(404, "note not found")
        self.send_json({"ok": True})

    def post(self, pid):
        return next((p for p in S["posts"] if p["id"] == pid), None)

    def a_board(self):
        out = []
        for p in S["posts"]:
            u = user_by_id(p["uid"])
            out.append({"id": p["id"], "title": p["title"], "by": p["by"], "c": u["c"] if u else "#a397b8",
                        "a": u["a"] if u else 0, "t": p["t"], "last": max([p["t"]] + [r["t"] for r in p["replies"]]),
                        "n": len(p["replies"]), "pin": p["pin"]})
        out.sort(key=lambda x: (not x["pin"], -x["last"], -x["id"]))
        self.send_json({"posts": out})

    def a_board_get(self):
        p = self.post(int(self.arg("id", "0") or 0))
        if not p:
            return self.err(404, "that post is gone")
        u = user_by_id(p["uid"])
        reps = []
        for i, r in enumerate(p["replies"]):
            ru = user_by_id(r["uid"])
            reps.append({"i": i, "uid": r["uid"], "by": r["by"], "c": ru["c"] if ru else "#a397b8", "a": ru["a"] if ru else 0, "t": r["t"], "body": r["body"]})
        self.send_json({"id": p["id"], "uid": p["uid"], "by": p["by"], "c": u["c"] if u else "#a397b8", "a": u["a"] if u else 0,
                        "t": p["t"], "pin": p["pin"], "title": p["title"], "body": p["body"], "replies": reps})

    def a_board_post(self):
        title = clean(self.arg("title"), 60)
        if not title:
            return self.err(400, "posts need a title")
        pid = S["next_post"]
        S["next_post"] += 1
        S["posts"].append({"id": pid, "uid": self.user["id"], "by": self.user["n"], "t": now(), "pin": False,
                           "title": title, "body": clean(self.arg("body"), 1000, True), "replies": []})
        self.user["stats"]["posts"] += 1
        self.send_json({"ok": True, "id": pid})

    def a_board_reply(self):
        p = self.post(int(self.arg("id", "0") or 0))
        if not p:
            return self.err(404, "that post is gone")
        body = clean(self.arg("body"), 400, True)
        if not body:
            return self.err(400, "empty reply")
        p["replies"].append({"uid": self.user["id"], "by": self.user["n"], "t": now(), "body": body})
        self.send_json({"ok": True})

    def a_board_delete(self):
        p = self.post(int(self.arg("id", "0") or 0))
        if not p:
            return self.err(404, "that post is gone")
        if p["uid"] != self.user["id"] and self.user["r"] != "admin":
            return self.err(403, "not your post")
        S["posts"].remove(p)
        self.send_json({"ok": True})

    def a_board_delreply(self):
        p = self.post(int(self.arg("id", "0") or 0))
        i = int(self.arg("i", "-1") or -1)
        if not p or not 0 <= i < len(p["replies"]):
            return self.err(404, "reply not found")
        if p["replies"][i]["uid"] != self.user["id"] and self.user["r"] != "admin":
            return self.err(403, "not your reply")
        p["replies"].pop(i)
        self.send_json({"ok": True})

    def a_board_pin(self):
        p = self.post(int(self.arg("id", "0") or 0))
        if not p:
            return self.err(404, "that post is gone")
        p["pin"] = self.arg("pin") == "1"
        self.send_json({"ok": True})

    def a_ann(self):
        self.send_json({"items": list(reversed(S["ann"]))})

    def a_ann_add(self):
        text = clean(self.arg("text"), 200)
        if not text:
            return self.err(400, "announcement is empty")
        S["ann"].append({"id": S["next_ann"], "t": now(), "lv": 1 if self.arg("lv") == "1" else 0, "by": self.user["n"], "text": text})
        S["next_ann"] += 1
        S["ann"] = S["ann"][-8:]
        self.send_json({"ok": True})

    def a_ann_del(self):
        S["ann"] = [a for a in S["ann"] if a["id"] != int(self.arg("id", "0") or 0)]
        self.send_json({"ok": True})

    def a_save_get(self):
        g = self.arg("g")
        if g not in GAMES:
            return self.err(400, "unknown game")
        raw = S["saves"].get(f"{self.user['id']}/{g}")
        self.send_json({"g": g, "d": json.loads(raw) if raw else None})

    def a_save_put(self):
        g, d = self.arg("g"), self.arg("d")
        if g not in GAMES:
            return self.err(400, "unknown game")
        if len(d.encode()) > 8192:
            return self.err(413, "save is too big")
        if not json_ok(d):
            return self.err(400, "save is not valid JSON")
        S["saves"][f"{self.user['id']}/{g}"] = d
        self.send_json({"ok": True})

    def scores_for(self, g, top):
        lst = sorted([s for s in S["scores"] if s["g"] == g], key=lambda s: -s["s"])
        out = {"top": []}
        for s in lst[:top]:
            u = user_by_id(s["uid"])
            out["top"].append({"n": s["n"], "c": u["c"] if u else "#a397b8", "s": s["s"], "t": s["t"], "x": s["x"]})
        for i, s in enumerate(lst):
            if s["uid"] == self.user["id"]:
                out["mine"], out["rank"] = s["s"], i + 1
                break
        return out

    def a_scores(self):
        g = self.arg("g")
        if g:
            if g not in GAMES:
                return self.err(400, "unknown game")
            return self.send_json({g: self.scores_for(g, 10)})
        self.send_json({x: self.scores_for(x, 5) for x in GAMES})

    def a_score_post(self):
        g = self.arg("g")
        if g not in GAMES:
            return self.err(400, "unknown game")
        try:
            s = int(self.arg("s", "-1"))
        except ValueError:
            s = -1
        if not 0 <= s <= 10000000:
            return self.err(400, "bad score")
        cur = next((x for x in S["scores"] if x["g"] == g and x["uid"] == self.user["id"]), None)
        best = not cur or s > cur["s"]
        if not cur:
            S["scores"].append({"g": g, "uid": self.user["id"], "n": self.user["n"], "s": s, "t": now(), "x": clean(self.arg("x"), 40)})
        elif best:
            cur.update({"s": s, "t": now(), "x": clean(self.arg("x"), 40)})
        self.user["stats"]["games"] += 1
        self.send_json({"ok": True, "best": best, g: self.scores_for(g, 10)})


_last_build = [0.0]


def rebuild_if_changed():
    newest = max((os.path.getmtime(os.path.join(r, f)) for r, _, fs in os.walk(os.path.join(ROOT, "web")) for f in fs), default=0)
    if newest > _last_build[0]:
        import build_web
        if build_web.build(os.path.join(ROOT, "web"), DATA, partition_size=0xD0000, quiet=True):
            _last_build[0] = newest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--fresh", action="store_true", help="wipe dev state first")
    ap.add_argument("--no-build", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()
    if not a.no_build:
        rebuild_if_changed()
        if not _last_build[0]:
            sys.exit(1)
    load_state(a.fresh)
    print(f"catnet dev server on http://localhost:{a.port}  (portal key: {PORTAL_KEY})")
    ThreadingHTTPServer(("0.0.0.0", a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
