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

| Piece | File | Notes |
|---|---|---|
| 3D scene, activity pins, cameras, orbit | `src/components/SceneCanvas.tsx` | Office Park web scene; Building 1 coloured by build-out, schedule or decision |
| The three views | `src/config/tour.ts` | Cameras and sun in `SceneCanvas.tsx` (`SLIDE_VIEWS`) |
| Build sequence and today's work | `src/lib/bim.ts` + `src/data/*.json` | The whole frame first, then each floor fitted out from the bottom up: interior, glass, specialties, furniture |
| 4D build-out | `src/components/BuildTimeline.tsx` | A level a week, one level per step; space pauses |
| Sample site work | `src/data/schedule.sample.ts` | Invented, labelled "Sample" on screen |
| Scripted storm | `src/data/storm.scripted.ts` | Invented curve, repeatable on stage |
| Postponement rules | `src/domain/rules.ts` + `src/config/thresholds.ts` | Engine tested; **limits are placeholders** |
| Adapt the plan | `src/domain/replan.ts` | Postponed work moves to its first workable window |

Decisions are deterministic: an activity is **postponed** when any limit is
reached during its working window, flagged **watch** within 80% of a limit, and
otherwise **proceeds**. All times are site-local (`VITE_SITE_TZ`), whatever
time zone the presenting laptop is set to.

Present by stepping through the views with the bar at the bottom (arrow keys or a
clicker, PageUp/PageDown). Space pauses the build-out.

## Deploy to GitHub Pages

1. Create the GitHub repo `construction-twin-storm` and push `main`. If you use
   a different repo name, change `REPO` in `vite.config.ts`.
2. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. Optional: under **Settings → Secrets and variables → Actions → Variables**,
   add any `VITE_*` overrides. They're public config, not secrets.
