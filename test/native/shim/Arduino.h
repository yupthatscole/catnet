// catnet — by cole (github.com/yupthatscole)
#pragma once
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cctype>
#include <string>
#include <utility>

extern uint32_t g_fake_millis;
inline uint32_t millis() { return g_fake_millis; }

class String {
public:
  String() {}
  String(const char *s) : s_(s ? s : "") {}
  String(const std::string &s) : s_(s) {}
  String(char c) : s_(1, c) {}
  String(int v) : s_(std::to_string(v)) {}
  String(unsigned v) : s_(std::to_string(v)) {}
  String(long v) : s_(std::to_string(v)) {}
  String(unsigned long v) : s_(std::to_string(v)) {}
  String(unsigned char v) : s_(std::to_string(v)) {}
  size_t length() const { return s_.size(); }
  const char *c_str() const { return s_.c_str(); }
  char operator[](size_t i) const { return i < s_.size() ? s_[i] : 0; }
  void setCharAt(size_t i, char c) { if (i < s_.size()) s_[i] = c; }
  bool reserve(size_t n) { s_.reserve(n); return true; }
  bool concat(const char *p, size_t n) { s_.append(p, n); return true; }
  bool isEmpty() const { return s_.empty(); }
  String &operator+=(const String &o) { s_ += o.s_; return *this; }
  String &operator+=(const char *o) { s_ += o; return *this; }
  String &operator+=(char c) { s_ += c; return *this; }
  String &operator+=(int v) { s_ += std::to_string(v); return *this; }
  String &operator+=(unsigned v) { s_ += std::to_string(v); return *this; }
  String &operator+=(unsigned char v) { s_ += std::to_string(v); return *this; }
  friend String operator+(const String &a, const String &b) { return String(a.s_ + b.s_); }
  friend String operator+(const String &a, const char *b) { return String(a.s_ + b); }
  friend String operator+(const char *a, const String &b) { return String(std::string(a) + b.s_); }
  friend String operator+(const String &a, char b) { return String(a.s_ + b); }
  bool operator==(const String &o) const { return s_ == o.s_; }
  bool operator==(const char *o) const { return s_ == o; }
  bool operator!=(const String &o) const { return s_ != o.s_; }
  bool operator!=(const char *o) const { return s_ != o; }
  String substring(size_t a) const { return a >= s_.size() ? String() : String(s_.substr(a)); }
  String substring(size_t a, size_t b) const { if (a >= s_.size() || b <= a) return String(); return String(s_.substr(a, b - a)); }
  int indexOf(char c, size_t from = 0) const { auto p = s_.find(c, from); return p == std::string::npos ? -1 : (int)p; }
  int indexOf(const char *t, size_t from = 0) const { auto p = s_.find(t, from); return p == std::string::npos ? -1 : (int)p; }
  int indexOf(const String &t, size_t from = 0) const { return indexOf(t.c_str(), from); }
  int lastIndexOf(char c) const { auto p = s_.rfind(c); return p == std::string::npos ? -1 : (int)p; }
  bool startsWith(const char *t) const { return s_.rfind(t, 0) == 0; }
  bool startsWith(const String &t) const { return startsWith(t.c_str()); }
  bool endsWith(const char *t) const { size_t n = strlen(t); return s_.size() >= n && s_.compare(s_.size() - n, n, t) == 0; }
  void trim() {
    size_t a = 0, b = s_.size();
    while (a < b && isspace((unsigned char)s_[a])) a++;
    while (b > a && isspace((unsigned char)s_[b - 1])) b--;
    s_ = s_.substr(a, b - a);
  }
  long toInt() const { return atol(s_.c_str()); }
  void remove(size_t i, size_t n = 1) { if (i < s_.size()) s_.erase(i, n); }
  void toLowerCase() { for (auto &c : s_) c = tolower((unsigned char)c); }
  bool equalsIgnoreCase(const String &o) const {
    if (o.length() != length()) return false;
    for (size_t i = 0; i < length(); i++) if (tolower((unsigned char)s_[i]) != tolower((unsigned char)o.s_[i])) return false;
    return true;
  }
  const std::string &std() const { return s_; }

private:
  std::string s_;
};
