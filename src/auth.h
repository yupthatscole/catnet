// catnet — by cole (github.com/yupthatscole)
#pragma once
#include <Arduino.h>
#include "config.h"

struct Session {
  char token[33];
  char csrf[33];
  uint8_t uid;
  uint32_t ip;
  uint32_t created;   // millis
  uint32_t lastSeen;  // millis
};

Session *sessionCreate(uint8_t uid, uint32_t ip);
Session *sessionFind(const char *token, uint32_t ip);
void sessionDestroy(Session *s);
int sessionsDestroyUser(uint8_t uid, const Session *except);
int sessionsActive();
int onlineUsers(uint8_t *out, int max);
bool userOnline(uint8_t uid);
void sessionsTick();

bool loginAllowed(uint32_t ip, uint32_t *waitMs);
void loginFailed(uint32_t ip);
void loginSucceeded(uint32_t ip);
uint32_t loginFailuresTotal();
bool registerAllowed(uint32_t ip);
void registerDone(uint32_t ip);
bool floodAllow(uint32_t ip);
