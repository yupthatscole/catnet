// catnet — by cole (github.com/yupthatscole)
#pragma once
#include <FS.h>
#include <LittleFS.h>

bool storageBegin();
bool webFsOk();
bool userFsOk();
fs::FS &webFs();
fs::FS &userFs();
size_t webTotal();
size_t webUsed();
size_t userTotal();
size_t userUsed();

struct Volume {
  const char *id;      // short id used in URLs
  const char *label;   // shown in the UI
  fs::FS *fs;
  const char *pubRoot;   // "<root>/<uid>/<name>" public files
  const char *privRoot;  // private files
  size_t (*total)();
  size_t (*used)();
  size_t maxFile;
  size_t userQuota;
  size_t reserve;  // bytes that must stay free for the rest of catnet
};
Volume &filesVolume();

String readSmallFile(fs::FS &fs, const char *path, size_t maxBytes);
bool writeFileAtomic(fs::FS &fs, const char *path, const String &data);
bool appendLine(fs::FS &fs, const char *path, const String &line);
size_t dirSize(fs::FS &fs, const char *path, int *count = nullptr);
bool removeTree(fs::FS &fs, const char *path);
