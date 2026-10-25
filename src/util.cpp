// catnet — by cole (github.com/yupthatscole)
#include "util.h"
#include "config.h"
#include <sys/time.h>
#include <esp_random.h>

static const char HEX_DIGITS[] = "0123456789abcdef";

void jsonEscapeInto(String &out, const char *v) {
  out += '"';
  if (v) {
    for (const unsigned char *p = (const unsigned char *)v; *p; ++p) {
      unsigned char c = *p;
      switch (c) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        case '<':
        case '>':
        case '&':
          out += "\\u00";
          out += HEX_DIGITS[c >> 4];
          out += HEX_DIGITS[c & 15];
          break;
        default:
          if (c < 0x20) {
            out += "\\u00";
            out += HEX_DIGITS[c >> 4];
            out += HEX_DIGITS[c & 15];
          } else {
            out += (char)c;
          }
      }
    }
  }
  out += '"';
}

void Json::pre() {
  if (afterKey) {
    afterKey = false;
    return;
  }
  if (comma) s += ',';
}

Json &Json::obj() {
  pre();
  s += '{';
  if (depth < sizeof(stack)) stack[depth] = '}';
  depth++;
  comma = false;
  return *this;
}

Json &Json::arr() {
  pre();
  s += '[';
  if (depth < sizeof(stack)) stack[depth] = ']';
  depth++;
  comma = false;
  return *this;
}

Json &Json::end() {
  if (depth == 0) return *this;
  depth--;
  s += depth < sizeof(stack) ? stack[depth] : '}';
  comma = true;
  return *this;
}

Json &Json::key(const char *k) {
  pre();
  jsonEscapeInto(s, k);
  s += ':';
  afterKey = true;
  return *this;
}

Json &Json::str(const char *v) {
  pre();
  jsonEscapeInto(s, v);
  comma = true;
  return *this;
}

Json &Json::num(long long v) {
  pre();
  char buf[24];
  snprintf(buf, sizeof(buf), "%lld", v);
  s += buf;
  comma = true;
  return *this;
}

Json &Json::boolean(bool v) {
  pre();
  s += v ? "true" : "false";
  comma = true;
  return *this;
}

Json &Json::null() {
  pre();
  s += "null";
  comma = true;
  return *this;
}

Json &Json::raw(const char *json) {
  pre();
  s += json;
  comma = true;
  return *this;
}

static int hexVal(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

String urlDecode(const char *s, size_t len) {
  String out;
  out.reserve(len);
  for (size_t i = 0; i < len; i++) {
    char c = s[i];
    if (c == '+') {
      out += ' ';
    } else if (c == '%' && i + 2 < len) {
      int h = hexVal(s[i + 1]), l = hexVal(s[i + 2]);
      if (h >= 0 && l >= 0) {
        out += (char)((h << 4) | l);
        i += 2;
      } else {
        out += c;
      }
    } else {
      out += c;
    }
  }
  return out;
}

void Form::parse(const char *body, size_t len) {
  kv.clear();
  size_t start = 0;
  while (start < len && kv.size() < 32) {
    size_t end = start;
    while (end < len && body[end] != '&') end++;
    size_t eq = start;
    while (eq < end && body[eq] != '=') eq++;
    if (eq > start) {
      String k = urlDecode(body + start, eq - start);
      String v = eq < end ? urlDecode(body + eq + 1, end - eq - 1) : String();
      kv.emplace_back(std::move(k), std::move(v));
    }
    start = end + 1;
  }
}

bool Form::has(const char *k) const {
  for (auto &p : kv)
    if (p.first == k) return true;
  return false;
}

String Form::get(const char *k) const {
  for (auto &p : kv)
    if (p.first == k) return p.second;
  return String();
}

long Form::getInt(const char *k, long def) const {
  for (auto &p : kv) {
    if (p.first == k) {
      const char *c = p.second.c_str();
      char *endp = nullptr;
      long v = strtol(c, &endp, 10);
      return (endp && endp != c) ? v : def;
    }
  }
  return def;
}

String cleanText(const String &in, size_t maxBytes, bool multiline) {
  String out;
  out.reserve(in.length() < maxBytes ? in.length() : maxBytes);
  const unsigned char *p = (const unsigned char *)in.c_str();
  size_t n = in.length();
  int newlines = 0;
  for (size_t i = 0; i < n;) {
    unsigned char c = p[i];
    size_t len = 1;
    bool ok = true;
    if (c < 0x80) {
      len = 1;
    } else if ((c & 0xE0) == 0xC0 && c >= 0xC2) {
      len = 2;
    } else if ((c & 0xF0) == 0xE0) {
      len = 3;
    } else if ((c & 0xF8) == 0xF0 && c <= 0xF4) {
      len = 4;
    } else {
      ok = false;
    }
    if (ok && i + len > n) ok = false;
    for (size_t k = 1; ok && k < len; k++)
      if ((p[i + k] & 0xC0) != 0x80) ok = false;
    if (!ok) {
      len = 1;
    }
    if (ok && len == 3 && c == 0xE2 &&
        ((p[i + 1] == 0x80 && p[i + 2] >= 0xAA && p[i + 2] <= 0xAE) ||
         (p[i + 1] == 0x81 && p[i + 2] >= 0xA6 && p[i + 2] <= 0xA9))) {
      i += len;
      continue;
    }
    String piece;
    if (!ok) {
      piece = "?";
    } else if (len == 1) {
      if (c == '\r' || c == 0x7F) {
        i += 1;
        continue;
      }
      if (c == '\n') {
        if (!multiline) {
          piece = " ";
        } else {
          if (++newlines > 2) {
            i += 1;
            continue;
          }
          piece = "\n";
        }
      } else if (c == '\t') {
        piece = " ";
      } else if (c < 0x20) {
        i += 1;
        continue;
      } else {
        piece = (char)c;
      }
    } else {
      piece = in.substring(i, i + len);
    }
    if (piece != "\n") newlines = 0;
    if (out.length() + piece.length() > maxBytes) break;
    out += piece;
    i += len;
  }
  out.trim();
  return out;
}

bool validUserName(const String &n) {
  if (n.length() < USERNAME_MIN || n.length() > USERNAME_MAX) return false;
  for (size_t i = 0; i < n.length(); i++) {
    char c = n[i];
    bool ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-';
    if (!ok) return false;
  }
  return n[0] != '-' && n[0] != '_';
}

String lowerAscii(String s) {
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c >= 'A' && c <= 'Z') s.setCharAt(i, c + 32);
  }
  return s;
}

const char *fileExt(const char *name) {
  const char *dot = strrchr(name, '.');
  return dot ? dot + 1 : "";
}

bool extIs(const char *name, const char *ext) {
  return strcasecmp(fileExt(name), ext) == 0;
}

String safeFileName(const String &inRaw) {
  String in = inRaw;
  int slash = in.lastIndexOf('/');
  int bslash = in.lastIndexOf('\\');
  int cut = slash > bslash ? slash : bslash;
  if (cut >= 0) in = in.substring(cut + 1);
  String out;
  for (size_t i = 0; i < in.length(); i++) {
    char c = in[i];
    bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
              c == '.' || c == '-' || c == '_' || c == ' ' || c == '(' || c == ')';
    char m = ok ? c : '_';
    if (m == '_' && out.length() && out[out.length() - 1] == '_') continue;
    if (m == '.' && out.length() && out[out.length() - 1] == '.') continue;  // no ".."
    out += m;
  }
  while (out.length() && (out[0] == '.' || out[0] == ' ')) out.remove(0, 1);
  while (out.length() && (out[out.length() - 1] == '.' || out[out.length() - 1] == ' '))
    out.remove(out.length() - 1);
  int dot = out.lastIndexOf('.');
  if (dot <= 0 || out.length() - dot - 1 < 1 || out.length() - dot - 1 > 5) return String();
  if (out.length() > FILE_NAME_MAX) {
    String ext = out.substring(dot);
    out = out.substring(0, FILE_NAME_MAX - ext.length());
    out.trim();
    out += ext;
  }
  return out;
}

String tsvEscape(const String &f) {
  String o;
  o.reserve(f.length() + 4);
  for (size_t i = 0; i < f.length(); i++) {
    char c = f[i];
    if (c == '\\') o += "\\\\";
    else if (c == '\t') o += "\\t";
    else if (c == '\n') o += "\\n";
    else if (c == '\r') continue;
    else o += c;
  }
  return o;
}

void tsvSplit(const String &line, std::vector<String> &out) {
  out.clear();
  String cur;
  for (size_t i = 0; i < line.length(); i++) {
    char c = line[i];
    if (c == '\t') {
      out.push_back(cur);
      cur = String();
    } else if (c == '\\' && i + 1 < line.length()) {
      char n = line[++i];
      cur += n == 'n' ? '\n' : n == 't' ? '\t' : n;
    } else if (c != '\r' && c != '\n') {
      cur += c;
    }
  }
  out.push_back(cur);
}

namespace {
struct JV {
  const char *p, *e;
  int depth, maxDepth;
  void ws() {
    while (p < e && (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t')) p++;
  }
  bool lit(const char *w) {
    size_t n = strlen(w);
    if ((size_t)(e - p) < n || memcmp(p, w, n)) return false;
    p += n;
    return true;
  }
  bool str() {
    if (p >= e || *p != '"') return false;
    for (p++; p < e; p++) {
      unsigned char c = *p;
      if (c == '"') {
        p++;
        return true;
      }
      if (c < 0x20) return false;
      if (c == '\\') {
        if (++p >= e) return false;
        if (*p == 'u') {
          for (int i = 0; i < 4; i++)
            if (++p >= e || !isxdigit((unsigned char)*p)) return false;
        } else if (!strchr("\"\\/bfnrt", *p)) {
          return false;
        }
      }
    }
    return false;
  }
  bool num() {
    const char *s = p;
    if (p < e && *p == '-') p++;
    if (p >= e || !isdigit((unsigned char)*p)) return false;
    if (*p == '0') p++;
    else while (p < e && isdigit((unsigned char)*p)) p++;
    if (p < e && *p == '.') {
      p++;
      if (p >= e || !isdigit((unsigned char)*p)) return false;
      while (p < e && isdigit((unsigned char)*p)) p++;
    }
    if (p < e && (*p == 'e' || *p == 'E')) {
      p++;
      if (p < e && (*p == '+' || *p == '-')) p++;
      if (p >= e || !isdigit((unsigned char)*p)) return false;
      while (p < e && isdigit((unsigned char)*p)) p++;
    }
    return p > s;
  }
  bool value() {
    ws();
    if (p >= e) return false;
    switch (*p) {
      case '{': {
        if (++depth > maxDepth) return false;
        p++;
        ws();
        if (p < e && *p == '}') {
          p++;
          depth--;
          return true;
        }
        while (true) {
          ws();
          if (!str()) return false;
          ws();
          if (p >= e || *p++ != ':') return false;
          if (!value()) return false;
          ws();
          if (p < e && *p == ',') {
            p++;
            continue;
          }
          if (p < e && *p == '}') {
            p++;
            depth--;
            return true;
          }
          return false;
        }
      }
      case '[': {
        if (++depth > maxDepth) return false;
        p++;
        ws();
        if (p < e && *p == ']') {
          p++;
          depth--;
          return true;
        }
        while (true) {
          if (!value()) return false;
          ws();
          if (p < e && *p == ',') {
            p++;
            continue;
          }
          if (p < e && *p == ']') {
            p++;
            depth--;
            return true;
          }
          return false;
        }
      }
      case '"': return str();
      case 't': return lit("true");
      case 'f': return lit("false");
      case 'n': return lit("null");
      default: return num();
    }
  }
};
}  // namespace

bool jsonValid(const char *s, size_t n, int maxDepth) {
  JV v{s, s + n, 0, maxDepth};
  if (!v.value()) return false;
  v.ws();
  return v.p == v.e;
}

void toHex(const uint8_t *in, size_t n, char *out) {
  for (size_t i = 0; i < n; i++) {
    out[i * 2] = HEX_DIGITS[in[i] >> 4];
    out[i * 2 + 1] = HEX_DIGITS[in[i] & 15];
  }
  out[n * 2] = 0;
}

bool fromHex(const char *in, uint8_t *out, size_t n) {
  for (size_t i = 0; i < n; i++) {
    int h = hexVal(in[i * 2]), l = h >= 0 ? hexVal(in[i * 2 + 1]) : -1;
    if (h < 0 || l < 0) return false;
    out[i] = (h << 4) | l;
  }
  return true;
}

void randomHex(char *out, size_t bytes) {
  uint8_t buf[32];
  if (bytes > sizeof(buf)) bytes = sizeof(buf);
  esp_fill_random(buf, bytes);
  toHex(buf, bytes, out);
}

bool constTimeEq(const uint8_t *a, const uint8_t *b, size_t n) {
  uint8_t d = 0;
  for (size_t i = 0; i < n; i++) d |= a[i] ^ b[i];
  return d == 0;
}

static bool g_clockKnown = false;

uint32_t nowEpoch() {
  if (!g_clockKnown) return 0;
  return (uint32_t)time(nullptr);
}

bool clockKnown() { return g_clockKnown; }

void setClock(uint32_t epoch) {
  if (epoch < 1700000000UL) return;  // obviously wrong clocks are ignored
  struct timeval tv = {};
  tv.tv_sec = epoch;
  settimeofday(&tv, nullptr);
  g_clockKnown = true;
}
