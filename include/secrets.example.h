// catnet first-boot secrets — TEMPLATE.
//
// Copy this file to include/secrets.h and change the values. secrets.h is
// git-ignored. If secrets.h is missing, the build copies this template so the
// firmware still compiles, and prints a warning.
//
// These are only FIRST-BOOT DEFAULTS. Once catnet is running, an admin can
// change the Wi-Fi name, Wi-Fi password and portal key from the Admin page;
// those runtime values are stored in NVS and take priority.
#pragma once

// Wi-Fi access point name (1-31 chars).
#define CATNET_WIFI_SSID "catnet"

// WPA2 password for the access point (8-63 chars).
#define CATNET_WIFI_PASSWORD "change-me-wifi"

// Portal key: required to create a catnet account. The first account created
// with this key becomes the admin.
#define CATNET_PORTAL_KEY "change-me-portal"
