# SparkyFitness for Garmin (Connect IQ)

The Garmin watch app, written in Monkey C. It is built on its own with the Connect IQ SDK: Expo prebuild never touches this folder, and the phone app does not bundle it.

What it does today: the Goals page (calorie ring, eaten and burned, the first three nutrients, Select or a tap for the full list) and its glance. The phone app is the only gateway; the watch never talks to the server. Protocol, storage keys and what is not there yet are in [`agent-docs/garmin.md`](../../agent-docs/garmin.md).

The glance only shows what the full app last received, with the time those figures are from: there is no background service yet, so a snapshot only reaches the watch's storage while the app is open on the watch. Opening the app (with the phone app running nearby) is what refreshes the glance; the Goals page says "as of" a time once its figures are more than 15 minutes old.

## Layout

| Path                                                        | What                                                                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `manifest.xml`                                              | App id (also `GARMIN_APP_ID` in the phone's Kotlin transport; change both together), products, permissions, languages |
| `monkey.jungle`                                             | Build file                                                                                                            |
| `resources/strings/strings.xml`                             | English strings (other languages come later through Weblate)                                                          |
| `resources/drawables/`                                      | 60 x 60 launcher icon, made from the app icon (`assets/icons/adaptiveicon.png`)                                       |
| `source/SparkyFitnessApp.mc`                                | App class: page loop, glance, starts the link                                                                         |
| `source/Link.mc`                                            | Connect IQ messaging and the protocol constants                                                                       |
| `source/SnapshotStore.mc`                                   | Storage keys (`meta`, one per topic) and the owner and day rules                                                      |
| `source/SyncTime.mc`                                        | When the stored figures are from (`meta.pushedAt`) and when they count as old                                         |
| `source/Goals.mc`, `Wire.mc`, `Format.mc`, `GoalPalette.mc` | Parsing, formatting and colours (pure; the glance uses them too)                                                      |
| `source/GoalsView.mc`, `NutrientList.mc`, `PageFactory.mc`  | The Goals page, its nutrient list and the page loop                                                                   |
| `source/GoalsGlanceView.mc`                                 | The glance                                                                                                            |
| `source/test/`                                              | `(:test)` unit tests                                                                                                  |

## What you need

- A Garmin account: the Connect IQ SDK Manager asks you to sign in before it downloads an SDK or device files.
- The [Connect IQ SDK Manager](https://developer.garmin.com/connect-iq/sdk/). In it, install an SDK (built with 9.3.0) and, under Devices, the **fēnix 8 43mm** (`fenix843mm`). Every product listed in `manifest.xml` needs its device files to build.
- Java 11 or newer on the `PATH` (the compiler is a Java program).
- Either Visual Studio Code with Garmin's **Monkey C** extension, or the `monkeyc` command from the SDK's `bin/` folder.
- A developer key (an RSA 4096 bit private key, DER encoded). In VS Code run **Monkey C: Generate a Developer Key**, or:

  ```bash
  openssl genrsa -out developer_key.pem 4096
  openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem -out developer_key.der -nocrypt
  ```

  Keep the key out of the repository. A store release must always be signed with the same key.

## Build

In VS Code, open `SparkyFitnessMobile/targets/garmin/` as the folder and run **Monkey C: Build for Device** (pick `fenix843mm`).

From a terminal, in this folder (`SDK` is the SDK folder the SDK Manager installed):

```bash
"$SDK/bin/monkeyc" -f monkey.jungle -d fenix843mm -y /path/to/developer_key.der \
  -l 3 -w -o bin/SparkyFitness.prg
```

`-l 3` is strict type checking and `-w` shows warnings; keep both clean. `bin/` is build output.

## Unit tests

The tests cover the pure parts: the snapshot rules, the day gate, parsing, energy conversion, formatting, the clock and the age rule, the row layout and colours. They run in the Connect IQ simulator:

```bash
"$SDK/bin/monkeyc" -f monkey.jungle -d fenix843mm -y /path/to/developer_key.der \
  -l 3 -w -t -o bin/SparkyFitnessTest.prg
"$SDK/bin/connectiq" &
"$SDK/bin/monkeydo" bin/SparkyFitnessTest.prg fenix843mm -t
```

In VS Code, the Test Explorer (the flask icon) runs the same tests. The snapshot tests write to the simulator's app storage.

## Try it on the watch

1. Build `bin/SparkyFitness.prg` as above.
2. Connect the watch over USB. It shows up as a media (MTP) device: on macOS use an MTP client such as OpenMTP.
3. Copy the PRG into `GARMIN/APPS/` on the watch and disconnect it. SparkyFitness appears in the watch's apps list, and its glance can be added to the glance loop.
4. On the phone, install a development build of the SparkyFitness Android app (`pnpm android` in `SparkyFitnessMobile/`) and Garmin Connect, with the watch paired in Garmin Connect. Until `GARMIN_WATCH_APP_RELEASED` in `src/constants/garmin.ts` is `true`, release builds (a GitHub or store release, `pnpm android:release`) keep Garmin off: they never start the Connect IQ link and hide the Garmin settings row, so the watch keeps saying "Open SparkyFitness on your phone". Open SparkyFitness on the phone (it only receives while its process is running), sign in, and open the app on the watch: it asks the phone for today's numbers.

There is no iOS bridge yet, so an iPhone cannot feed the watch.

Only one phone app package receives a Connect IQ app's messages at a time, and only builds that start the Garmin link compete for them: with two such builds of SparkyFitness on one phone, the last one to start takes them. Until `GARMIN_WATCH_APP_RELEASED` is `true` that means two development builds; a production build next to a development one takes nothing.

## Logs

- `System.println` output goes to `GARMIN/APPS/LOGS/<PRG name>.TXT`, but only if that file exists: first create an empty file named after the PRG (for `SparkyFitness.prg`, `GARMIN/APPS/LOGS/SparkyFitness.TXT`).
- An app crash (the "IQ!" icon) writes `GARMIN/APPS/LOGS/CIQ_LOG.YAML`.
- A device crash or reboot writes `GARMIN/ERR_LOG.txt`.
- A log over 5 KB is moved to `<name>.BAK` and a new one is started.

In the simulator, `System.println` goes to the console.
