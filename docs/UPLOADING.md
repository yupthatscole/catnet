# Uploading catnet to the ESP32

You need: the ESP32-WROOM-32 dev board, a micro-USB **data** cable, VS Code
with the PlatformIO extension. No internet is needed on the device itself.
(The first PlatformIO build downloads the ESP32 toolchain if it isn't already
installed — that part needs internet on your computer.)

## 1. Set your secrets (once)

Open `include/secrets.h`:

```c
#define CATNET_WIFI_SSID "catnet"          // network name
#define CATNET_WIFI_PASSWORD "your-wifi-password"  // WPA2 password, 8-63 chars
#define CATNET_PORTAL_KEY "your-portal-key"       // needed to create accounts
```

Pick something better than the example before you let other people join.
`secrets.h` is git-ignored; `secrets.example.h` is the template. If
`secrets.h` is ever missing, the build copies the template and warns you.

These are **first-boot defaults** only. After the first boot, an admin can
change the Wi-Fi name, Wi-Fi password and portal key on the **admin** page;
those are stored on the device (NVS) and win over `secrets.h`.

## 2. Upload the firmware

VS Code: PlatformIO sidebar → `esp32dev` → **General → Upload**.
Command line:

```bash
pio run -t upload
```

## 3. Upload the web pages (filesystem image)

VS Code: PlatformIO sidebar → `esp32dev` → **Platform → Upload Filesystem Image**.
Command line:

```bash
pio run -t uploadfs
```

Close the serial monitor first — it holds the port.

Every PlatformIO run rebuilds `data/` from `web/` (gzip + manifest), so you
never upload stale or half-saved pages. The build refuses empty files,
broken HTML and JavaScript syntax errors.

**Uploading the filesystem image does not erase user data.** Accounts, chat,
files, notes and saves live on a separate partition (`userdata`) that
`uploadfs` never touches. Re-flash the web pages as often as you like.

## 4. First boot

1. Open the serial monitor (115200 baud) to watch it start:
   ```bash
   pio device monitor
   ```
   You'll see `catnet online` and the portal address.
2. On your phone, join the Wi-Fi network (`catnet` by default).
3. With captive portal on (the default), most phones pop up a sign-in sheet
   automatically. Otherwise open **http://catnet.lan** or **http://192.168.4.1**.
4. The login page says *first boot*. Create your account with the **portal
   key**. The first account becomes the **admin**.
5. Everyone else uses **new account** with the same portal key (or the admin
   can turn on *open sign-up*).

Tip: captive sign-in sheets on iPhone/Android are tiny browsers with their own
cookies. After the first login, open `http://catnet.lan` in your normal
browser and bookmark it. Android may say "no internet, stay connected?" —
choose **yes**.

## Upgrading from catnet v0.2 (once)

This version uses a new partition table (`partitions.csv`) with a bigger app
slot and a separate user-data partition. Upload **both** firmware and the
filesystem image the first time. If the board behaves strangely afterwards
(boot loop, "web files missing" page that won't go away), erase it once and
upload both again:

```bash
pio run -t erase
pio run -t upload
pio run -t uploadfs
```

Erasing wipes accounts and files — only needed for this one-time migration.

## Sizes (this build)

| part | used | slot |
|---|---|---|
| firmware | 1.24 MB | 1.69 MB app partition (70%) |
| web assets | 123 KB gzipped (47 files, ~330 KB with LittleFS overhead) | 832 KB |
| user data | grows with use | 1.38 MB (files capped at 384 KB each, 640 KB per member) |
| static RAM | 82 KB | 320 KB |

## Troubleshooting

| symptom | fix |
|---|---|
| page says "the web files on the ESP32 are missing or damaged" | run **Upload Filesystem Image** |
| `/denied` or any page is blank | can't happen with the new build pipeline (empty files are rejected and the device checks every file's size at boot), but if it does: Upload Filesystem Image, then check **system → event log** |
| can't upload: "port busy" | close the serial monitor |
| can't upload: no port | try another USB cable (many are charge-only), install the CP210x/CH340 driver |
| forgot the Wi-Fi password | from a device that is still connected, set a new one on the admin page; otherwise change `CATNET_WIFI_PASSWORD`, then `pio run -t erase` and upload both (this erases data) |
| locked out of the only admin account | an admin can reset passwords; if no admin can log in, erase and start over |
| power bank turns itself off | some banks sleep below ~100 mA; turn off *battery saver radio* or use a bank with an "always on"/low-current mode |
| system page shows "brownout" resets | weak cable or power bank; try a shorter/thicker cable |
