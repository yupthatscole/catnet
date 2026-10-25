// catnet — by cole (github.com/yupthatscole)
#pragma once
#include <Arduino.h>
#include <WebServer.h>
#include "auth.h"
#include "users.h"
#include "util.h"

struct Req {
  WebServer &srv;
  HTTPMethod method;
  String path;
  uint32_t ip;
  Session *sess = nullptr;
  User *user = nullptr;
  Form form;           // urlencoded POST body
  const String &body;  // raw POST body (text/plain)
  bool isAdmin() const { return user && user->role == ROLE_ADMIN; }
  String arg(const char *k) const;
  long argInt(const char *k, long def) const;
  Req(WebServer &s, HTTPMethod m, const String &p, uint32_t i, const String &b)
      : srv(s), method(m), path(p), ip(i), body(b) {}
};

enum RouteFlags : uint8_t {
  R_PUBLIC = 0,
  R_AUTH = 1,   // needs a session
  R_ADMIN = 2,  // needs an admin session (implies R_AUTH)
};

typedef void (*RouteFn)(Req &);
void route(HTTPMethod m, const char *path, uint8_t flags, RouteFn fn);

void webBegin(WebServer &srv);
bool webAssetsOk();
const char *webBuildId();
int webAssetCount();

void sendJson(Req &r, Json &j, int code = 200);
void sendOk(Req &r);
void sendError(Req &r, int code, const char *msg);
void setNoStore(WebServer &srv);

bool filesCanUpload(const String &uri);
void filesUpload(WebServer &srv, HTTPUpload &up, Req &ctx);
void filesServeHosted(Req &r);

void registerCoreApi();
void registerChatApi();
void registerFilesApi();
void registerContentApi();
void chatBegin();
void chatTick();
void boardBegin();
void chatSystemMessage(const char *text);
void chatPulse(Json &j, Req &r, uint32_t since, bool inChat, bool typing);
uint32_t announceLatestId();
void removeUserContent(uint8_t uid);  // files, notes, saves of a deleted user

size_t streamFileSafe(WebServer &srv, File &f, const char *mime, int code, bool gzip);
bool requestTrusted(Req &r);  // Origin ok + session + matching CSRF header
void sessionCookie(WebServer &srv, const Session *s);
uint32_t clientIp(WebServer &srv);
void userJson(Json &j, const User &u, bool full);
