# Construction Twin · Storm Readiness

The closing demo for the IMGIS plenary. A 3D construction site in Denver with
today's schedule and an incoming storm. The app decides which activities to
postpone and why, then drafts the notice to the crews. Each part of the app maps to one of
the six building blocks of a Digital Twin in ArcGIS, and presentation mode lights
them up as the story builds.

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
| Six building blocks | `src/config/buildingBlocks.ts` | Draft wording |
| The tour | `src/config/tour.ts` + `SLIDES.md` | Plays the web scene slides; behaviour by slide title |
| Underground utilities | `src/lib/utilities.ts` | Pipes at nominal depth, conflicts vs building footprints |
| 4D build-out | `src/components/BuildTimeline.tsx` | Building 1 assembles through its install dates |

Decisions are deterministic: an activity is **postponed** when any limit is
reached during its working window, flagged **watch** within 80% of a limit, and
otherwise **proceeds**. All times are site-local (`VITE_SITE_TZ`), whatever
time zone the presenting laptop is set to.

Present by stepping through the slides in the filmstrip (arrow keys or a clicker,
PageUp/PageDown). Author the slides in Scene Viewer from `SLIDES.md`.

## Deploy to GitHub Pages

1. Create the GitHub repo `construction-twin-storm` and push `main`. If you use
   a different repo name, change `REPO` in `vite.config.ts`.
2. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. Under **Settings → Secrets and variables → Actions → Variables**, add the
   `VITE_*` values. They're public config, not secrets.
4. If the scene is secured, add the Pages URL as a redirect URI on the OAuth
   credentials item.
