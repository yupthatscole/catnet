// catnet — by cole (github.com/yupthatscole)
#pragma once
#include <Arduino.h>

struct SysConfig {
  String ssid;
  String wifiPass;
  uint8_t channel;
  bool captive;      // answer every DNS name with catnet (captive portal)
  bool openSignup;   // allow account creation without the portal key
  bool lowPower;     // lower Wi-Fi TX power for long power-bank runs
  String motd;       // short line shown on the login screen
};

SysConfig &sysConfig();
void configBegin();
bool configSave();
bool portalKeyCheck(const String &key);
bool portalKeySet(const String &key);

void wifiBegin();
void wifiApply();  // restart the AP with current settings
void netTick();

struct Station {
  uint8_t mac[6];
  uint32_t ip;
  int8_t rssi;
};
int stationList(Station *out, int max);
int stationCount();

void logEvent(const char *fmt, ...);
int eventCount();
bool eventAt(int i, uint32_t *uptimeS, uint32_t *epoch, const char **text);

void scheduleRestart(uint32_t inMs, const char *reason);
const char *lastRestartReason();
const char *resetReasonText();
uint32_t bootCount();
bool restartPending();
