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

Dev server runs at http://localhost:5180. With no `.env.local`, the app runs on a
basemap of downtown Denver with sample data. Copy `.env.example` to
`.env.local` to point it at the real scene and site.

```bash
npm test
```

## How it works

| Piece | File | Status |
|---|---|---|
| 3D scene, markers, storm cell, sun and weather | `src/components/SceneCanvas.tsx` | Working; real WebScene not yet connected |
| Today's schedule | `src/data/schedule.sample.ts` | **Sample data**, replace with the real export |
| Scripted storm | `src/data/storm.scripted.ts` | Invented curve, tune to the story |
| Live forecast (optional) | `src/lib/liveWeather.ts` | Open-Meteo, no key |
| Postponement rules | `src/domain/rules.ts` + `src/config/thresholds.ts` | Engine tested; **limits are placeholders** |
| Six building blocks | `src/config/buildingBlocks.ts` | Draft wording |
| Run of show | `src/config/presentation.ts` | Draft steps and narration |

Decisions are deterministic: an activity is **postponed** when any limit is
reached during its working window, flagged **watch** within 80% of a limit, and
otherwise **proceeds**. All times are site-local (`VITE_SITE_TZ`), whatever
time zone the presenting laptop is set to.

Presentation mode: click **Present**, then use the arrow keys or a clicker
(PageUp/PageDown). Esc exits.

## Deploy to GitHub Pages

1. Create the GitHub repo `construction-twin-storm` and push `main`. If you use
   a different repo name, change `REPO` in `vite.config.ts`.
2. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. Under **Settings → Secrets and variables → Actions → Variables**, add the
   `VITE_*` values. They're public config, not secrets.
4. If the scene is secured, add the Pages URL as a redirect URI on the OAuth
   credentials item.
