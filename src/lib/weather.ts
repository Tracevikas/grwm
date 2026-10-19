/** Weather for the Today stylist: from Open-Meteo (free, no key) or picked by hand. */
export const CONDITIONS = ["sunny", "cloudy", "rainy", "snowy", "windy"] as const;
export type Condition = (typeof CONDITIONS)[number];

export type Weather = { tempC: number; condition: Condition; place?: string };

export const CONDITION_LABELS: Record<Condition, string> = {
  sunny: "Sunny",
  cloudy: "Cloudy",
  rainy: "Rainy",
  snowy: "Snowy",
  windy: "Windy",
};

/** Used until we know better: a mild, cloudy day. */
export const DEFAULT_WEATHER: Weather = { tempC: 20, condition: "cloudy" };

/** WMO weather codes (what Open-Meteo returns) to our handful of conditions. */
export function conditionFromCode(code: number, windKmh = 0): Condition {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snowy";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rainy";
  if (windKmh >= 35) return "windy";
  if (code <= 1) return "sunny";
  return "cloudy";
}

/** How it feels, in a word, for the headline. */
export function feelOf(tempC: number) {
  if (tempC < 5) return "Cold";
  if (tempC < 13) return "Chilly";
  if (tempC < 20) return "Mild";
  if (tempC < 27) return "Warm";
  return "Hot";
}

export async function fetchWeather(lat: number, lon: number, signal?: AbortSignal): Promise<Weather> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,wind_speed_10m`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Weather service answered ${res.status}`);
  const data = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number } };
  const c = data.current;
  if (typeof c?.temperature_2m !== "number" || typeof c.weather_code !== "number") throw new Error("No current weather");
  return { tempC: Math.round(c.temperature_2m), condition: conditionFromCode(c.weather_code, c.wind_speed_10m) };
}
