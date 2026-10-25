// catnet — by cole (github.com/yupthatscole)
#pragma once
#include <Arduino.h>
#include <vector>

class Json {
public:
  explicit Json(size_t reserve = 256) { s.reserve(reserve); }
  Json &obj();
  Json &end();      // closes the innermost object or array
  Json &arr();
  Json &key(const char *k);
  Json &str(const char *v);
  Json &str(const String &v) { return str(v.c_str()); }
  Json &num(long long v);
  Json &boolean(bool v);
  Json &null();
  Json &raw(const char *json);  // pre-validated JSON value
  Json &kv(const char *k, const char *v) { return key(k).str(v); }
  Json &kv(const char *k, const String &v) { return key(k).str(v.c_str()); }
  Json &kn(const char *k, long long v) { return key(k).num(v); }
  Json &kb(const char *k, bool v) { return key(k).boolean(v); }
  String s;

private:
  void pre();
  bool comma = false;
  bool afterKey = false;
  char stack[12];
  uint8_t depth = 0;
};

void jsonEscapeInto(String &out, const char *v);

class Form {
public:
  void parse(const char *body, size_t len);
  bool has(const char *k) const;
  String get(const char *k) const;
  long getInt(const char *k, long def) const;
  void clear() { kv.clear(); }

private:
  std::vector<std::pair<String, String>> kv;
};
String urlDecode(const char *s, size_t len);

String cleanText(const String &in, size_t maxBytes, bool multiline);
bool validUserName(const String &n);
String lowerAscii(String s);
String safeFileName(const String &in);
const char *fileExt(const char *name);  // lowercased compare helper input
bool extIs(const char *name, const char *ext);

String tsvEscape(const String &f);
void tsvSplit(const String &line, std::vector<String> &out);

bool jsonValid(const char *s, size_t n, int maxDepth = 16);

void randomHex(char *out, size_t bytes);  // out must hold bytes*2+1
void toHex(const uint8_t *in, size_t n, char *out);
bool fromHex(const char *in, uint8_t *out, size_t n);
bool constTimeEq(const uint8_t *a, const uint8_t *b, size_t n);

uint32_t nowEpoch();
bool clockKnown();
void setClock(uint32_t epoch);
