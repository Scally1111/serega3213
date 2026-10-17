# Serega V3

A deployable browser-based 3D online team FPS prototype built with Three.js, Node.js and WebSockets.

## Included
- Create a room or join by room code; invite URL is copied from the in-game button.
- Terrorists (T) vs Counter-Terrorists (CT), balanced auto-team assignment, live roster.
- TAB scoreboard, bots (up to 8 per room), custom avatar upload, nickname changes.
- Mouse look, configurable WASD keys, mouse sensitivity, sound volume/toggle, quality settings, fullscreen.
- Shift dash with cooldown, server-validated approximate hits, respawns, simple 3D arena.
- Render deployment blueprint.

## Run locally
Requires Node.js 20+.

```bash
npm install
npm start
```

Open http://localhost:3000 in a desktop browser. For multiplayer testing, open the same address in two browser windows.

## Deploy to Render
1. Push the contents of this folder to a Git repository.
2. In Render, choose **New + → Blueprint** and select that repository, or create a Node Web Service.
3. The included `render.yaml` defines the service. Render will install dependencies and run `npm start`.
4. Open the service's HTTPS URL. The client automatically uses secure WebSockets (`wss://`) on HTTPS.
5. Create a room and share the invitation link.

## Important production notes
This is a playable starter/prototype, not a promise of lag-free operation for every player. Real latency depends on players' geography, device performance, Wi-Fi, and the hosting plan. The server runs a 20 Hz room update loop and uses WebSockets, but it is a single-process in-memory service:
- Room state is lost when the server restarts or sleeps.
- A single Render instance hosts all active rooms; horizontal scaling needs a shared pub/sub/state layer (for example Redis) and sticky routing or a dedicated realtime architecture.
- Hit detection is deliberately simple; competitive production FPS needs server-side movement simulation, collision/raycasting, rate limits, abuse prevention, persistence, monitoring, and load tests.
- Uploaded avatars are kept as small data URLs in room memory and browser local storage; no account system or permanent avatar storage is included.
- The first-person tactical glove model is bundled as a UV-mapped GLB asset in `assets/tactical_gloves.glb`, with supporting material textures.

## Controls
- Mouse: look
- Left mouse: shoot
- Configurable forward/back/left/right keys
- Configurable dash key (default Shift)
- TAB: scoreboard (hold)
- ESC: pause/settings behavior


## Update: realism and controls
- Added more industrial warehouse details (ceiling trusses, bay signs and safety posts) and improved the first-person rifle silhouette with magazine, grip and handguard.
- Keyboard movement now remains responsive after resuming even if pointer lock is not yet available; click the game view to capture the mouse for looking around.
- Reduced camera bob to avoid excessive screen shake.
- Weapon keys: `1` rifle, `3` knife. `Shift` dash. `TAB` scoreboard.

## Технические исправления (Ultra Realistic foundation)

- Исправлена потенциальная остановка игрового цикла при обращении к отсутствующему `dashlabel`.
- WASD и переназначение клавиш работают через `KeyboardEvent.code`, поэтому не зависят от текущей языковой раскладки.
- Состояния удалённых игроков интерполируются между сетевыми обновлениями.
- Данные аватаров отправляются отдельным `roster`-сообщением, а не повторяются в каждом частом `state`-пакете.
- Сервер проверяет перемещение относительно коллайдеров карты и отклоняет слишком большие скачки координат.
- Проверка попадания учитывает вертикальный угол прицеливания и блокирование выстрела крупными объектами карты.
- Добавлен WebSocket heartbeat для очистки зависших соединений.

### Проверки

`node --check client.js` и `node --check server.js` проходят. Браузерный тест и нагрузочный тест Render в этой среде не выполнялись; перед публикацией проверьте запуск и игровой цикл в реальном браузере.

## Update: tactical glove material pass

- Added procedural leather albedo, normal and roughness maps generated locally in the browser, with fine grain, wear variation and stitch marks.
- Applied the maps to the first-person gloves for less plastic-looking highlights and more surface detail without downloading external assets.
- The hand geometry is still procedural low-poly geometry, not a scanned/rigged production asset; a custom GLB hand model would be the next fidelity step.


## Windows desktop EXE

A desktop wrapper is included. On Windows 10/11 x64 with Node.js 20+ installed, run `scripts\build-windows.bat` or follow `DESKTOP_BUILD_RU.md`. The installer is generated in `release/`. The first build downloads Electron and npm dependencies, so it requires internet access.

The desktop build runs a local game server on the same PC. Internet multiplayer with friends requires a publicly reachable hosted server; the local desktop build does not automatically make your PC an internet server.

## Публичный сервер Render
Смотри подробную инструкцию в `RENDER_PUBLIC_SERVER_RU.md`. Для Electron после создания Render-сервиса проверь URL `PUBLIC_GAME_SERVER` в `desktop/main.cjs` и пересобери установщик.
