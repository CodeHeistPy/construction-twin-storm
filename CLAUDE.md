# CLAUDE.md: Construction Twin · Storm Readiness

The closing app for the **IMGIS plenary**. Earlier segments each demo one of the six
ArcGIS Digital Twin building blocks; this app shows all six working together on
one question: *a storm is coming, so which of today's activities do we postpone, and how
do we tell the crews?*

## Decisions made (with the user)
- New standalone repo, Vite + React + TS, SDK 5.1.27, deploys to GitHub Pages
  via `.github/workflows/deploy.yml`.
- Storm: **scripted by default** (repeatable on stage); live Open-Meteo forecast
  is an optional toggle, applied hour-for-hour to the demo day.
- Decisions: **deterministic rules engine** (`src/domain/rules.ts`) plus an AI
  *explanation* layer. Which AI approach is still open; don't add
  `@arcgis/ai-components` until the user decides.
- Earlier plenary segments already showed **Foundation, Reality, Integration,
  Decision**. **Real-time Monitoring** and **Simulation** are new in this
  segment (`shownEarlier` in `config/buildingBlocks.ts`).

## Verified data facts (2026-10-16)
| Item | Value |
|---|---|
| Web scene | `7b4a2a0217b244568c74cbe636936c52` "Office_Park_GS", arcaec.maps.arcgis.com, **public** |
| Site | -104.991665, 39.699590 (Denver), `America/Denver` |
| Building with install dates | `Office_Park_Building_1` (Building Scene Layer) |
| Install field | `Installation_Date`, **string** `YYYY.MM.DD`, on 11 component sublayers |
| Range | 2026-03-16 → 2026-10-20, 144 install days, 10,664 dated components |
| Weather-exposed work | Curtain wall panels + mullions only, Mar 16 – Jul 23 |
| Malformed values | `202604.03`, `2026.7.02`, `2026.0425` (181 parts), normalised in code |
| Not public in the scene | `Bridges`, `Road_and_Rail`, `Roadway_Ground` (elevation): they fail to load |
| Other BSLs | Buildings 2–4 and Office_Park_Site have **no** install-date field |

Building 1's layer extent reaches -116° lon and 5,443 m z, so some element is
mis-georeferenced. It's harmless to the app but worth fixing in the model.

The install schedule is pre-extracted by `scripts/extract-bim-schedule.mjs` →
`src/data/bim-schedule.json` (no runtime dependency on stats endpoints).
Re-run it after the model is republished.

## Still waiting on the user
- The demo "today" date (`DEFAULT_DEMO_DATE` in `config/site.ts`, provisional
  2026-05-11). The real date shows a finished building.
- Real stop-work limits (every value in `config/thresholds.ts` is a PLACEHOLDER),
  work-shift hours (assumed 7:00–15:30), whether doors are exterior,
  storm timing and intensity, plenary length, presenter, and screen.
- Whether to keep the two SAMPLE logistics activities (crane pick, delivery).
- Sharing for the 3 non-public scene layers.

## Conventions
- All weather in SI internally (m/s, mm/h). Convert only in `lib/units.ts`.
- All times are **site-local instants**: use `lib/time.ts` (`atHour`, `hourOf`),
  never `Date#setHours`/`getHours`.
- Label invented data as such in code and in the UI (`source: "sample"`).
- Dev server port **5180** (strict).

## Gotchas
- **BSL sublayer renderers:** `await sublayer.load()` before setting
  `renderer`, or the load overwrites it. And `WebScene.loadAll()` rejects if any
  layer fails, so `.catch()` it before continuing.
- `esriConfig.request.useIdentity = false` when no OAuth app is configured:
  the buildings' associated feature services are secured, and without it the
  SDK pops a sign-in prompt. Popups fall back to binary attributes.
- `<arcgis-scene>` `ground` is typed as `Ground` but accepts `"world-elevation"`.
- SDK 5.x needs `defineCustomElements()` from each package's `/loader`.
- tiles.arcgis.com returns gzip bodies **without** `Content-Encoding`, so
  gunzip manually in scripts.
- In the Claude desktop browser pane, a hidden pane stops WebGL rendering and
  `goTo` animations never settle. Show the pane, or use `{ animate: false }`.
- **Denver is ~1,600 m up.** Never give camera positions or `goTo` centres a
  fixed or missing z (missing = sea level, i.e. underground). Use `onGround()`
  in `SceneCanvas.tsx` (terrain-sampled target, retries while ground loads).
  Never pass `cameraPosition`/`cameraTilt` props to `<ArcgisScene>`: they're
  re-applied on every React render and snap the camera back.
