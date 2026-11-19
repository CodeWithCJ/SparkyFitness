---
name: simulator-testing
description: Use whenever the user asks to test, try, run, demo or take screenshots of the app on an Android emulator, an iOS simulator or the web app, or to test offline behaviour, or says "test it for me", "run it on the simulator/emulator", "start the server/web/mobile". Covers checking what is already running, who starts what, driving the Android emulator (adb) and the iOS simulator (simctl + idb) with few tokens, going offline, checking the result on the server, and cleaning up. Also says which tools to ask the user to install.
---

# Simulator and Emulator Testing

Canonical copy. `.claude/skills/simulator-testing/SKILL.md` is a stub pointing here, the same way `CLAUDE.md` points at `AGENTS.md`.

How to run SparkyFitness on a simulator, drive it, and check what it did, without the user having to explain it again. Written from the offline-workouts testing (#1983) on an Android emulator and an iOS 27.2 simulator.

## 1. Ground rules

- **The user's processes are the user's.** Servers, Metro and builds the user started are not yours to stop. Kill only a PID you started yourself, and check its start time before killing anything on a port.
- **Ask who starts what.** Default: ask the user to start the server, the web app and the mobile build in their own terminal, so they can watch the output. They prefer to see builds (`pnpm android`, `pnpm ios`). Start things yourself, in the background, only when the user says you may. Then stop what you started when you finish and say so.
- **Never install software without the user's go-ahead.** If something below is missing, say what it is and why, give the exact command, and let the user run it (or approve it). If a command is refused by a permission check, stop and explain; do not look for a way round it.
- **Credentials:** ask the user for a test account. Never write a password into a file, a commit or a reply.
- **Leave the account as you found it.** If a test changes a setting (units, a preference), put it back. Tell the user about test data you created (workouts, entries) and do not delete it unless asked.
- **Token cost:** prefer text (accessibility dumps, JSON, SQL) to screenshots. When a screenshot is needed, downscale it first: `sips -Z 420 in.png --out out.png` (macOS). Wait with a bounded poll loop, not one long sleep.

## 2. What runs where

| Thing          | Where                                                                                      | Check                                                                          |
| -------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Server         | `SparkyFitnessServer/`, `pnpm start`, port 3010                                            | `lsof -tiTCP:3010 -sTCP:LISTEN`, `curl -s localhost:3010/api/health`           |
| Web app        | `SparkyFitnessFrontend/`, `pnpm dev`, port 8080                                            | `lsof -tiTCP:8080 -sTCP:LISTEN`                                                |
| Metro (mobile) | started by `pnpm android` / `pnpm ios` / `pnpm start` in `SparkyFitnessMobile/`, port 8081 | `curl -s localhost:8081/status`                                                |
| Dev app id     | `org.SparkyApps.SparkyFitnessMobile1.dev` (Android and iOS)                                | `adb shell pm list packages \| grep -i sparky`, `xcrun simctl listapps <udid>` |

The mobile app talks to the URL in the server settings (in this repo's dev setup `SPARKY_FITNESS_FRONTEND_URL` in the repo-root `.env`, often a hostname that proxies to the local server). **Check that URL, not just `localhost:3010`:** `curl -s -o /dev/null -w '%{http_code}' <url>/api/health`. A `502` means the proxy cannot reach the server, so the app will look offline even though the server is up.

Preflight before any test (one command each, report what is missing):

```bash
lsof -tiTCP:3010,8080,8081 -sTCP:LISTEN          # which of server / web / Metro are up
adb devices; emulator -list-avds                  # Android devices and virtual devices
xcodebuild -version; xcrun simctl list devices available   # iOS
```

## 3. Android emulator (adb)

Needs the Android SDK (`adb`, `emulator` on PATH) and a virtual device. If missing, ask the user to install Android Studio and create a device.

- **Start:** `emulator -avd <name>` (background), or the user starts it from Android Studio's Device Manager. Find its serial with `adb devices` (an emulator is `emulator-<port>`; the port is not always 5554) and pass `-s <serial>` to every adb command, or `export ANDROID_SERIAL=<serial>`; with a phone or a second emulator also connected, adb refuses commands without it. Wait for `adb -s <serial> shell getprop sys.boot_completed` to print `1`.
- **Install and run:** ask the user to run `pnpm android` in `SparkyFitnessMobile/`. If a physical phone is also connected over adb, Expo installs on the phone instead: `adb disconnect <host:port>` first. If the emulator reports `INSTALL_FAILED_INSUFFICIENT_STORAGE`, raise the virtual device's internal storage first. Uninstalling the dev app (`adb uninstall org.SparkyApps.SparkyFitnessMobile1.dev`) deletes its private storage, including the offline database with any workouts not yet uploaded, so do it only after the user approves it (check Settings, Offline for waiting uploads first).
- **Tunnels:** `adb reverse tcp:8081 tcp:8081` for Metro. Add `adb reverse tcp:3010 tcp:3010` only when the app's server URL is `localhost:3010`. A reverse tunnel reaches the Mac even with Wi-Fi and mobile data off, so **remove it for an offline test** (`adb reverse --remove tcp:3010`) and add it back afterwards.
- **Relaunch with the new JS:** `adb shell am force-stop <app>`, then `adb shell am start -a android.intent.action.VIEW -d "exp+sparkyfitnessmobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" <app>`. A saved file makes Metro reload and returns the app to its first screen.
- **Read the screen as text:** `adb shell uiautomator dump /sdcard/u.xml`, `adb exec-out cat /sdcard/u.xml`, then list `text` / `content-desc` with their `bounds` centres. Tap with `adb shell input tap X Y`, type with `adb shell input text "a%sb"` (`%s` is a space), back is `input keyevent 4`.
- **Screenshot:** `adb exec-out screencap -p > file.png`, then downscale.
- **Gotchas:** the dev client's floating gear button covers the top-right of headers, so a tap there opens the dev menu (close it, tap a little to the side). A tap sent while the app is reloading is lost; check the screen before the next step. Quote or avoid shell variables in `ui` helper scripts (zsh has no `timeout`).
- **Offline:** `adb shell svc wifi disable; adb shell svc data disable` (both: with mobile data on, the emulator can stay connected), and remove any `adb reverse tcp:3010` tunnel. Then check that the app's real server URL and port are unreachable from the emulator (`adb shell nc -z -w2 <host> <port>` fails; with a `localhost:3010` URL the tunnel is the only way in, so pinging `localhost` proves nothing), or relaunch the app and see "Can't reach your server", before starting the test. Back with `svc wifi enable` and `svc data enable` (and the tunnel). The app notices the way back on its own within about 30 seconds.
- **Inspect the phone's offline data** (debug build): `adb exec-out "run-as <app> cat files/SQLite/sparky-offline.db"` (also `-wal`, `-shm`) into a scratch folder, then read it with Python's `sqlite3`. The app log is the `app_logs` key in `databases/RKStorage` and is written out lazily; for live output add a temporary `console.log` and read `adb logcat -d | grep ReactNativeJS`, and remove it afterwards.

## 4. iOS simulator (simctl and idb)

Needs Xcode (check the version). Newer Xcode versions may have no `Simulator.app`; then everything goes through `xcrun simctl`.

- **Boot, launch, stop, screenshot:** `xcrun simctl boot <udid>`, `xcrun simctl launch <udid> org.SparkyApps.SparkyFitnessMobile1.dev`, `xcrun simctl terminate <udid> org.SparkyApps.SparkyFitnessMobile1.dev`, `xcrun simctl io <udid> screenshot file.png`. Always go through `xcrun`: `simctl` is not on `PATH`. Several simulators can share a name (different iOS versions): use the UDID from `xcrun simctl list devices available`.
- **Install and run:** ask the user to run `pnpm ios --device <udid>` in `SparkyFitnessMobile/` (without `--device` Expo uses the one booted simulator). `npx expo prebuild` rewrites the watch app icon (`SparkyFitnessMobile/targets/watch/Assets.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png`): that file must never be committed. Run `git status --short SparkyFitnessMobile/targets` first; if only that icon changed, restore just it (`git checkout -- <that path>`). If other files there have changes, keep them and tell the user.
- **Tapping needs idb.** `simctl` has no tap or typing command. Ask the user to run, once:

  ```bash
  brew trust --formula facebook/fb/idb-companion
  brew install idb-companion
  pip3 install --user fb-idb        # the command is ~/Library/Python/3.9/bin/idb
  ```

  idb is Meta's open-source tool (`github.com/facebook/idb`, MIT; the Homebrew tap is `facebook/fb`). Alternatives the user may prefer: Maestro, or no install (the user taps and you verify).

- **Run the companion** for the simulator in the background and stop it at the end: `idb_companion --udid <udid>`. Then `idb ui tap X Y --udid <udid>` and `idb ui text "..."`. Coordinates are in points (an iPhone 18 Pro is 402 by 874), not pixels: a screenshot downscaled to 420 high is a factor of about 2.08.
- **The app's screens are not in the accessibility tree** (`idb ui describe-all` lists only the app and the dev gear), so tap by coordinates and confirm each step with a small screenshot.
- **iOS asks for notification permission** on the first workout; allow it. A tap can land on a menu that just opened: close it before going on.
- **Offline on iOS:** the simulator shares the Mac's network, so the way to go offline is to stop the server (or the proxy in front of it). It is the user's process: ask them to stop and restart it, and tell you when.

## 5. Web app

Ask the user to run `pnpm dev` in `SparkyFitnessFrontend/` (port 8080; it proxies `/api`, `/health-data` and `/uploads` to the server on 3010). For checks without a browser, call the API (section 6). Drive the page with a browser tool only if one is available in the session; do not install one without asking.

## 6. Check the result on the server

Sign in with the test account to get a token, then read what the app wrote:

```bash
# Credentials come from the user. Read the password with a quoted heredoc: the
# text is taken literally, so an apostrophe, a quote or a backslash in it cannot
# break the command, and it is not in any process arguments. (In your own
# terminal use `read -rs PASS` instead.) Python then builds the JSON, which
# escapes it, and curl sends it on standard input.
IFS= read -r PASS <<'EOF'
<password>
EOF
export PASS
TOKEN=$(EMAIL='<email>' python3 -c 'import json,os;print(json.dumps({"email":os.environ["EMAIL"],"password":os.environ["PASS"]}))' \
  | curl -s -X POST localhost:3010/api/auth/sign-in/email -H 'Content-Type: application/json' -d @- \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
unset PASS
curl -s -H "Authorization: Bearer $TOKEN" "localhost:3010/api/v2/exercise-entries/by-date?selectedDate=YYYY-MM-DD"
curl -s -H "Authorization: Bearer $TOKEN" "localhost:3010/api/daily-summary?date=YYYY-MM-DD"
```

Dates are calendar days in the account's timezone; the Mac's `date +%F` can differ from the app's day around midnight. To prove "exactly once", count the sessions before and after, and poll with a bounded loop (about every 5 seconds, up to a couple of minutes).

## 7. The offline-workout recipe (what was run for #1983)

1. Online: sign in, open Settings, Offline, confirm a recent "Last refreshed" (or tap Refresh now). Note the session count on the server.
2. Go offline (Android: `svc wifi disable` and `svc data disable`, no `adb reverse` tunnel to the server, and check the server is unreachable; iOS: the user stops the server). Relaunch the app so it starts offline.
3. Dashboard shows "Can't reach your server" and "Start a saved workout offline". Open a saved workout, Start, complete a set, End workout, Keep preset, Done.
4. Diary: the workout shows "Waiting to upload"; the Library tab lists only Workout presets and Exercises; yesterday still shows its workouts (the saved week).
5. Back online (Android: `svc wifi enable` and `svc data enable`, and the tunnel if you used one; iOS: the user restarts the server). Within about 30 seconds the badge clears, Settings, Offline says "Nothing is waiting", and the server holds exactly one copy.
6. Other cases worth a pass when relevant: resume a waiting workout, edit a logged workout offline, discard offline, a change made on the server meanwhile (edit it through the API with the revision, then finish on the phone and pick keep phone / keep other / keep both), a pounds account started offline (set the preference through the API, refresh, go offline, check the numbers; set it back afterwards).

## 8. Clean up and report

- Stop only what you started (`TaskStop` for background tasks; the idb companion; an emulator you booted). Bring the emulator's network back on.
- Remove temporary debug output you added.
- Report: what ran on which platform, what passed, what was not tested, what you left behind (test data, installed tools with the commands to remove them), and anything the user needs to undo.
