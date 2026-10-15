import type { ActivityType, Threshold } from "../domain/types";

// =============================================================================
// ⚠️ PLACEHOLDER THRESHOLDS — NOT CONFIRMED FOR THIS PROJECT.
// These are illustrative stop-work limits so the rules engine has something to
// evaluate. Replace every value with the project's own limits (crane
// manufacturer load charts, site safety plan, specs) before the plenary, and
// update `source` so the decision panel cites the right authority.
// Units: wind/gust in m/s, precipitation in mm/h.
// =============================================================================

/** A forecast within this fraction of a limit is flagged "watch". */
export const WATCH_MARGIN = 0.8;

export const THRESHOLDS: Record<ActivityType, Threshold> = {
  "crane-lift": {
    maxWind: 9,
    maxGust: 13,
    stopForLightning: true,
    source: "PLACEHOLDER — replace with crane load chart / lift plan limit",
  },
  "steel-erection": {
    maxWind: 10,
    maxGust: 15,
    maxPrecip: 2.5,
    stopForLightning: true,
    source: "PLACEHOLDER — replace with site safety plan limit",
  },
  "concrete-pour": {
    maxPrecip: 2.5,
    maxWind: 15,
    stopForLightning: true,
    source: "PLACEHOLDER — replace with concrete spec / pour plan limit",
  },
  roofing: {
    maxWind: 9,
    maxGust: 13,
    maxPrecip: 0.5,
    stopForLightning: true,
    source: "PLACEHOLDER — replace with roofing manufacturer / safety plan limit",
  },
  "curtain-wall": {
    maxWind: 9,
    maxGust: 13,
    maxPrecip: 2.5,
    stopForLightning: true,
    source: "PLACEHOLDER — replace with glazing install plan limit",
  },
  "exterior-finishes": {
    maxWind: 12,
    maxPrecip: 0.5,
    stopForLightning: true,
    source: "PLACEHOLDER — replace with finish manufacturer limit",
  },
  earthwork: {
    maxPrecip: 6,
    stopForLightning: true,
    source: "PLACEHOLDER — replace with SWPPP / geotech guidance",
  },
  deliveries: {
    maxWind: 15,
    maxGust: 20,
    stopForLightning: true,
    source: "PLACEHOLDER — replace with logistics plan limit",
  },
  interior: {
    source: "Interior work, not weather-exposed",
  },
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  "crane-lift": "Crane lift",
  "steel-erection": "Steel erection",
  "concrete-pour": "Concrete pour",
  roofing: "Roofing",
  "curtain-wall": "Curtain wall",
  "exterior-finishes": "Exterior finishes",
  earthwork: "Earthwork",
  deliveries: "Deliveries",
  interior: "Interior",
};

/** Strictest limit per metric across all activity types (drives sensor colours). */
export const STRICTEST = (() => {
  const vals = Object.values(THRESHOLDS);
  const min = (k: "maxWind" | "maxGust" | "maxPrecip") =>
    Math.min(...vals.map((t) => t[k] ?? Infinity));
  return { wind: min("maxWind"), gust: min("maxGust"), precip: min("maxPrecip") };
})();
