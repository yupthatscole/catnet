# catnet HTTP API

All endpoints live under `/api/` and return JSON (`{"error": "..."}` on
failure). POST bodies are `application/x-www-form-urlencoded` (uploads are
`multipart/form-data`). Authenticated POSTs need the `X-CSRF` header from
`/api/me` and an `Origin` matching the host. The implementation is in
`src/api_*.cpp`; `tools/devserver.py` mirrors it for development, and
`tools/api_smoke_test.py` exercises it.

Access: **P** public · **A** logged in · **ADM** admin.

## accounts & sessions

| | path | access | params → result |
|---|---|---|---|
| GET | `/api/state` | P | → `setup, open, motd, ver, assets, in, wait` |
| POST | `/api/login` | P | `user, pass, t?` → me (sets `cn_sid` cookie) |
| POST | `/api/register` | P | `user, pass, key, t?` → me |
| POST | `/api/logout` | A | → `ok` |
| GET | `/api/me` | A | → `user{id,n,c,a,r,st,on,bio,since,seen,stats}, csrf, accent, prefs, admin, mustChange, clock` |
| POST | `/api/clock` | A | `t` (ms epoch) → sets the device clock if unknown |
| POST | `/api/profile` | A | any of `color, avatar, accent, prefs, status, bio` → me |
| POST | `/api/password` | A | `old, new` |
| POST | `/api/sessions/revoke` | A | → `closed` |
| GET | `/api/users` | A | → `users[]` |
| GET | `/api/users/get?n=` | A | → `user, files, site` |

## live

| | path | access | |
|---|---|---|---|
| GET | `/api/pulse?c=&chat=&typing=` | A | → `up, sta, clock, ann, on[], chat{last, unread}` or with `chat=1`: `chat{last, msgs[], here[], removed[]}` |
| POST | `/api/chat/send` | A | `text` (≤280 B, `/me ...` for actions) → `msg` |
| POST | `/api/chat/delete` | A | `id` (own message, or any as admin) |
| POST | `/api/chat/mute` | ADM | `id, min` (0 unmutes) |
| POST | `/api/chat/clear` | ADM | |

Chat message: `{i, t, u, k, n, c, x}` — kind `k`: 0 message, 1 join, 2 leave, 3 system, 4 action, 5 removed.

## files

| | path | access | |
|---|---|---|---|
| GET | `/api/files` | A | → `vol{id,label,t,u,max,quota,reserve,perUser}, mine{u,n}, files[{o,on,n,s,t,p}]` |
| POST | `/api/files/upload?p=0\|1` | A | multipart field `file` → `n, s` |
| GET | `/api/files/get?o=&n=&p=&dl=` | A | file bytes |
| POST | `/api/files/delete` | A | `o, n, p` |
| POST | `/api/files/move` | A | `o, n, p` (toggle public/private, owner only) |
| GET | `/~name/file` | P | public file of `name`, sandboxed (`/~name/` → `index.html`) |

## notes, board, announcements

| | path | access | |
|---|---|---|---|
| GET | `/api/notes` | A | → `notes[{id,title,pin,t,s,pv}]` |
| GET | `/api/notes/get?id=` | A | → `id,title,pin,t,body` |
| POST | `/api/notes/save` | A | `id (0 = new), title, body, pin` → `id, t` |
| POST | `/api/notes/delete` | A | `id` |
| GET | `/api/board` | A | → `posts[{id,title,by,c,a,t,last,n,pin}]` |
| GET | `/api/board/get?id=` | A | → post + `replies[{i,uid,by,c,a,t,body}]` |
| POST | `/api/board/post` | A | `title, body` → `id` |
| POST | `/api/board/reply` | A | `id, body` |
| POST | `/api/board/delete` | A | `id` |
| POST | `/api/board/delreply` | A | `id, i` |
| POST | `/api/board/pin` | ADM | `id, pin` |
| GET | `/api/announce` | A | → `items[{id,t,lv,by,text}]` |
| POST | `/api/announce/add` | ADM | `text, lv` |
| POST | `/api/announce/delete` | ADM | `id` |

## arcade

| | path | access | |
|---|---|---|---|
| GET | `/api/save?g=` | A | `g` ∈ `denied, signal, nine` → `g, d` (stored JSON or null) |
| POST | `/api/save` | A | `g, d` (valid JSON, ≤ 8 KB) |
| GET | `/api/scores[?g=]` | A | → `{game: {top[{n,c,s,t,x}], mine?, rank?}}` |
| POST | `/api/scores` | A | `g, s, x` → `best` + that game's board |

## system & admin

| | path | access | |
|---|---|---|---|
| GET | `/api/sys` | A | vital signs; admins also get `stations, events, cfg, fails` |
| GET | `/api/admin/users` | ADM | |
| POST | `/api/admin/user` | ADM | `id, action` ∈ `promote, demote, disable, enable, reset, delete` (`reset` → `temp`) |
| POST | `/api/admin/config` | ADM | any of `ssid, wpass, ch, captive, open, lowpow, motd` → `wifiRestart` |
| POST | `/api/admin/portalkey` | ADM | `key` |
| POST | `/api/admin/restart` | ADM | |
