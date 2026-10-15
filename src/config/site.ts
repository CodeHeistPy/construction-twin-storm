// =============================================================================
// Site + scene configuration. Values come from .env.local where possible so the
// real scene can be swapped in without code changes.
//
// The site is in DENVER (confirmed). ⚠️ The exact coordinates are NOT yet known:
// until VITE_SITE_LON/LAT are set, the app centres on downtown Denver.
// =============================================================================

import { todayIn, zonedMidnight } from "../lib/time";

const env = import.meta.env;

const num = (v: string | undefined, fallback: number) => {
  const n = v === undefined || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const SITE = {
  name: env.VITE_SITE_NAME?.trim() || "Denver site (exact location TBD)",
  longitude: num(env.VITE_SITE_LON, -104.9903),
  latitude: num(env.VITE_SITE_LAT, 39.7392),
  /** IANA zone of the site. All demo times are site-local, whatever the laptop's zone. */
  timeZone: env.VITE_SITE_TZ?.trim() || "America/Denver",
  isPlaceholder: !env.VITE_SITE_LON || !env.VITE_SITE_LAT,
};

/** Portal item id of the WebScene. Empty = basemap + world elevation only. */
export const WEBSCENE_ID = env.VITE_WEBSCENE_ID?.trim() || "";

export const PORTAL_URL = env.VITE_PORTAL_URL?.trim() || "https://www.arcgis.com";

/** Optional; only needed if the scene or layers are not public. */
export const OAUTH_APP_ID = env.VITE_ARCGIS_OAUTH_APP_ID?.trim() || "";

/**
 * The "today" of the demo. Pinning it (YYYY-MM-DD) keeps the scripted storm and
 * schedule aligned no matter what day the plenary runs. Defaults to today.
 */
export function demoDay(): Date {
  const raw = env.VITE_DEMO_DATE?.trim();
  const [y, m, d] = raw ? raw.split("-").map(Number) : todayIn(SITE.timeZone);
  return zonedMidnight(y, m, d, SITE.timeZone);
}

/** Display units. US conference audience assumed — change if not. */
export const UNITS: "imperial" | "metric" =
  env.VITE_UNITS === "metric" ? "metric" : "imperial";
