# catnet

A complete, tiny, offline internet that runs on one **ESP32-WROOM-32** and a USB
power bank. Join the `catnet` Wi-Fi, open **http://catnet.lan** (or
`http://192.168.4.1`), and you get accounts, live chat, a message board, file
sharing with personal homepages, private notes, an arcade with three original
games, and Tuft — the cat who runs the place.

No internet, no server, no extra hardware, no external libraries.

made by **cole** · [github.com/yupthatscole](https://github.com/yupthatscole)

## What's inside

| area | what you get |
|---|---|
| **network** | WPA2 access point (up to 8 devices), captive-portal discovery (optional), `catnet.lan` DNS name, Wi-Fi watchdog |
| **accounts** | up to 24 users, PBKDF2-hashed passwords, admins, portal key to join, per-user profiles, coats, colours, stats, preferences |
| **chat** | live (1.5 s polling), history that survives reboots, join/leave, typing indicator, `/me`, mentions, mute/delete/sweep moderation |
| **board** | threads with replies, pinning, author/admin deletion |
| **files** | upload with progress, quotas, type allow-list + content sniffing, public/private, downloads, `/~you/` homepages (sandboxed) |
| **notes** | private notes with autosave and pinning |
| **arcade** | **DENIED.** (document-inspection thriller, 7 shifts, 8 endings), **SIGNAL** (oscilloscope tuning puzzle), **nine lives** (dice roguelite) — server-side saves and leaderboards |
| **system** | live vital signs, storage, memory, devices, event log, admin console (users, announcements, Wi-Fi, portal key, restart) |
| **Tuft** | animated from the original 4×8 sprite sheet: idle, happy, sleeping, confused, curious, thinking, surprised, walking; reacts to logins, actions and errors; wanders the home page |

## Quick start

1. Open this folder in VS Code with the PlatformIO extension.
2. Edit `include/secrets.h` (Wi-Fi name/password and the **portal key**).
3. PlatformIO → **Upload** (firmware), then **Upload Filesystem Image** (web pages).
4. Join the Wi-Fi, open `http://catnet.lan`, create the first account with the
   portal key — that account is the admin.

Full instructions, including first-time partition notes: **[docs/UPLOADING.md](docs/UPLOADING.md)**.

## Layout

```
src/            firmware (C++, Arduino core 3.x, no external libraries)
web/            web pages, styles, scripts, font, sprite (the source of truth)
data/           GENERATED from web/ on every PlatformIO run (gzipped + manifest)
partitions.csv  1.69 MB app · 1.38 MB user data · 832 KB web assets
include/        secrets.h (git-ignored) and secrets.example.h
tools/          build_web.py, dev server, font generator, test runners
test/           node tests (games) and native C++ tests (firmware logic)
docs/           uploading, security, API, development notes
```

## Documentation

- [docs/UPLOADING.md](docs/UPLOADING.md) — flashing, first boot, troubleshooting
- [docs/SECURITY.md](docs/SECURITY.md) — what is protected and what isn't
- [docs/API.md](docs/API.md) — every HTTP endpoint
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — architecture, dev server, tests, adding a microSD card

The original v0.2 sources are kept locally in `backup_v02/` (git-ignored, it
contains the old hard-coded passwords).
