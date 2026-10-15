# CLAUDE.md: Construction Twin · Storm Readiness

The closing app for the **IMGIS plenary**. Earlier segments each demo one of the six
ArcGIS Digital Twin building blocks; this app shows all six working together on
one question: *a storm is coming, so which of today's activities do we postpone, and how
do we tell the crews?*

## Decisions made (with the user)
- New standalone repo (not part of `arcgis-ai-js-demo`). Vite + React + TS,
  SDK 5.1.27, deploys to GitHub Pages via `.github/workflows/deploy.yml`.
- Site is in **Denver** (`America/Denver`). Exact coordinates are TBD; the
  defaults point at downtown Denver.
- Storm: **scripted by default** so the stage run is repeatable; live
  Open-Meteo forecast is an optional toggle.
- Decisions: **deterministic rules engine** (`src/domain/rules.ts`) plus an AI
  *explanation* layer. Which AI approach is still open (OOB `<arcgis-assistant>` with
  embeddings, or pre-written explanations). Don't add `@arcgis/ai-components`
  until the user decides.

## Still waiting on the user
- WebScene item ID (site, terrain, BIM, reality capture) and sharing level.
- Real schedule export and how activities link to BIM components
  (`Activity.componentFilter` is the hook).
- Earlier plenary segments' content, per building block, for callbacks.
- Real stop-work thresholds (every value in `config/thresholds.ts` is a
  PLACEHOLDER), storm timing and intensity, plenary length, presenter, and screen.

## Conventions
- All weather in SI internally (m/s, mm/h). Convert only in `lib/units.ts`.
- All times are **site-local instants**: use `lib/time.ts` (`atHour`, `hourOf`),
  never `Date#setHours`/`getHours` (those use the laptop's zone and once rendered
  the scene at night).
- Label invented data as such in code and in the UI footnotes.
- Dev server port **5180** (strict).

## Gotchas
- `<arcgis-scene>` `ground` is typed as `Ground` but accepts `"world-elevation"`.
  Cast it (see `SceneCanvas.tsx`).
- SDK 5.x needs `defineCustomElements()` from each package's `/loader` (done in
  `lib/arcgis.ts`).
- In the Claude desktop browser pane, a hidden pane stops WebGL rendering, so the
  scene screenshots black. Show the pane before verifying visuals.
