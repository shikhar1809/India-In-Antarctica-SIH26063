/**
 * The browser half of the sign-in security check (functions/access.js has
 * the other half, and the reasons for the split).
 *
 * What the browser contributes is the one thing only it can: where the
 * device is. It asks the device (the browser shows its own permission
 * prompt), and turns coordinates into a place name. If the person declines,
 * or the device can't say, it falls back to the approximate location of the
 * network — and records that it did, so a log entry never presents an
 * IP-based guess as a GPS fix.
 *
 * Reverse geocoding uses BigDataCloud's client-side endpoint, which is free,
 * needs no key, and is built to be called from a browser.
 */

import { auth } from '../firebase';

const ACCESS_URL =
  (import.meta.env.VITE_ACCESS_API as string | undefined) ??
  'https://asia-south1-indiainantartica.cloudfunctions.net/access';

export type AccessStatus = 'granted' | 'unassigned' | 'revoked';

export interface CheckLocation {
  source: 'gps' | 'ip' | 'none';
  permission: 'granted' | 'denied' | 'unavailable';
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

/** Forces a fresh ID token — the "checking login credentials" step. A
 *  revoked or disabled Firebase account fails here rather than riding on a
 *  cached token for up to an hour. */
export async function verifyCredentials(): Promise<{ email: string | null }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  await user.getIdToken(true);
  return { email: user.email };
}

/** The IP address the server saw this request come from. */
export async function fetchIp(): Promise<string> {
  const res = await fetch(ACCESS_URL, { headers: await authHeader(), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`IP check returned ${res.status}`);
  return (await res.json()).ip as string;
}

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(Object.assign(new Error('unsupported'), { code: 2 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000,
    });
  });
}

async function reverseGeocode(lat?: number, lon?: number) {
  const qs = lat !== undefined && lon !== undefined
    ? `latitude=${lat}&longitude=${lon}&localityLanguage=en`
    : 'localityLanguage=en'; // no coordinates → the service locates by IP
  const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${qs}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`reverse geocode ${res.status}`);
  const b = await res.json();
  return {
    city: (b.city || b.locality || null) as string | null,
    region: (b.principalSubdivision || null) as string | null,
    country: (b.countryName || null) as string | null,
    lat: typeof b.latitude === 'number' ? b.latitude : null,
    lon: typeof b.longitude === 'number' ? b.longitude : null,
  };
}

export async function fetchLocation(): Promise<CheckLocation> {
  try {
    const pos = await position();
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    const place = await reverseGeocode(lat, lon).catch(() => ({ city: null, region: null, country: null }));
    return {
      source: 'gps', permission: 'granted', lat, lon, accuracyM: accuracy,
      city: place.city, region: place.region, country: place.country,
    };
  } catch (err) {
    const permission = (err as GeolocationPositionError)?.code === 1 ? 'denied' : 'unavailable';
    try {
      const approx = await reverseGeocode();
      return {
        source: 'ip', permission, lat: approx.lat, lon: approx.lon, accuracyM: null,
        city: approx.city, region: approx.region, country: approx.country,
      };
    } catch {
      return { source: 'none', permission, lat: null, lon: null, accuracyM: null, city: null, region: null, country: null };
    }
  }
}

/** "Chrome on Windows" — enough to recognise a device in the log, without
 *  recording the full user-agent string. */
export function describeDevice(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
      : /Firefox\//.test(ua) ? 'Firefox'
        : /Chrome\//.test(ua) ? 'Chrome'
          : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
      : /iPhone|iPad/.test(ua) ? 'iOS'
        : /Mac OS X/.test(ua) ? 'macOS'
          : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return `${browser} on ${os}`;
}

/** Records the check and gets the server's decision. */
export async function recordCheck(location: CheckLocation, device: string): Promise<{ status: AccessStatus; role: string | null; ip: string }> {
  const res = await fetch(ACCESS_URL, {
    method: 'POST',
    headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ location, device }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Access check returned ${res.status}`);
  return res.json();
}

export function describePlace(l: CheckLocation): string {
  const place = [l.city, l.region, l.country].filter(Boolean).join(', ');
  if (l.source === 'gps') return place || `${l.lat?.toFixed(3)}, ${l.lon?.toFixed(3)}`;
  if (l.source === 'ip') return `${place || 'Unknown'} · approximate`;
  return 'Unavailable';
}
