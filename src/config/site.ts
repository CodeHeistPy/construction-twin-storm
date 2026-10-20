// =============================================================================
// Site + scene configuration. Values come from .env.local where possible so the
// real scene can be swapped in without code changes.
//
// Site confirmed by the user 2026-10-16: Office Park, Denver, at
// -104.991665, 39.699590. Scene: "Denver Office Park" 61a325c2… (arcaec org,
// public since 2026-10-16; replaced 7b4a2a02…).
// =============================================================================

import { todayIn, zonedMidnight } from "../lib/time";

const env = import.meta.env;

const num = (v: string | undefined, fallback: number) => {
  const n = v === undefined || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const SITE = {
  name: env.VITE_SITE_NAME?.trim() || "Office Park · Denver",
  longitude: num(env.VITE_SITE_LON, -104.991665),
  latitude: num(env.VITE_SITE_LAT, 39.69959),
  /** IANA zone of the site. All demo times are site-local, whatever the laptop's zone. */
  timeZone: env.VITE_SITE_TZ?.trim() || "America/Denver",

};

/**
 * Portal item id of the WebScene (public, so no sign-in needed). The app's own
 * copy (user, 2026-10-20): the original 61a325c2… now uses the Photorealistic
 * (Google 3D tiles) basemap, which needs a sign-in.
 */
export const WEBSCENE_ID = env.VITE_WEBSCENE_ID?.trim() || "fe60b2cfed534542a82d8cd8bb54df27";

export const PORTAL_URL = env.VITE_PORTAL_URL?.trim() || "https://arcaec.maps.arcgis.com";

/** Optional; only needed if the scene or layers are not public. */
export const OAUTH_APP_ID = env.VITE_ARCGIS_OAUTH_APP_ID?.trim() || "";

/**
 * ⚠️ PROVISIONAL demo "today", pending the user's pick. The BIM install dates
 * run Mar–Oct 2026, so the real date would show a finished building. May 11
 * mixes exterior work (32 curtain wall panels, 100 mullions) with interior work
 * (doors, lighting), which gives the storm something to postpone and something
 * to leave alone.
 */
export const DEFAULT_DEMO_DATE = "2026-05-11";

/**
 * The "today" of the demo (YYYY-MM-DD via VITE_DEMO_DATE, else the default).
 * VITE_DEMO_DATE=today uses the real date (needed for live-forecast mode).
 */
export function demoDay(): Date {
  const raw = env.VITE_DEMO_DATE?.trim() || DEFAULT_DEMO_DATE;
  const [y, m, d] = raw === "today" ? todayIn(SITE.timeZone) : raw.split("-").map(Number);
  return zonedMidnight(y, m, d, SITE.timeZone);
}

/** Display units. US conference audience assumed — change if not. */
export const UNITS: "imperial" | "metric" =
  env.VITE_UNITS === "metric" ? "metric" : "imperial";
