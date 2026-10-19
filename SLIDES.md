# Slide spec: author these in Scene Viewer

The app plays the web scene's own slides (**Denver Office Park**,
`61a325c274ea4118999c9079c8b6e356`). You author the shots and layers here in
Scene Viewer; the app adds the live data behaviour, **matched by slide
title**. Keep the key words in the titles. The rest of the wording is yours.

Nothing on screen names the building blocks. You call them out as you go.

| # | Slide title (key words in bold) | Building block (verbal) | The question | The outcome to land |
|---|---|---|---|---|
| 1 | **Denver Office Park** | — (intro) | What are we looking at? | Design and construction twin: every block in one place |
| 2 | What's **underground** | Spatial Data Foundation | Where are the utilities, and how do they fit? | Conflicts found before we dig: no utility strikes |
| 3 | What's **there today** | Reality Mapping & Visualization | What's actually on site right now? | Verified existing conditions without a site visit |
| 4 | What's **going to be there** | System Interoperability & Integration | What are we building, in context? | Design checked against the real world before construction |
| 5 | **When** it will be there | Spatial Analysis & Scenario Simulation | Where are we on the schedule? | Progress known, the build played forward |
| 6 | What could **change** it | Real-time Monitoring | How will today's weather affect today's work? | Hours of warning, not a surprise |
| 7 | What we **do** about it | Applied Intelligence & Decision Support | What do we move, and who needs to know? | Delay held to a day; crews informed; work continues |
| 8 | **On track** *(optional close)* | All six | — | The outcome card |

## What to set on each slide

Scene Viewer slides save the camera, visible layers, basemap, ground
transparency and lighting. Suggested settings:

1. **Denver Office Park**: high oblique over the whole site. Ortho on,
   buildings on, mesh off, utilities off.
2. **What's underground**: low oblique looking across Buildings 1 and 2
   (that's where the conflicts are). **Ground transparency ~60%**. Utilities group
   **on** (storm, sanitary, and electrical once added), buildings on, mesh **off**,
   ortho on. *The app draws the pipes at depth and flags the conflicts.*
3. **What's there today**: same area, eye-level-ish. **3D mesh on**,
   buildings **off**, utilities off. Ground opaque.
4. **What's going to be there**: the development from the southeast. All
   buildings and site on, mesh off, ortho on.
5. **When it will be there**: Building 1, close enough to read floors.
   Building 1 and site on; Buildings 2–4 **off**. *The app runs the 4D build-out
   and the progress panel.*
6. **What could change it**: wide shot looking southwest, away from the
   site, toward where the storm comes from. Building 1 on. *The app brings in the storm,
   the alert and the forecast.*
7. **What we do about it**: Building 1 from the **north** (today's curtain
   wall band reads best from there). *The app shows the call; you click
   **Re-plan**, then **Notify crews**.*
8. **On track**: Building 1, slightly wider. *The app shows the outcome card.*

## Notes

- Order matters: the app plays slides in scene order.
- Title matching is case-insensitive. The rules live in `src/config/slides.ts`.
- Until these slides exist, the app falls back to built-in stops that follow
  the same storyline, so it always runs.
- Re-save the scene after editing slides; the app picks them up on reload.
