# Developing catnet

## Architecture

```
phone browser ──Wi-Fi (WPA2)──> ESP32
                                 ├─ DNSServer          catnet.lan / captive portal
                                 ├─ WebServer :80      one RequestHandler (web.cpp)
                                 │    ├─ /api/*        JSON API (api_core/chat/files/content.cpp)
                                 │    ├─ /~user/*      sandboxed user hosting
                                 │    └─ everything else → gzipped assets from the web partition
                                 ├─ LittleFS "spiffs"   web assets (manifest.txt + *.gz)
                                 ├─ LittleFS "userdata" /sys users·chat·scores·announcements,
                                 │                      /f /fp files, /n notes, /b board, /s saves
                                 └─ NVS                 Wi-Fi settings, portal key hash, boot info
```

* **Synchronous `WebServer`, no external libraries.** Every request is
  handled to completion in `loop()`. Chat is "live" via short polling of
  `/api/pulse` (1.5 s while chat is open, ~9 s elsewhere, 30 s in the
  background) — cheaper and more robust on this chip than WebSockets.
* **Games run entirely in the browser.** The device only stores saves and
  leaderboards.
* **Fixed-size tables in RAM** (24 users, 20 sessions, 64 chat messages,
  50 board posts) keep memory predictable; everything else streams from flash.

| file | role |
|---|---|
| `src/main.cpp` | boot order, loop, watchdog |
| `src/config.h` | every limit in one place |
| `src/web.cpp` | request pipeline: flood guard → host check → session → CSRF/Origin → route; static files with ETag/gzip; error pages |
| `src/auth.cpp` | sessions, login lockout, registration/flood limits |
| `src/users.cpp` | accounts, PBKDF2, persistence |
| `src/storage.cpp` | the two filesystems, `Volume` abstraction, atomic writes |
| `src/system.cpp` | NVS settings, AP, DNS, watchdogs, event log |
| `src/api_*.cpp` | the API (see API.md) |
| `web/js/catnet.js` | shared client: API, shell/nav, Tuft, icons, avatars, dialogs, pulse |
| `web/js/denied-*.js`, `signal-*.js`, `nine-*.js` | games (`*-rules`/`*-core` = pure logic, unit-tested) |
| `tools/build_web.py` | web/ → data/ (validation, cache-busting, gzip, manifest) |

## Running the UI without the ESP32

```bash
python tools/devserver.py --fresh
```

Then open http://127.0.0.1:8080 (portal key in dev mode: `dev-key`). The dev
server serves the *built* `data/` exactly like the firmware (manifest, gzip,
CSP, login redirects) and implements the same API in Python, with state in
`tools/.devstate/`. It rebuilds `data/` when files in `web/` change. It is a
stand-in for UI work; the firmware is the real thing.

## Tests

```bash
node test/web/denied.test.js        # DENIED. rules engine: 35k forged visitors, story verdicts
node test/web/signal.test.js        # SIGNAL maths: reachability, lock tolerance
node test/web/nine.test.js          # nine lives: abilities + 1500 simulated runs (balance)
python tools/run_native_tests.py    # firmware util.cpp + auth.cpp compiled natively (pip install ziglang)
python tools/api_smoke_test.py      # 69 HTTP checks against the dev server
python tools/api_smoke_test.py --base http://192.168.4.1 --admin YOU --password PASS --key PORTALKEY
                                    # same checks against a real catnet (creates + deletes 2 test users)
python tools/build_web.py --check   # validate web/ without writing data/
pio run                             # firmware build (+ web build via the pre-script)
```

`test/` is excluded from `pio test` (`test_ignore` in platformio.ini) because
these are PC-side tests.

## Adding a microSD card later

File sharing never touches LittleFS directly; it goes through a `Volume`
(`src/storage.h`). To store shared files on a card:

1. Wire the card to the VSPI pins and add `#include <SD.h>`.
2. In `storage.cpp`, mount it (`SD.begin(csPin)`) and create a second
   `Volume`, e.g. `{"sd", "microSD card", &SD, "/catnet/f", "/catnet/fp",
   sdTotal, sdUsed, 8 * 1024 * 1024, 64 * 1024 * 1024, 1024 * 1024}`.
3. Return it from `filesVolume()` when the card mounted (fall back to the
   internal one otherwise).

`api_files.cpp`, quotas, the files page and the storage meters all read
their limits from the active `Volume`, so nothing else changes.

## Re-generating assets

* Font: `python tools/make_font.py` (needs `pip install fonttools`) writes
  `web/fonts/tuftpix.woff` from the glyph table in the script.
* Tuft's sprite: `web/img/tuft.png` is the original 320×576 sheet (4 frames ×
  8 rows of 80×72), re-encoded as a 13-colour palette PNG (2.9 KB, pixel-identical).
  Rows: 0 idle · 1 happy · 2 sleep · 3 confused · 4 curious · 5 thinking · 6 surprised · 7 walk.
