// catnet — by cole (github.com/yupthatscole)
#pragma once
#include <Arduino.h>
#include "config.h"

enum : uint8_t { ROLE_MEMBER = 0, ROLE_ADMIN = 1 };
enum : uint8_t { UF_DISABLED = 1, UF_MUST_CHANGE = 2 };
enum : uint8_t { PF_REDUCE_MOTION = 1, PF_NO_PET = 2, PF_NO_SOUND = 4, PF_COMPACT = 8 };

struct User {
  uint8_t id;  // 0 = free slot
  char name[USERNAME_MAX + 1];
  uint8_t role;
  uint8_t flags;
  uint8_t salt[16];
  uint8_t hash[32];
  uint16_t iter;
  uint32_t created;
  uint32_t lastSeen;
  uint8_t avatar;  // index into the client-side avatar set
  uint8_t accent;  // UI accent theme index
  uint8_t prefs;
  char color[8];   // "#rrggbb" name colour in chat
  char status[41];
  char bio[161];
  uint16_t sLogins, sMsgs, sUploads, sPosts, sGames;
  uint32_t mutedUntilMs;  // millis(); not persisted
};

enum class UserErr { OK, BAD_NAME, BAD_PASS, TAKEN, FULL, STORAGE };

void usersBegin();
int userCount();
User *userById(uint8_t id);
User *userByName(const String &name);
User *userSlot(int i);  // iterate 0..MAX_USERS-1 (may return free slots)
UserErr createUser(const String &name, const String &pass, uint8_t role, uint8_t *outId);
bool checkPassword(const User &u, const String &pass);
bool setPassword(User &u, const String &pass);
bool deleteUser(uint8_t id);
int adminCount();
bool usersSaveNow();
void usersMarkDirty();
void usersTick();  // call from loop: flushes batched changes

void hashSecret(const String &secret, const uint8_t *salt, uint16_t iter, uint8_t out[32]);
