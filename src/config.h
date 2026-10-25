// catnet — by cole (github.com/yupthatscole)
#pragma once

#define CATNET_VERSION "1.0.0"
#define CATNET_AUTHOR "cole"
#define CATNET_AUTHOR_URL "https://github.com/yupthatscole"
#define WEB_API_VERSION 1  // must match tools/build_web.py

#define AP_CHANNEL 6
#define AP_MAX_CLIENTS 8       // DHCP server in this core supports 8 stations
#define AP_LOCAL_DOMAIN "catnet.lan"

#define MAX_USERS 24
#define USERNAME_MIN 3
#define USERNAME_MAX 16
#define PASS_MIN 6
#define PASS_MAX 64
#define PBKDF2_ITERATIONS 3000
#define MAX_SESSIONS 20
#define SESSION_IDLE_MS (3UL * 60 * 60 * 1000)   // 3 h without activity
#define SESSION_MAX_MS (24UL * 60 * 60 * 1000)   // 24 h absolute
#define ONLINE_WINDOW_MS 45000UL                 // "online" = seen in last 45 s

#define LOGIN_FREE_FAILS 5          // failures before lockout starts
#define LOGIN_LOCK_BASE_MS 30000UL  // first lockout, doubles each failure
#define LOGIN_LOCK_MAX_MS (15UL * 60 * 1000)
#define REGISTER_PER_IP_PER_HOUR 3
#define REQ_PER_SEC_PER_IP 25       // crude flood guard (429 above this)
#define MAX_BODY_BYTES 24576        // non-upload POST bodies (an 8 KB save urlencodes to ~20 KB)

#define CHAT_RING 64
#define CHAT_TEXT_MAX 280           // bytes (UTF-8)
#define CHAT_BURST 5
#define CHAT_REFILL_MS 1500UL
#define CHAT_LOG_ROTATE 49152       // bytes
#define CHAT_PRESENCE_MS 25000UL

#define FILE_NAME_MAX 40
#define FILE_MAX_BYTES (384UL * 1024)
#define USER_QUOTA_BYTES (640UL * 1024)
#define FS_RESERVE_BYTES (96UL * 1024)   // keep free for chat, notes, saves
#define FILES_PER_USER 40

#define NOTES_PER_USER 40
#define NOTE_TITLE_MAX 60
#define NOTE_BODY_MAX 6000
#define BOARD_MAX_POSTS 50
#define BOARD_MAX_REPLIES 30
#define BOARD_TITLE_MAX 60
#define BOARD_BODY_MAX 1000
#define BOARD_REPLY_MAX 400
#define ANNOUNCE_MAX 8
#define ANNOUNCE_TEXT_MAX 200
#define SAVE_MAX_BYTES 8192
#define SCORES_PER_GAME 10

#define HEAP_CRITICAL 18000         // bytes free; sustained -> controlled restart
#define HEAP_CRITICAL_MS 30000UL
#define AP_CHECK_MS 10000UL
