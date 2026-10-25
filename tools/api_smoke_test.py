# catnet — by cole (github.com/yupthatscole)
"""pokes every api endpoint and checks the answers.

  python tools/api_smoke_test.py   (dev server)
  python tools/api_smoke_test.py --base http://192.168.4.1 --admin NAME --password PASS --key PORTALKEY

makes two throwaway users (zz_smoke_a / zz_smoke_b) and deletes them at the end.
"""
import argparse
import http.cookiejar
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

FAILS = []
PASSES = [0]


def check(cond, what):
    if cond:
        PASSES[0] += 1
    else:
        FAILS.append(what)
        print("  FAIL", what)


class Client:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = ""

    def req(self, path, body=None, headers=None, raw=None, ctype=None, method=None):
        h = {"Origin": self.base} if body is not None or raw is not None else {}
        if self.csrf:
            h["X-CSRF"] = self.csrf
        h.update(headers or {})
        data = None
        if body is not None:
            data = urllib.parse.urlencode(body).encode()
            h["Content-Type"] = "application/x-www-form-urlencoded"
        if raw is not None:
            data = raw
            h["Content-Type"] = ctype
        r = urllib.request.Request(self.base + path, data=data, headers=h, method=method)
        try:
            with self.op.open(r, timeout=20) as resp:
                b = resp.read()
                return resp.status, b, resp.headers
        except urllib.error.HTTPError as e:
            return e.code, e.read(), e.headers

    def json(self, path, body=None, **kw):
        st, b, _ = self.req(path, body, **kw)
        try:
            return st, json.loads(b.decode() or "null")
        except ValueError:
            return st, None

    def login(self, user, pw):
        st, d = self.json("/api/login", {"user": user, "pass": pw, "t": int(time.time() * 1000)})
        if st == 200:
            self.csrf = d["csrf"]
        return st, d


def multipart(field, filename, content):
    b = "----catnet" + uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: application/octet-stream\r\n\r\n").encode() + content + f"\r\n--{b}--\r\n".encode()
    return body, "multipart/form-data; boundary=" + b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8080")
    ap.add_argument("--admin", default="tester")
    ap.add_argument("--password", default="testpass1")
    ap.add_argument("--key", default="dev-key")
    a = ap.parse_args()

    adm = Client(a.base)
    st, d = adm.json("/api/state")
    check(st == 200 and "setup" in d, "GET /api/state works without login")
    if d.get("setup"):
        st, d = adm.json("/api/register", {"user": a.admin, "pass": a.password, "key": a.key})
        check(st == 200 and d["admin"], "first account becomes admin")
    else:
        st, d = adm.login(a.admin, a.password)
        check(st == 200 and d.get("admin"), "admin login")
    if st != 200:
        print("cannot log in as admin; stopping")
        sys.exit(1)

    anon = Client(a.base)
    for path in ["/api/me", "/api/pulse", "/api/files", "/api/notes", "/api/board", "/api/sys", "/api/admin/users"]:
        st, _ = anon.json(path)
        check(st == 401, f"{path} requires login")
    st, _, hd = anon.req("/chat")
    check(st == 200, "pages redirect anonymous visitors to /login")
    st, _ = anon.json("/api/register", {"user": "zz_nokey", "pass": "whatever1", "key": "wrong-key"})
    check(st in (401, 429), "registration needs the portal key")

    ua, ub = Client(a.base), Client(a.base)
    for c, name in ((ua, "zz_smoke_a"), (ub, "zz_smoke_b")):
        st, d = c.json("/api/register", {"user": name, "pass": "smokepass1", "key": a.key})
        if st == 409:
            st, d = c.login(name, "smokepass1")
        else:
            c.csrf = d.get("csrf", "") if d else ""
        check(st == 200 and d and not d["admin"], f"register {name} as member")
    st, _ = ua.json("/api/admin/users")
    check(st == 403, "members can't use admin endpoints")

    saved = ua.csrf
    ua.csrf = "0" * 32
    st, _ = ua.json("/api/chat/send", {"text": "csrf test"})
    check(st == 403, "POST with a wrong CSRF token is refused")
    ua.csrf = saved
    st, _ = ua.json("/api/chat/send", {"text": "origin test"}, headers={"Origin": "http://evil.example"})
    check(st == 403, "cross-origin POST is refused")

    before = [c.value for c in ua.jar]
    tmp = Client(a.base)
    tmp.jar = ua.jar
    tmp.op = ua.op
    st, d = tmp.login("zz_smoke_a", "smokepass1")
    after = [c.value for c in ua.jar]
    check(st == 200 and before != after, "logging in issues a fresh session token")
    ua.csrf = d["csrf"]

    st, d = ua.json("/api/chat/send", {"text": "<img src=x onerror=alert(1)> hi"})
    check(st == 200 and d["msg"]["x"].startswith("<img"), "chat stores text verbatim (escaped on output)")
    st, raw, _ = ua.req("/api/pulse?chat=1&c=0")
    check(b"<img" not in raw and b"\\u003cimg" in raw, "chat JSON escapes < and >")
    st, d = ua.json("/api/chat/send", {"text": "x" * 400})
    check(st == 200 and len(d["msg"]["x"]) <= 280, "chat messages are capped at 280 bytes")
    st, d = ua.json("/api/chat/send", {"text": "   "})
    check(st == 400, "empty chat messages are refused")
    burst = [ua.json("/api/chat/send", {"text": f"spam {i}"})[0] for i in range(8)]
    check(429 in burst, f"chat is rate limited (got {burst})")
    st, d = ub.json("/api/pulse?chat=1&c=0")
    mine = [m for m in d["chat"]["msgs"] if m["n"] == "zz_smoke_a" and m["k"] in (0, 4)]
    st2, _ = ub.json("/api/chat/delete", {"id": mine[0]["i"]})
    check(st2 == 403, "members can't delete other people's messages")
    st2, _ = adm.json("/api/chat/delete", {"id": mine[0]["i"]})
    check(st2 == 200, "admins can delete any message")

    st, d = ua.json("/api/notes/save", {"title": "secret", "body": "only mine\nline two", "pin": "1"})
    check(st == 200 and d["id"] > 0, "create a note")
    nid = d["id"]
    st, d = ua.json(f"/api/notes/get?id={nid}")
    check(st == 200 and d["body"] == "only mine\nline two" and d["pin"], "read the note back")
    st, d = ub.json(f"/api/notes/get?id={nid}")
    check(st == 404, "another user can't read your note")
    st, d = ua.json("/api/notes/delete", {"id": nid})
    check(st == 200, "delete the note")

    st, d = ua.json("/api/board/post", {"title": "smoke thread", "body": "hello board"})
    check(st == 200, "post to the board")
    pid = d["id"]
    st, _ = ub.json("/api/board/reply", {"id": pid, "body": "a reply"})
    check(st == 200, "reply to a post")
    st, d = ua.json(f"/api/board/get?id={pid}")
    check(st == 200 and len(d["replies"]) == 1, "thread shows the reply")
    st, _ = ub.json("/api/board/delete", {"id": pid})
    check(st == 403, "members can't delete other people's posts")
    st, _ = ua.json("/api/board/pin", {"id": pid, "pin": "1"})
    check(st == 403, "members can't pin")
    st, _ = adm.json("/api/board/pin", {"id": pid, "pin": "1"})
    check(st == 200, "admins can pin")
    st, _ = ua.json("/api/board/delete", {"id": pid})
    check(st == 200, "authors can delete their post")

    body, ct = multipart("file", "../../../evil path.txt", b"plain text file")
    st, raw, _ = ua.req("/api/files/upload", raw=body, ctype=ct)
    d = json.loads(raw)
    check(st == 200 and d["n"] == "evil path.txt", "upload sanitises traversal in names")
    body, ct = multipart("file", "fake.png", b"this is not a png")
    st, _, _ = ua.req("/api/files/upload", raw=body, ctype=ct)
    check(st == 415, "content sniffing rejects a fake png")
    body, ct = multipart("file", "tool.exe", b"MZ")
    st, _, _ = ua.req("/api/files/upload", raw=body, ctype=ct)
    check(st == 415, "disallowed file types are refused")
    body, ct = multipart("file", "page.html", b"<!doctype html><title>hi</title><p>home page")
    st, _, _ = ua.req("/api/files/upload?p=0", raw=body, ctype=ct)
    check(st == 200, "upload an html page")
    st, me = ua.json("/api/me")
    uid = me["user"]["id"]
    st, raw, hd = ub.req(f"/api/files/get?o={uid}&n=page.html&p=0")
    check(st == 200 and "attachment" in (hd.get("Content-Disposition") or ""), "html downloads are forced to attachment")
    st, raw, hd = anon.req("/~zz_smoke_a/page.html")
    check(st == 200 and "sandbox" in (hd.get("Content-Security-Policy") or ""), "hosted pages are sandboxed")
    st, _, _ = ub.req(f"/api/files/get?o={uid}&n=..%2F..%2Fsys%2Fusers.tsv&p=0")
    check(st in (403, 404), "file API rejects traversal")
    st, _ = ub.json("/api/files/delete", {"o": uid, "n": "page.html", "p": "0"})
    check(st == 403, "members can't delete other people's files")
    st, _ = ua.json("/api/files/move", {"o": uid, "n": "page.html", "p": "0"})
    check(st == 200, "make a file private")
    st, _, _ = ub.req(f"/api/files/get?o={uid}&n=page.html&p=1")
    check(st == 403, "private files are hidden from other members")
    st, _, _ = adm.req(f"/api/files/get?o={uid}&n=page.html&p=1")
    check(st == 200, "admins can open private files")

    st, _ = ua.json("/api/save", {"g": "denied", "d": json.dumps({"day": 3, "flags": {"x": True}})})
    check(st == 200, "save a game")
    st, d = ua.json("/api/save?g=denied")
    check(st == 200 and d["d"]["day"] == 3, "load the save back")
    st, _ = ua.json("/api/save", {"g": "denied", "d": "{not json"})
    check(st == 400, "invalid JSON saves are refused")
    st, _ = ua.json("/api/save", {"g": "minecraft", "d": "{}"})
    check(st == 400, "unknown games are refused")
    st, _ = ua.json("/api/save", {"g": "nine", "d": json.dumps({"pad": "x" * 9000})})
    check(st in (413,), "oversized saves are refused")
    st, d = ua.json("/api/scores", {"g": "signal", "s": 123, "x": "smoke"})
    check(st == 200 and d["best"], "submit a score")
    st, d = ua.json("/api/scores", {"g": "signal", "s": 5, "x": "worse"})
    check(st == 200 and not d["best"], "a worse score doesn't replace the best")

    st, _, _ = ua.req("/api/chat/send", raw=b"text=" + b"a" * 40000, ctype="application/x-www-form-urlencoded")
    check(st == 413, "oversized request bodies are refused")

    st, d = ua.json("/api/profile", {"color": "#123abc", "status": "smoke testing", "avatar": 5, "prefs": 255})
    check(st == 200 and d["user"]["c"] == "#123abc" and d["prefs"] == 15, "profile update (prefs masked)")
    st, _ = ua.json("/api/profile", {"color": "red"})
    check(st == 400, "invalid colours are refused")
    st, _ = ua.json("/api/password", {"old": "wrong", "new": "whatever1"})
    check(st == 401, "password change needs the current password")

    st, d = adm.json("/api/admin/users")
    ids = {u["n"]: u["id"] for u in d["users"]}
    st, d = adm.json("/api/admin/user", {"id": ids["zz_smoke_b"], "action": "reset"})
    check(st == 200 and d.get("temp"), "admin can reset a password")
    temp = d.get("temp", "")
    st, _ = ub.json("/api/me")
    check(st == 401, "resetting a password ends that user's sessions")
    nb = Client(a.base)
    st, d = nb.login("zz_smoke_b", temp)
    check(st == 200 and d["mustChange"], "temporary password works and forces a change")
    st, _ = nb.json("/api/password", {"old": temp, "new": "smokepass2"})
    check(st == 200, "user sets a new password")
    st, me = adm.json("/api/admin/user", {"id": ids["zz_smoke_b"], "action": "disable"})
    check(st == 200, "admin can disable an account")
    st, _ = adm.json("/api/admin/user", {"id": ids[a.admin], "action": "delete"})
    check(st == 409, "admins can't delete themselves")
    st, _ = adm.json("/api/chat/mute", {"id": ids["zz_smoke_a"], "min": 5})
    check(st == 200, "admin can mute")
    st, d = ua.json("/api/chat/send", {"text": "am i muted"})
    check(st == 403, "muted users can't talk")
    adm.json("/api/chat/mute", {"id": ids["zz_smoke_a"], "min": 0})

    st, _ = ua.json("/api/logout", {})
    st2, _ = ua.json("/api/me")
    check(st == 200 and st2 == 401, "logout ends the session")

    for n in ("zz_smoke_a", "zz_smoke_b"):
        st, _ = adm.json("/api/admin/user", {"id": ids[n], "action": "delete"})
        check(st == 200, f"cleanup: delete {n}")
    st, d = adm.json("/api/admin/users")
    check(not any(u["n"].startswith("zz_smoke") for u in d["users"]), "cleanup complete")

    print(f"\n{PASSES[0]} checks passed, {len(FAILS)} failed")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
