// catnet — by cole (github.com/yupthatscole)
#include "system.h"
#include <Preferences.h>
#include <WiFi.h>
#include <DNSServer.h>
#include <esp_wifi.h>
#include <esp_netif.h>
#include <esp_random.h>
#include <stdarg.h>
#include "config.h"
#include "secrets.h"
#include "util.h"
#include "users.h"

void catnetBeforeRestart();  // main.cpp: flush data before rebooting

static SysConfig g_cfg;
static Preferences g_prefs;
static DNSServer g_dns;
static bool g_dnsRunning = false;
static uint8_t g_keySalt[16];
static uint8_t g_keyHash[32];
static char g_lastReason[48] = "";
static uint32_t g_bootCount = 0;

SysConfig &sysConfig() { return g_cfg; }

static void hashPortalKey(const String &key) {
  esp_fill_random(g_keySalt, sizeof(g_keySalt));
  hashSecret(key, g_keySalt, PBKDF2_ITERATIONS, g_keyHash);
}

void configBegin() {
  g_prefs.begin("catnet", false);
  g_cfg.ssid = g_prefs.getString("ssid", CATNET_WIFI_SSID);
  g_cfg.wifiPass = g_prefs.getString("wpass", CATNET_WIFI_PASSWORD);
  g_cfg.channel = g_prefs.getUChar("chan", AP_CHANNEL);
  g_cfg.captive = g_prefs.getBool("captive", true);
  g_cfg.openSignup = g_prefs.getBool("open", false);
  g_cfg.lowPower = g_prefs.getBool("lowpow", false);
  g_cfg.motd = g_prefs.getString("motd", "");
  if (g_cfg.ssid.isEmpty() || g_cfg.ssid.length() > 31) g_cfg.ssid = "catnet";
  if (g_cfg.wifiPass.length() < 8 || g_cfg.wifiPass.length() > 63) {
    // somehow a bad password got saved. use a random one instead of a known default
    char fallback[24];
    snprintf(fallback, sizeof(fallback), "catnet-%08lx", (unsigned long)esp_random());
    g_cfg.wifiPass = fallback;
    Serial.printf("[cfg] wifi password was invalid, using %s for now\n", fallback);
  }
  if (g_cfg.channel < 1 || g_cfg.channel > 11) g_cfg.channel = AP_CHANNEL;

  if (g_prefs.getBytesLength("ksalt") == 16 && g_prefs.getBytesLength("khash") == 32) {
    g_prefs.getBytes("ksalt", g_keySalt, 16);
    g_prefs.getBytes("khash", g_keyHash, 32);
  } else {
    hashPortalKey(CATNET_PORTAL_KEY);  // first boot: key from secrets.h
    g_prefs.putBytes("ksalt", g_keySalt, 16);
    g_prefs.putBytes("khash", g_keyHash, 32);
  }
  String reason = g_prefs.getString("why", "");
  strncpy(g_lastReason, reason.c_str(), sizeof(g_lastReason) - 1);
  g_prefs.putString("why", "");
  g_bootCount = g_prefs.getUInt("boots", 0) + 1;
  g_prefs.putUInt("boots", g_bootCount);
}

bool configSave() {
  bool ok = true;
  ok &= g_prefs.putString("ssid", g_cfg.ssid) > 0;
  ok &= g_prefs.putString("wpass", g_cfg.wifiPass) > 0;
  g_prefs.putUChar("chan", g_cfg.channel);
  g_prefs.putBool("captive", g_cfg.captive);
  g_prefs.putBool("open", g_cfg.openSignup);
  g_prefs.putBool("lowpow", g_cfg.lowPower);
  g_prefs.putString("motd", g_cfg.motd);
  return ok;
}

bool portalKeyCheck(const String &key) {
  if (key.isEmpty() || key.length() > PASS_MAX) return false;
  uint8_t h[32];
  hashSecret(key, g_keySalt, PBKDF2_ITERATIONS, h);
  return constTimeEq(h, g_keyHash, 32);
}

bool portalKeySet(const String &key) {
  if (key.length() < 4 || key.length() > PASS_MAX) return false;
  hashPortalKey(key);
  return g_prefs.putBytes("ksalt", g_keySalt, 16) == 16 &&
         g_prefs.putBytes("khash", g_keyHash, 32) == 32;
}

static void startDns() {
  if (g_dnsRunning) g_dns.stop();
  g_dns.setErrorReplyCode(DNSReplyCode::NonExistentDomain);
  g_dns.setTTL(60);
  g_dnsRunning = g_dns.start(53, g_cfg.captive ? "*" : AP_LOCAL_DOMAIN, WiFi.softAPIP());
}

void wifiApply() {
  WiFi.softAPdisconnect(false);
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1),
                    IPAddress(255, 255, 255, 0));
  bool ok = WiFi.softAP(g_cfg.ssid.c_str(), g_cfg.wifiPass.c_str(), g_cfg.channel, 0,
                        AP_MAX_CLIENTS, false, WIFI_AUTH_WPA2_PSK, WIFI_CIPHER_TYPE_CCMP);
  WiFi.setTxPower(g_cfg.lowPower ? WIFI_POWER_11dBm : WIFI_POWER_17dBm);
  WiFi.setSleep(false);
  startDns();
  logEvent(ok ? "wi-fi up: %s ch%u" : "wi-fi FAILED to start (%s ch%u)", g_cfg.ssid.c_str(),
           g_cfg.channel);
}

void wifiBegin() {
  WiFi.persistent(false);
  wifiApply();
  Serial.printf("[net] AP '%s' on %s\n", g_cfg.ssid.c_str(), WiFi.softAPIP().toString().c_str());
}

int stationCount() { return WiFi.softAPgetStationNum(); }

int stationList(Station *out, int max) {
  wifi_sta_list_t list;
  if (esp_wifi_ap_get_sta_list(&list) != ESP_OK) return 0;
  int n = list.num < max ? list.num : max;
  esp_netif_pair_mac_ip_t pairs[AP_MAX_CLIENTS + 2];
  if (n > AP_MAX_CLIENTS + 2) n = AP_MAX_CLIENTS + 2;
  for (int i = 0; i < n; i++) {
    memcpy(pairs[i].mac, list.sta[i].mac, 6);
    pairs[i].ip.addr = 0;
  }
  esp_netif_t *ap = esp_netif_get_handle_from_ifkey("WIFI_AP_DEF");
  if (ap && n) esp_netif_dhcps_get_clients_by_mac(ap, n, pairs);
  for (int i = 0; i < n; i++) {
    memcpy(out[i].mac, list.sta[i].mac, 6);
    out[i].ip = pairs[i].ip.addr;
    out[i].rssi = list.sta[i].rssi;
  }
  return n;
}

struct Event {
  uint32_t up;
  uint32_t epoch;
  char text[68];
};
static Event g_events[32];
static int g_eventHead = 0;  // next write
static int g_eventCount = 0;

void logEvent(const char *fmt, ...) {
  Event &e = g_events[g_eventHead];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(e.text, sizeof(e.text), fmt, ap);
  va_end(ap);
  e.up = millis() / 1000;
  e.epoch = nowEpoch();
  g_eventHead = (g_eventHead + 1) % 32;
  if (g_eventCount < 32) g_eventCount++;
  Serial.printf("[event] %s\n", e.text);
}

int eventCount() { return g_eventCount; }

bool eventAt(int i, uint32_t *up, uint32_t *epoch, const char **text) {
  if (i < 0 || i >= g_eventCount) return false;
  const Event &e = g_events[(g_eventHead - 1 - i + 64) % 32];
  *up = e.up;
  *epoch = e.epoch;
  *text = e.text;
  return true;
}

static uint32_t g_restartAt = 0;
static char g_restartReason[48];
static uint32_t g_lowHeapSince = 0;
static uint32_t g_lastApCheck = 0;

void scheduleRestart(uint32_t inMs, const char *reason) {
  strncpy(g_restartReason, reason, sizeof(g_restartReason) - 1);
  g_restartAt = millis() + inMs;
  if (!g_restartAt) g_restartAt = 1;
  logEvent("restart scheduled: %s", reason);
}

bool restartPending() { return g_restartAt != 0; }
const char *lastRestartReason() { return g_lastReason; }
uint32_t bootCount() { return g_bootCount; }

const char *resetReasonText() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "power on";
    case ESP_RST_SW: return "software restart";
    case ESP_RST_PANIC: return "crash (panic)";
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT: return "watchdog";
    case ESP_RST_BROWNOUT: return "brownout (power dip)";
    case ESP_RST_DEEPSLEEP: return "deep sleep";
    case ESP_RST_EXT: return "reset pin";
    default: return "unknown";
  }
}

void netTick() {
  uint32_t now = millis();

  if (g_restartAt && (int32_t)(now - g_restartAt) >= 0) {
    g_prefs.putString("why", g_restartReason);
    catnetBeforeRestart();
    delay(200);
    ESP.restart();
  }

  if (now - g_lastApCheck > AP_CHECK_MS) {
    g_lastApCheck = now;
    bool apUp = (WiFi.getMode() & WIFI_MODE_AP) && WiFi.softAPIP() == IPAddress(192, 168, 4, 1);
    if (!apUp) {
      logEvent("access point down, restarting it");
      wifiApply();
    }
    if (ESP.getFreeHeap() < HEAP_CRITICAL) {
      if (!g_lowHeapSince) g_lowHeapSince = now ? now : 1;
      else if (now - g_lowHeapSince > HEAP_CRITICAL_MS && !g_restartAt)
        scheduleRestart(1000, "low memory recovery");
    } else {
      g_lowHeapSince = 0;
    }
  }
}
