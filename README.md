# Construction Twin · Storm Readiness

The closing demo for the IMGIS plenary. A 3D construction site in Denver with
today's schedule and an incoming storm. The app decides which activities to
postpone and why. It closes the plenary's story of the six building blocks of a
Digital Twin in ArcGIS; the presenter calls the blocks out, nothing on screen does.
Three views: **Construction Progress** (4D build-out to today), **Schedule
Adjustment** (weather alert, postpone / proceed) and **Completed Building**.

Built with the ArcGIS Maps SDK for JavaScript 5.1 (`<arcgis-scene>`), React,
Vite and TypeScript. Modelled on
[dchantlos/construction-timelapse](https://dchantlos.github.io/construction-timelapse/progress.html).

## Run it

```bash
npm install
npm run dev
```

Dev server runs at http://localhost:5180. It loads the public Office Park web
scene (Denver) with no sign-in. Optional overrides go in `.env.local`
(copy `.env.example`).


```bash
npm test
```

## How it works

| Piece | File | Status |
|---|---|---|
| 3D scene, markers, storm cell, sun and weather | `src/components/SceneCanvas.tsx` | Office Park web scene; Building 1 coloured by install status |
| Today's schedule | `src/lib/bim.ts` + `src/data/bim-schedule.json` | From Building 1 `Installation_Date`; 2 sample logistics items in `schedule.sample.ts` |
| Scripted storm | `src/data/storm.scripted.ts` | Invented curve, tune to the story |
| Live forecast (optional) | `src/lib/liveWeather.ts` | Open-Meteo, no key |
| Postponement rules | `src/domain/rules.ts` + `src/config/thresholds.ts` | Engine tested; **limits are placeholders** |
| The tour | `src/config/tour.ts` | Three built-in views (cameras in `SceneCanvas.tsx`); `?stops=slides` plays the scene's own slides instead (`SLIDES.md`) |
| Underground utilities | `src/lib/utilities.ts` | Pipes at nominal depth, conflicts vs building footprints |
| 4D build-out | `src/components/BuildTimeline.tsx` + `src/lib/bim.ts` | Building 1 rises level by level, each trade a fixed number of levels behind the structure |
| Photorealistic finale | `src/lib/photoreal.ts` | Google 3D tiles on Completed Building, presenter sign-in only |

Decisions are deterministic: an activity is **postponed** when any limit is
reached during its working window, flagged **watch** within 80% of a limit, and
otherwise **proceeds**. All times are site-local (`VITE_SITE_TZ`), whatever
time zone the presenting laptop is set to.

Present by stepping through the views in the filmstrip (arrow keys or a clicker,
PageUp/PageDown). Space pauses the build-out.

**Presenter sign-in (optional).** The top-bar **Sign in** (ArcGIS Online, OAuth)
turns on Google's photorealistic 3D tiles for the Completed Building view; it needs
an org with Google 3D tiles enabled. Signed out, nothing changes. On a shared
machine, open the app with `?signout` afterwards to clear the stored session.

## Deploy to GitHub Pages

1. Create the GitHub repo `construction-twin-storm` and push `main`. If you use
   a different repo name, change `REPO` in `vite.config.ts`.
2. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. Under **Settings → Secrets and variables → Actions → Variables**, add the
   `VITE_*` values. They're public config, not secrets.
4. Add the Pages URL as a redirect URI on the OAuth credentials item (presenter
   sign-in).
