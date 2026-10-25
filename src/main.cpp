// catnet — by cole (github.com/yupthatscole)
#include <Arduino.h>
#include <WebServer.h>
#include <WiFi.h>
#include <esp_task_wdt.h>
#include "config.h"
#include "storage.h"
#include "system.h"
#include "users.h"
#include "web.h"

// boots everything, then loop() just serves pages and does chores once a second
static WebServer server(80);
static uint32_t lastHousekeeping = 0;

void catnetBeforeRestart() {
  usersSaveNow();
  server.stop();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n\ncatnet %s by %s (%s)\n", CATNET_VERSION, CATNET_AUTHOR, CATNET_AUTHOR_URL);
  Serial.printf("booting (reset: %s)\n", resetReasonText());

  storageBegin();
  configBegin();
  usersBegin();
  chatBegin();
  boardBegin();

  wifiBegin();

  registerCoreApi();
  registerChatApi();
  registerFilesApi();
  registerContentApi();
  webBegin(server);
  server.begin();

  logEvent("catnet online (boot #%lu, %s)", (unsigned long)bootCount(), resetReasonText());
  if (userCount() == 0) Serial.println("[catnet] no accounts yet: open the portal to create the admin");
  Serial.printf("[catnet] portal: http://%s  or  http://%s\n", WiFi.softAPIP().toString().c_str(),
                AP_LOCAL_DOMAIN);
  Serial.printf("[catnet] free heap after boot: %u bytes\n", (unsigned)ESP.getFreeHeap());

  esp_task_wdt_config_t wdt = {};
  wdt.timeout_ms = 20000;
  wdt.idle_core_mask = 1 << 0;
  wdt.trigger_panic = true;
  esp_task_wdt_reconfigure(&wdt);
  enableLoopWDT();
}

void loop() {
  server.handleClient();

  uint32_t now = millis();
  if (now - lastHousekeeping >= 1000) {
    lastHousekeeping = now;
    sessionsTick();
    chatTick();
    usersTick();
    netTick();
  }
  delay(1);  // yield: keeps the idle task (and power draw) happy
}
