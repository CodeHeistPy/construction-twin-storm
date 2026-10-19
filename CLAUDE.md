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
- **Dates are irrelevant to the story** (user, 2026-10-16): the point is tracking
  progress and adapting to change. The UI says "Today"/"Tomorrow", never a
  date. `DEFAULT_DEMO_DATE` (2026-05-11) just picks a day with exterior + interior
  work; it is settled, not an open question.
- **Adapt the plan** (`domain/replan.ts`): postponed work moves to its first
  workable window (same shift, later day, no limit tripped). The knock-on
  assumes one crew per package, so the package completion slips by the same
  days. The scripted forecast includes a cleared "tomorrow".
- Earlier plenary segments already showed **Foundation, Reality, Integration,
  Decision**. **Real-time Monitoring** and **Simulation** are new in this
  segment (`shownEarlier` in `config/buildingBlocks.ts`).

## The tour (user, 2026-10-19): web scene SLIDES, no Present mode
Review feedback: the custom "Present" mode felt gimmicky. Now the app plays the
web scene's own slides (filmstrip at the bottom, arrows/clicker), and the
presenter calls out the building blocks verbally: **no block cues on screen**.
The user authors the slides in Scene Viewer from **SLIDES.md**; the app matches
slides by TITLE (`config/tour.ts` STOP_RULES) and adds data behaviour.
Until >= 4 storyline stops are authored, built-in stops run (`?stops=slides|builtin` forces).
Order: overview → underground (Foundation: utility conflicts) → there today
(Reality) → going to be there (Integration) → when (Simulation: 4D build-out)
→ what could change it (Real-time: weather) → what we do (Decision: re-plan +
notify, presenter clicks) → on track (outcome card).
Every block must tie to an outcome (user: "keep me honest").

## Verified data facts (2026-10-16)
| Item | Value |
|---|---|
| Web scene | `61a325c274ea4118999c9079c8b6e356` "Denver Office Park", arcaec.maps.arcgis.com, **public** (replaced 7b4a2a02… on 2026-10-16) |
| Reality capture | "3D mesh" (IntegratedMeshLayer) + "Ortho" (tiled imagery), both public |
| Utilities | "Denver Utilities" group: sanitary manholes/main, storm manholes/inlets/main (City of Denver open data), clipped to the site at load (`clipToSite`). **Electrical: user adding.** Storm mains have upelev/downelev (ft) + width/height (in); sanitary has diameter. Inverts do NOT match the scene ground (1,598.6 m invert vs 1,590.5 m Existing_Ground at Building 2), so pipes draw at a nominal 3 m depth; inverts shown as attributes only. |
| Utility conflicts (bbox footprints) | Building 1: 15 in VCP sanitary main. Building 2: two 48 in RCP storm mains + a storm manhole. |
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
- Real stop-work limits (every value in `config/thresholds.ts` is a PLACEHOLDER),
  work-shift hours (assumed 7:00–15:30), whether doors are exterior,
  storm timing and intensity, plenary length, presenter, and screen.
- Whether to keep the two SAMPLE logistics activities (crane pick, delivery).
- The slides themselves (SLIDES.md), the electrical layer, and sharing for Road_and_Rail / Bridges / Roadway_Ground (Roadway_Ground is removed at load: a failed ground layer stalls ground-relative layers).

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
- **Create the WebScene once and pass `map={map}`** to `<ArcgisScene>`. With
  `itemId`, the component aborted and re-created the map on re-renders (an
  endless load loop, and our layers landed on a discarded map).
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
- **Native widgets** (`<arcgis-layer-list>`, `<arcgis-building-explorer>`) sit in
  `<arcgis-expand>`s in the scene's `top-left` slot. Slotted components ignore
  `view.padding`, so `SceneCanvas` measures the overlay panels and sets
  `--ui-left`/`--ui-top` on `.scene` for CSS offsets. Building Explorer's
  `layers` must be set imperatively (all loaded BSLs, Building 1 first).
- **A failed ground layer stalls everything ground-relative** (layer views
  never finish). SceneCanvas removes failed ground layers at load.
- `slide.applyTo` hides every layer not in the slide, including ours:
  `restoreAppLayers(view)` re-shows them afterwards.
