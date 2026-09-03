/**
 * WeatherAPI.js — live Antarctic weather, from Open-Meteo.
 *
 * Verified against Maitri's exact coordinates (70.77°S, 11.73°E) before
 * wiring this in: Open-Meteo genuinely has polar coverage (ERA5/ERA5-Land
 * reanalysis + ECMWF IFS forecast, both gap-free worldwide), no API key
 * required, generous free-tier limits. This is model/reanalysis data, not a
 * raw station anemometer reading — close to, but not identical to, what an
 * instrument at Maitri would log — which is an honest caveat, not a reason
 * not to use it: it is real atmospheric physics for that exact point on
 * Earth, not an invented number.
 *
 * Every caller of this must survive it failing: no API key means no SLA,
 * the user might be offline, and this is a browser fetch across an origin
 * that could be blocked by network policy in some deployment. Nothing in
 * the game may depend on this succeeding — it only ever refines the
 * station's already-sensible synthetic defaults.
 */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 5000;

/**
 * @param {number} lat  decimal degrees, negative = south
 * @param {number} lon  decimal degrees
 * @returns {Promise<{tempC:number, windKt:number, windDirDeg:number, snowfallCm:number, source:'live'|'unavailable'}>}
 */
export async function fetchRealWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,wind_speed_10m,wind_direction_10m,snowfall',
    wind_speed_unit: 'kn',
    timezone: 'UTC'
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const c = data.current;
    if (!c || typeof c.temperature_2m !== 'number') throw new Error('malformed response');

    return {
      tempC: c.temperature_2m,
      windKt: c.wind_speed_10m ?? 20,
      windDirDeg: c.wind_direction_10m ?? 200,
      snowfallCm: c.snowfall ?? 0,
      source: 'live'
    };
  } catch (err) {
    clearTimeout(timer);
    // Offline, blocked, or the service is down — the caller falls back to
    // the station's own hand-tuned synthetic values. Not fatal, not even
    // surfaced to the player; live weather is a bonus layer of authenticity,
    // not a dependency.
    console.warn('[WeatherAPI] live fetch unavailable, using synthetic defaults:', err.message);
    return { tempC: null, windKt: null, windDirDeg: null, snowfallCm: null, source: 'unavailable' };
  }
}
