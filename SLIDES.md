# Slide spec: author these in Scene Viewer

The app plays the web scene's own slides (**Denver Office Park**,
`61a325c274ea4118999c9079c8b6e356`). You author the shots and layers here in
Scene Viewer; the app adds the live data behaviour, **matched by slide
title**. Keep the key words in the titles. The rest of the wording is yours.

Nothing on screen names the building blocks. You call them out as you go.

| # | Slide title (key words in bold) | Building block (verbal) | The question | The outcome to land |
|---|---|---|---|---|
| 1 | What's **underground** | Spatial Data Foundation | Where are the utilities, and how do they fit? | Conflicts found before we dig: no utility strikes |
| 2 | What's **there today** | Reality Mapping & Visualization | What's actually on site right now? | Verified existing conditions without a site visit |
| 3 | What's **going to be there** | System Interoperability & Integration | What are we building, in context? | Design checked against the real world before construction |
| 4 | **When** will it be there | Spatial Analysis & Scenario Simulation | Where are we on the schedule? | Progress known, the build played forward |
| 5 | What could **change** it | Real-time Monitoring | How will today's weather affect today's work? | Hours of warning, not a surprise |
| 6 | What we **do** about it | Applied Intelligence & Decision Support | What do we move, and who needs to know? | Delay held to a day; crews informed; work continues |

## What to set on each slide

Scene Viewer slides save the camera, visible layers, basemap, ground
transparency and lighting. Suggested settings:

1. **What's underground**: low oblique looking across Buildings 1 and 2
   (that's where the conflicts are). **Ground transparency ~60%**. Utilities group
   **on** (storm, sanitary, and electrical once added), buildings on, mesh **off**,
   ortho on. *The app draws the pipes below grade and flags the conflicts.*
2. **What's there today**: same area, eye-level-ish. **3D mesh on**,
   buildings **off**, utilities off. Ground opaque.
3. **What's going to be there**: the development from the southeast. All
   buildings and site on, mesh off, ortho on.
4. **When will it be there**: Building 1, whole building in frame with some
   sky above it. Building 1 and site on; Buildings 2–4 **off**. *The app builds
   Building 1 from the ground up and slowly orbits the camera while it plays.*
5. **What could change it**: wide shot looking southwest, away from the
   site, toward where the storm comes from. Building 1 on. *The app brings in the
   storm, the alert and the forecast (and the radar loop, once it's in the scene).*
6. **What we do about it**: Building 1 from the **north** (today's curtain
   wall band reads best from there). *The app shows the call; you click
   **Re-plan**, then **Notify crews**.*

## Notes

- Order matters: the app plays slides in scene order. Slides whose titles
  match none of the above still play, with nothing added.
- Title matching is case-insensitive. The rules live in `src/config/tour.ts`.
- The app switches to your slides once at least 3 of these 6 exist. Until then
  it runs built-in stops with the same storyline. Add `?stops=slides` to the URL
  to force your slides.
- Re-save the scene after editing slides; the app picks them up on reload.
