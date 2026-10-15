import { SITE } from "../config/site";
import type { WeatherHour } from "../domain/types";

// Live forecast from Open-Meteo (free, no key, CORS-enabled) — the same source
// the reference construction-timelapse app uses. Lightning is approximated
// from WMO weather codes 95–99 (thunderstorm). This is the optional "live" mode;
// the plenary default is the scripted storm.

interface OpenMeteoHourly {
  time: number[];
  wind_speed_10m: number[];
  wind_gusts_10m: number[];
  wind_direction_10m: number[];
  precipitation: number[];
  temperature_2m: number[];
  weather_code: number[];
}

export async function fetchLiveWeather(signal?: AbortSignal): Promise<WeatherHour[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(SITE.latitude),
    longitude: String(SITE.longitude),
    hourly:
      "wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,temperature_2m,weather_code",
    wind_speed_unit: "ms",
    timeformat: "unixtime",
    timezone: "auto",
    past_days: "1",
    forecast_days: "2",
  }).toString();

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const { hourly } = (await res.json()) as { hourly: OpenMeteoHourly };
  return hourly.time.map((t, i) => ({
    time: new Date(t * 1000),
    windSpeed: hourly.wind_speed_10m[i] ?? 0,
    windGust: hourly.wind_gusts_10m[i] ?? 0,
    windDirection: hourly.wind_direction_10m[i] ?? 0,
    precipitation: hourly.precipitation[i] ?? 0,
    temperature: hourly.temperature_2m[i] ?? 0,
    lightning: (hourly.weather_code[i] ?? 0) >= 95,
  }));
}
