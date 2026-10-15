// Site-local time helpers. The demo laptop's time zone must not matter: the
// schedule, storm and sun position are all anchored to the SITE's time zone.

const HOUR = 3_600_000;

/** ms offset of `tz` from UTC at instant `t` (local − UTC). */
function tzOffset(t: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(t));
  const get = (k: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === k)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - t;
}

/** The instant of midnight on y-m-d (month 1-based) in `tz`. */
export function zonedMidnight(y: number, m: number, d: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffset(guess, tz);
  const off2 = tzOffset(t, tz);
  if (guess - off2 !== t) t = guess - off2;
  return new Date(t);
}

/** Today's y-m-d as seen in `tz`. */
export function todayIn(tz: string): [number, number, number] {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()).split("-").map(Number);
  return [y, m, d];
}

/** `day` is a site-midnight instant; returns the instant `hours` later. (Ignores DST-change days.) */
export const atHour = (day: Date, hours: number) => new Date(day.getTime() + hours * HOUR);

/** Hours since site midnight. */
export const hourOf = (day: Date, t: Date) => (t.getTime() - day.getTime()) / HOUR;

export const isSameDay = (day: Date, t: Date) => {
  const h = hourOf(day, t);
  return h >= 0 && h < 24;
};
