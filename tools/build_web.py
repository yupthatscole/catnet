# catnet — by cole (github.com/yupthatscole)
"""turns web/ into data/ (gzip + manifest) and yells if anything looks broken.

  python tools/build_web.py          build + size report
  python tools/build_web.py --check  just validate
"""
import gzip
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile

WEB_API_VERSION = 1  # must match WEB_API_VERSION in src/config.h
COMPRESS = {".html", ".css", ".js", ".svg", ".txt", ".json", ".ttf", ".ico"}
TYPES = {".html", ".css", ".js", ".svg", ".txt", ".json", ".png", ".woff",
         ".woff2", ".ttf", ".ico", ".webp", ".gif", ".jpg"}
MAX_PATH = 44  # LittleFS paths on the device are limited; keep headroom

ASSET_RE = re.compile(r'''(src|href)="(/[^"?#]+\.(?:js|css|png|woff2?|svg|ico|webp|gif|jpg))"''')
CSS_URL_RE = re.compile(r'''url\((['"]?)(/[^)'"?#]+)\1\)''')
INLINE_SCRIPT_RE = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>\s*\S", re.I)
INLINE_HANDLER_RE = re.compile(r"<[^>]+\son[a-z]+\s*=", re.I)


def _hash(data):
    return hashlib.sha1(data).hexdigest()[:10]


def _collect(src):
    files = {}
    for root, dirs, names in os.walk(src):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for n in names:
            if n.startswith(".") or n.endswith(".md"):
                continue
            full = os.path.join(root, n)
            rel = "/" + os.path.relpath(full, src).replace(os.sep, "/")
            files[rel] = full
    return files


def build(src, out, partition_size=None, quiet=False):
    errors = []
    files = _collect(src)
    if "/index.html" not in files or "/login.html" not in files:
        errors.append("web/ must contain index.html and login.html")

    content = {}
    for rel, full in files.items():
        ext = os.path.splitext(rel)[1].lower()
        if ext not in TYPES:
            errors.append(f"{rel}: unsupported file type {ext}")
            continue
        if len(rel) > MAX_PATH:
            errors.append(f"{rel}: path longer than {MAX_PATH} chars")
        with open(full, "rb") as f:
            data = f.read()
        if not data.strip():
            errors.append(f"{rel}: file is EMPTY (unsaved editor buffer?)")
        content[rel] = data

    hashes = {}
    order = sorted(content, key=lambda r: (r.endswith(".css"), r.endswith(".html")))
    for rel in order:
        if rel.endswith(".html"):
            continue
        data = content[rel]
        if rel.endswith(".css"):
            text = data.decode("utf-8")

            def css_sub(m, rel=rel):
                path = m.group(2)
                if path not in content:
                    errors.append(f"{rel}: url({path}) does not exist")
                    return m.group(0)
                return f"url({path}?v={hashes.get(path) or _hash(content[path])})"

            text = CSS_URL_RE.sub(css_sub, text)
            data = text.encode("utf-8")
            content[rel] = data
        hashes[rel] = _hash(data)

    for rel in content:
        if not rel.endswith(".html"):
            continue
        text = content[rel].decode("utf-8")
        low = text.lower()
        if "<!doctype html>" not in low or "</html>" not in low:
            errors.append(f"{rel}: incomplete HTML document (doctype/</html> missing)")
        if INLINE_SCRIPT_RE.search(text):
            errors.append(f"{rel}: inline <script> is blocked by the portal CSP; use a .js file")
        m = INLINE_HANDLER_RE.search(text)
        if m:
            errors.append(f"{rel}: inline event handler is blocked by CSP: {m.group(0)[:60]}")

        def html_sub(m, rel=rel):
            path = m.group(2)
            if path not in content:
                errors.append(f"{rel}: references missing asset {path}")
                return m.group(0)
            return f'{m.group(1)}="{path}?v={hashes[path]}"'

        text = ASSET_RE.sub(html_sub, text)
        content[rel] = text.encode("utf-8")
        hashes[rel] = _hash(content[rel])

    node = shutil.which("node")
    if node:
        for rel in content:
            if rel.endswith(".js"):
                r = subprocess.run([node, "--check", files[rel]], capture_output=True, text=True)
                if r.returncode != 0:
                    errors.append(f"{rel}: JavaScript syntax error\n{r.stderr.strip()[:800]}")

    if errors:
        for e in errors:
            print("catnet web build error:", e)
        return False

    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)
    manifest = [f"catnet-web {WEB_API_VERSION} {_hash(''.join(sorted(hashes.values())).encode())}"]
    total = 0
    report = []
    for rel in sorted(content):
        data = content[rel]
        ext = os.path.splitext(rel)[1].lower()
        gz = ext in COMPRESS
        payload = gzip.compress(data, compresslevel=9, mtime=0) if gz else data
        dest = os.path.join(out, rel.lstrip("/") + (".gz" if gz else ""))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(payload)
        if os.path.getsize(dest) != len(payload) or len(payload) == 0:
            print(f"catnet web build error: {rel}: write verification failed")
            return False
        manifest.append(f"{rel}\t{hashes[rel]}\t{1 if gz else 0}\t{len(payload)}")
        total += len(payload)
        report.append((rel, len(data), len(payload)))
    with open(os.path.join(out, "manifest.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(manifest) + "\n")

    est = total + 4096 * (len(content) + 4)
    if partition_size and est > partition_size:
        print(f"catnet web build error: assets need ~{est} bytes, partition is {partition_size}")
        return False

    if not quiet:
        w = max(len(r[0]) for r in report)
        for rel, raw, packed in report:
            print(f"  {rel:<{w}}  {raw:>8} -> {packed:>7}")
        print(f"  {len(report)} files, {sum(r[1] for r in report)} bytes source, "
              f"{total} bytes stored, ~{est} bytes on flash"
              + (f" of {partition_size}" if partition_size else ""))
    else:
        print(f"catnet: web assets OK ({len(report)} files, {total} bytes gzipped)")
    return True


if __name__ == "__main__":
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if "--check" in sys.argv:
        tmp = tempfile.mkdtemp()
        ok = build(os.path.join(here, "web"), os.path.join(tmp, "data"))
        shutil.rmtree(tmp, ignore_errors=True)
    else:
        ok = build(os.path.join(here, "web"), os.path.join(here, "data"), partition_size=0xD0000)
    sys.exit(0 if ok else 1)
