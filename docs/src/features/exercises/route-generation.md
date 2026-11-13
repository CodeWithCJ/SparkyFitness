# Route Generation

SparkyFitness can generate a run, walk, ride or hike route for you: a loop or out-and-back of a distance you choose, or a route through points you pick. The result is a preview with turn-by-turn cues; saving it adds it to your saved routes.

Route generation is **optional and off until a routing provider is added**. Route options and route style are part of the same feature and come with the Valhalla provider. SparkyFitness doesn't ship a routing engine and the server needs no extra container or environment variable: you add a Valhalla routing service as an external provider, the same way you add Mealie or Hevy. Until one is added, the app reports the feature as unavailable.

---

## Which engine, and why Valhalla

SparkyFitness supports [Valhalla](https://valhalla.github.io/valhalla/) first. Valhalla returns turn-by-turn maneuvers directly, which map straight onto the cues a phone speaks or shows during a route, and it has separate pedestrian and bicycle profiles. It's a single container that builds its own routing graph from an OpenStreetMap extract, so it's easy to self-host. GraphHopper has a native round-trip algorithm but is heavier to self-host; OSRM is the simplest to run but returns no usable turn cues. Valhalla has no round-trip mode, so SparkyFitness builds loops itself: it places waypoints round a circle sized for your distance, asks the engine for the route, and, if the result is more than 10% off, resizes the circle and tries again (up to three requests).

The server talks to engines through a small `RoutingProvider` interface, so another engine can be added later without changing the endpoints.

---

## Turning it on

### Add a routing provider

1. In the web app, open **Settings → External Providers → Add**.
2. Choose the type **Valhalla routing** and give it a name.
3. Enter the **Valhalla server URL** of a server you run or have the right to use (see below). There is no default server: the box starts empty.
4. Enter an **API key** only if the service needs one (hosted services such as [Stadia Maps](https://stadiamaps.com) do). It is sent as the `api_key` query parameter, stored encrypted like the keys of other providers, never shown to anyone else and never logged.
5. Turn **Activate this provider** on and save.

It works at once: no restart. `GET /api/v2/routes/generate/capabilities` returns `"available": true` and the mobile app shows route generation and **Follow roads** the next time it checks (it re-checks every few minutes, or when you reopen the app).

The provider belongs to you, like any other. Sharing follows the usual rules for external providers: an admin can add one in **Admin → Global Provider Settings** to make it available to everyone on the server, and with the **Share Integrations** family permission your family members can use yours (see [Family & Friends Sharing](../family-friends-sharing.md)). A person's own active provider is used first, then a public or shared one. Generating and snapping routes is still always for the signed-in person only, with the limit of 10 requests per 10 minutes.

::: warning Your route points go to that server
To plan a route, the SparkyFitness **server** sends the start, end and waypoints (and, to find elevation, the resulting line) to the server you choose, which can see them. Use a server you trust, or run your own (below). Your phone never contacts the routing server directly, and your saved routes are never sent.
:::

### Which server to use

SparkyFitness does not suggest or default to any server. Pick one of these:

- **Your own Valhalla** (recommended for a shared server): no limits except your hardware and nobody else sees your routes. See [Running Valhalla locally](#running-valhalla-locally).
- **A hosted Valhalla service**, such as [Stadia Maps](https://stadiamaps.com): needs an API key. Its free plan is for development and **non-commercial use only**; commercial use needs a paid plan. Check their [pricing and limits](https://docs.stadiamaps.com/limits/) for the current quotas.
- **A server whose operator has agreed** to your use.

::: warning The public FOSSGIS Valhalla server is not for this
FOSSGIS runs a public Valhalla demo server (`valhalla1.openstreetmap.de`) for the OpenStreetMap community. Its maintainers have said it is not meant for production use by third parties, it applies strict rate limits that all your users would share (they come from your server's one address), and some endpoints, elevation included, have been switched off at times. It is fine for a quick personal test on your own account; do not point a server that other people use at it. We last checked this against the [Valhalla announcement thread](https://github.com/valhalla/valhalla/discussions/3373); the current rules are FOSSGIS's to set, so check with them.
:::

SparkyFitness identifies itself with a `User-Agent` starting `SparkyFitness/`, as public servers expect.

A loop request costs up to three engine calls (more with a route style that measures surface, which adds elevation and surface lookups), and asking for alternatives (below) costs up to three times that, which is another reason to run your own server for regular use.

If the provider's URL points at a private or LAN address, the usual rule for self-hosted providers applies: admins may, other users may not unless the operator allows it in **Admin → Global Provider Settings** (or `ALLOW_PRIVATE_NETWORK_FOOD_PROVIDERS=true`).

---

## Editing a route on the map

In the mobile app, **Routes → Draw** and **Edit route on map** (on a saved route) open the route editor. Tap the map to add points, tap the line to insert a point on it, drag a point to move it, and select a point to delete it. Undo, Redo and Clear cover every change. The **Satellite** button switches the map to the platform's satellite imagery.

With a routing engine configured, **Follow roads** snaps each stretch between points to roads or trails. Select a point and choose **Straight before** or **Straight after** to draw that stretch as a plain line (for a shortcut across a field, say). Moving a point re-routes only the stretches next to it, and stretches of a saved route you have not touched keep the line they had. Without a routing engine every stretch is a straight line.

A route takes up to 100 points. A saved route opens thinned to at most 60 draggable points so it stays easy to handle; the stretches in between keep their saved line and turn cues until you edit them. **Edit route on map** and **Draw on a map** are only offered where the app can show a real map (iOS, and Android using keyless OpenStreetMap tiles or a Google Maps key).

### Request limits

The routing endpoint allows 10 requests per person per 10 minutes. The editor sends one request per run of consecutive snapped stretches (up to 20 stretches each), remembers every answer so undo, redo and switching back cost nothing, waits for you to stop editing before asking, and holds back at 8 requests per 10 minutes, leaving the rest for the Generate screen. If you reach that, the stretches that are not routed yet are drawn straight with a message and a **Retry** button, and routing resumes on its own once the window frees up. If the server answers that you are over its limit, routing waits until you press **Retry**. Your points are never lost; Save is disabled until every snapped stretch has its road line, or you turn **Follow roads** off to save them straight. Drawing a long route point by point with **Follow roads** on spends a request for each pause, so it is cheaper to place the points first and switch **Follow roads** on afterwards.

### Saving over a route

Saving an edited route replaces its line with `PATCH /api/v2/routes/:id`; its name, activity, source, the exercise entry it was created from and creation date are kept, and the distance and climb are recomputed from the new line.

## Running Valhalla locally

Add a service to your Compose file (or run it alongside) using the community-maintained [gis-ops image](https://github.com/gis-ops/docker-valhalla). It downloads an OpenStreetMap extract on first start and builds its tiles, which can take a few minutes to a few hours depending on the area.

```yaml
services:
  sparkyfitness-valhalla:
    image: ghcr.io/gis-ops/docker-valhalla/valhalla:latest
    restart: unless-stopped
    ports:
      - "8002:8002" # drop this if only SparkyFitness needs to reach it
    volumes:
      - valhalla-data:/custom_files
    environment:
      # Region extract(s) to download and build, space separated.
      tile_urls: https://download.geofabrik.de/europe/great-britain-latest.osm.pbf
      use_tiles_ignore_pbf: "True"
      build_elevation: "True" # optional: adds elevation gain (downloads SRTM tiles)
      server_threads: "2"

volumes:
  valhalla-data:
```

**What map extract it needs.** A single `.osm.pbf` covering everywhere you want routes: [Geofabrik](https://download.geofabrik.de/) publishes country and region extracts, and the smaller the extract the faster the build and the less memory and disk it uses. A start point outside the extract returns "no route". Build time and memory grow with the extract: a small region needs a few GB of RAM, a continent far more. Valhalla's [documentation](https://valhalla.github.io/valhalla/) covers image options and updating the extract.

Don't expose the engine to the internet: SparkyFitness is the only client it needs. Elevation (`build_elevation`) is optional; without it routes have no climb figure.

---

## API

All routes are owner-only, like the rest of saved routes: a delegated or family context is refused.

### `GET /api/v2/routes/generate/capabilities`

Returns what this server offers:

```json
{
  "available": true,
  "maxAlternatives": 3,
  "style": {
    "surface": true,
    "hilliness": true,
    "avoidSteps": true,
    "avoidBusyRoads": true
  },
  "stops": false,
  "source": "provider"
}
```

The answer is for the signed-in person. `source` is `"provider"` when the routing engine comes from a routing provider (their own, a public one or a shared one) and `null` when `available` is false, which means there is no routing provider. With the Valhalla provider `maxAlternatives` is 3 and every `style` field is true; with no routing provider they read 1 and false. `stops` is always false for now.

### `POST /api/v2/routes/generate`

Generates a **preview**; nothing is saved. Send either:

- **A loop or out-and-back**: `{ "mode": "loop", "start": { "lat", "lon" }, "activity": "run", "distanceM": 5000, "shape": "loop" | "out_and_back", "bearingDeg"?: 0-360 }`. Distance is 500 m to 100 km. Without `bearingDeg` the direction is random, so asking again gives a different route.
- **Waypoints**: `{ "mode": "waypoints", "start": {...}, "activity": "ride", "waypoints": [{ "lat", "lon" }, ...], "returnToStart"?: boolean }` with 1 to 20 waypoints, routed in order.

`activity` is `run`, `walk`, `ride` or `hike` (default `run`); `name` is optional. Both modes take an optional `style` (below), and a loop also takes `alternatives` (1 to 3, default 1).

The response is `{ "route": {...}, "options": [{ "route": {...}, "label": "flatter" | "moreTrail" | "shorter" | null, "trailShare": 0-1 | null }] }`. A route is `{ name, activity, source: "generated", points, cues, distanceM, elevationGainM }`, thinned and measured the same way a save does. `route` is always the first option, so a client that ignores `options` still works. To keep one, send its fields to `POST /api/v2/routes` (it accepts `source: "generated"`).

| Status | Meaning                                                                       |
| ------ | ----------------------------------------------------------------------------- |
| `400`  | Invalid body                                                                  |
| `422`  | The engine found no route (for example a start point off the map extract)     |
| `429`  | More than 10 generate requests in 10 minutes for this user; see `Retry-After` |
| `502`  | The engine was unreachable, failed, or refused the server's credentials       |
| `503`  | You have no routing provider (add one in Settings → External Providers)       |
| `504`  | The engine took longer than 20 seconds                                        |

The per-user limit is deliberately low because one request can cost several engine calls. It is counted in memory per server process.

---

## Route options

A loop request with `alternatives` above 1 returns up to that many **distinct** loops (never more than the provider's `maxAlternatives`). The server heads out in different directions, compares the results by measured overlap along their length and drops one that mostly repeats an earlier one, then tries another heading to make up the number. If some headings fail but at least one works, you get what worked.

Each option is labelled **Flatter**, **More trail** or **Shorter** only when its numbers back it up: Flatter needs the flattest option to climb at least 20% and 15 m less than the steepest; More trail needs at least 20% of its length on paths or unpaved ways and 15 percentage points more than any other; Shorter needs to be at least 5% and 200 m shorter than the longest. A label goes to one option, and an option gets one label. The share on paths comes from the routing engine's own surface data when it can be read; without it there is simply no More trail label.

Asking for three options costs up to three times as many engine calls (the first headings run in parallel). If fewer than three distinct loops come back, up to five headings are tried in all; the extra ones run one after another, each with its own resize requests, and stop early if the engine is failing rather than just finding no route.

## Route style

`style` is `{ surface: "any" | "trails" | "roads", hilliness: "any" | "flat" | "hilly", avoidSteps: boolean, avoidBusyRoads: boolean }`. The server keeps only what the provider supports (all of them, for Valhalla) and sends the rest as Valhalla `costing_options`; preferences change which route the engine picks, they don't guarantee one. Steps are never on a cycling route, so `avoidSteps` does nothing for a ride. A request without a style is sent to the engine exactly as before.

---
