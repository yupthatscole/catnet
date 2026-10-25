# catnet security notes

catnet is treated as a real multi-user network, but it is a microcontroller
serving plain HTTP. This page says what is protected, how, and what is not.

## What is protected

| threat | protection | where |
|---|---|---|
| strangers joining | WPA2-PSK (CCMP) access point | `system.cpp` |
| joining catnet without permission | accounts need the **portal key** (unless an admin opens sign-up); first account becomes admin | `api_core.cpp` |
| password theft from storage | PBKDF2-HMAC-SHA256, 3000 iterations, 16-byte random salt per user; portal key stored the same way in NVS | `users.cpp`, `system.cpp` |
| brute force | per-device lockout after 5 failures, 30 s doubling to 15 min; the portal key shares the same counter; unknown usernames take the same time as real ones | `auth.cpp` |
| account spam | 3 new accounts per device per hour, 24 accounts max | `auth.cpp`, `config.h` |
| session fixation | a brand-new 128-bit token is issued at every login; any session the browser presented is destroyed | `api_core.cpp` |
| session hijacking | tokens from the hardware RNG, `HttpOnly; SameSite=Strict` cookies, sessions bound to the device's IP, 3 h idle / 24 h absolute expiry, "sign out everywhere", password changes end other sessions | `auth.cpp`, `web.cpp` |
| cross-site request forgery | every state-changing request must be a POST with a matching per-session `X-CSRF` token **and** an `Origin` equal to catnet's host; SameSite=Strict cookies on top | `web.cpp` |
| cross-site scripting | the pages never use `innerHTML` with data (everything goes through `textContent`); JSON output escapes `< > &`; a strict Content-Security-Policy (`script-src 'self'`, no inline scripts — the build refuses them); `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY` | `web/js/catnet.js`, `util.cpp`, `web.cpp`, `tools/build_web.py` |
| text spoofing | input is UTF-8-validated, control and bidi-override characters removed | `util.cpp cleanText` |
| unsafe uploads | extension allow-list, content sniffing for binary types, NUL check for text types; HTML/JS/SVG are only ever served (a) as downloads or (b) on `/~user/` under `Content-Security-Policy: sandbox`, which gives them an opaque origin with no access to catnet cookies or APIs | `api_files.cpp` |
| directory traversal | names are re-sanitised on every request and must survive sanitising unchanged; owners are numeric ids; files live in fixed per-user folders | `api_files.cpp`, `util.cpp safeFileName` |
| unauthorised deletion | files, posts, replies and messages can only be deleted by their owner or an admin; admins can't delete/disable themselves or the last admin | all `api_*.cpp` |
| resource exhaustion | request bodies capped at 24 KB, uploads streamed in 1.4 KB chunks with per-file (384 KB) and per-user (640 KB) limits and a reserved 96 KB of free space; chat token bucket (5 burst, 1 per 1.5 s); 25 requests/s per device; fixed-size session, chat and user tables; URI length capped | `config.h`, `web.cpp` |
| data loss | all structured files written to a temp file then renamed (atomic); users/web assets on separate partitions so re-flashing pages can't wipe data; recovery from a crash between write and rename | `storage.cpp`, `users.cpp` |
| hangs / crashes | loop watchdog (20 s, fed during long transfers), Wi-Fi watchdog restarts the AP, low-memory watchdog does a controlled restart, last reset reason shown on the system page | `main.cpp`, `system.cpp` |

## What is NOT protected (honest limits)

- **No HTTPS.** An ESP32 can do TLS, but only with a self-signed certificate
  every phone would warn about, and a big RAM/flash cost. Traffic is
  encrypted on the air by WPA2, but anyone who knows the Wi-Fi password can
  capture and decrypt other people's traffic (WPA2-PSK is shared-key). Treat
  catnet passwords as low value: **don't reuse a real password here.**
- **IP binding is weak** against an attacker on the same Wi-Fi who can spoof
  an address. It stops casual cookie copying, not a determined attacker.
- **Admins are trusted.** They can read the event log, see private file
  names, open private files, and moderate everything.
- **Game scores are self-reported** by the browser. A determined player can
  post any score.
- **The clock comes from visitors.** The ESP32 has no real-time clock; the
  first logged-in browser sets the time. A user could set it wrong once per
  boot; it only affects timestamps.
- **Captive-portal DNS** answers every name with catnet's address while
  captive mode is on. That's intended (it's how phones discover catnet), but it
  means apps on connected phones see "no internet" — also intended.
- **Physical access wins.** Anyone holding the board can read the flash
  (accounts are hashed, but files, chat and notes are not encrypted).

## Changing secrets

- First-boot defaults: `include/secrets.h` (git-ignored).
- After that: **admin → access** (portal key) and **admin → wi-fi**
  (network name/password; restarts catnet).
