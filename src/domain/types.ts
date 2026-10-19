// Core domain types. All weather values are stored in SI units (m/s, mm/h) and
// converted for display in `lib/units.ts`.

/** Kinds of work the postponement rules know about. Extend in thresholds.ts. */
export type ActivityType =
  | "crane-lift"
  | "steel-erection"
  | "concrete-pour"
  | "roofing"
  | "curtain-wall"
  | "exterior-finishes"
  | "earthwork"
  | "deliveries"
  | "interior";

export interface Activity {
  id: string;
  name: string;
  type: ActivityType;
  trade: string;
  /** Building zone / area label shown to the audience. */
  zone: string;
  start: Date;
  end: Date;
  /** Crew size if known (the BIM model has none). */
  crewSize?: number;
  /** BIM components installed by this activity. */
  components?: number;
  /** WGS84 position of the work face; z is metres above ground. */
  location: { longitude: number; latitude: number; z: number };
  /**
   * Optional SQL where clause selecting this activity's BIM components in the
   * building scene layer. Unused until the real scene + schedule link exist.
   */
  componentFilter?: string;
  /** Where the activity comes from: the BIM install dates, or invented sample data. */
  source: "bim" | "derived" | "sample";
  /** BIM sublayer names whose components make up this activity. */
  bimSublayers?: string[];
  /** SQL selecting this activity's components when they have no install date (derived work). */
  bimWhere?: string;
  /** Camera heading that best frames the work (e.g. from the south for the south face). */
  viewHeading?: number;
}

/** One hour of weather (observed or forecast). */
export interface WeatherHour {
  time: Date;
  /** Sustained wind, 10-min mean, m/s. */
  windSpeed: number;
  /** Peak gust, m/s. */
  windGust: number;
  /** Wind direction the wind is coming FROM, degrees. */
  windDirection: number;
  /** Precipitation rate, mm/h. */
  precipitation: number;
  /** Lightning within the stop radius during this hour. */
  lightning: boolean;
  temperature: number;
}

export type WeatherSource = "scripted" | "live";

export interface Threshold {
  /** Max sustained wind, m/s. */
  maxWind?: number;
  /** Max gust, m/s. */
  maxGust?: number;
  /** Max precipitation rate, mm/h. */
  maxPrecip?: number;
  /** Stop for lightning. */
  stopForLightning?: boolean;
  /** Where the number came from, shown in the decision panel. */
  source: string;
}

export type Decision = "go" | "watch" | "postpone";

export interface Reason {
  metric: "wind" | "gust" | "precipitation" | "lightning";
  /** Forecast value in SI units (m/s or mm/h); 1/0 for lightning. */
  value: number;
  limit: number;
  /** First hour the limit is reached during the activity window. */
  at: Date;
}

export interface ActivityAssessment {
  activity: Activity;
  decision: Decision;
  /** Limits exceeded (postpone) or within the watch margin (watch). */
  reasons: Reason[];
}
