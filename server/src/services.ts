type Crossing = { id: string; name: string; area: string; lat: number; lng: number; description: string };
type Point = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;
const deg = (x: number) => x * Math.PI / 180;
const haversineKm = (a: Point, b: Point) => {
  const dLat = deg(b.lat - a.lat), dLng = deg(b.lng - a.lng);
  const lat1 = deg(a.lat), lat2 = deg(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
};

const crossings: Crossing[] = [
  { id: 'kollam-demo', name: 'Demo Crossing · Kollam', area: 'Prototype zone', lat: 8.8878, lng: 76.5954, description: 'Seed point for the hackathon demo. Replace with a surveyed crossing coordinate.' },
  { id: 'demo-north', name: 'Demo Crossing · North', area: 'Prototype zone', lat: 8.9008, lng: 76.6102, description: 'Sample crossing for testing multiple watches.' },
  { id: 'demo-east', name: 'Demo Crossing · East', area: 'Prototype zone', lat: 8.8731, lng: 76.6201, description: 'Sample crossing for testing map selection.' }
];

export const getCrossings = () => crossings;

const railradar = async (path: string) => {
  const key = process.env.RAILRADAR_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.railradar.in${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`RailRadar returned ${res.status}`);
  return res.json() as Promise<any>;
};

const interpolate = (a: Point, b: Point, t: number): Point => ({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });

const nearestPolylineIndex = (p: Point, coords: Point[]) => {
  let best = 0, bestDist = Infinity;
  coords.forEach((c, i) => { const d = haversineKm(p, c); if (d < bestDist) { bestDist = d; best = i; } });
  return best;
};

const distanceAlong = (coords: Point[], from: number, to: number) => {
  if (to <= from) return 0;
  let total = 0;
  for (let i = from; i < to; i++) total += haversineKm(coords[i], coords[i + 1]);
  return total;
};

const decodePolyline = (encoded: string): Point[] => {
  let index = 0, lat = 0, lng = 0; const out: Point[] = [];
  while (index < encoded.length) {
    let shift = 0, result = 0, byte = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 31) << shift; shift += 5; } while (byte >= 32);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 31) << shift; shift += 5; } while (byte >= 32);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
};

function mockTrain(trainNumber: string, crossing: Point, index: number) {
  const current = { lat: crossing.lat + 0.025 + index * 0.018, lng: crossing.lng - 0.032 + index * 0.014 };
  const eta = 7 + index * 8;
  return {
    trainNumber,
    trainName: index === 0 ? 'Demo Express' : 'Demo Intercity',
    status: 'live',
    currentLocation: { ...current, speedKmh: 62 },
    delayMinutes: index === 0 ? 4 : 0,
    etaMinutes: eta,
    crossingTime: new Date(Date.now() + eta * 60000).toISOString(),
    confidence: 'mock',
    message: index === 0 ? 'Mock train is approaching the monitored crossing.' : 'Mock train is on the monitored corridor.'
  };
}

export async function analyzeCrossing(crossing: Point & { name?: string }, trainNumbers: string[]) {
  const keyPresent = Boolean(process.env.RAILRADAR_API_KEY);
  if (!keyPresent) {
    return {
      mode: 'mock',
      note: 'Demo mode: add RAILRADAR_API_KEY to switch to live railway data.',
      predictions: trainNumbers.map((n, i) => mockTrain(n, crossing, i))
    };
  }

  const predictions = [];
  for (const trainNumber of trainNumbers) {
    try {
      const live = await railradar(`/v1/trains/${encodeURIComponent(trainNumber)}/live`);
      const data = live?.data;
      if (!data) continue;
      const routeResult = await railradar(`/v1/trains/${encodeURIComponent(trainNumber)}/route?format=geojson&stops=true`);
      const coords: Point[] = routeResult?.data?.geojson?.geometry?.coordinates?.map((x: number[]) => ({ lng: x[0], lat: x[1] })) ?? [];
      const stops = routeResult?.data?.stops ?? [];
      let current: Point | null = null;
      const stationCode = data.currentLocation?.stationCode;
      const stopIndex = stops.findIndex((s: any) => s.code === stationCode);
      if (stopIndex >= 0 && stops[stopIndex + 1]) {
        current = interpolate({ lat: stops[stopIndex].lat, lng: stops[stopIndex].lng }, { lat: stops[stopIndex + 1].lat, lng: stops[stopIndex + 1].lng }, Number(data.currentLocation?.segmentProgress ?? 0));
      } else if (coords.length) {
        current = coords[nearestPolylineIndex(crossing, coords)];
      }
      const speed = Number(data.currentLocation?.speedKmh ?? 55) || 55;
      let etaMinutes: number | null = null;
      if (current && coords.length) {
        const currentIndex = nearestPolylineIndex(current, coords);
        const crossingIndex = nearestPolylineIndex(crossing, coords);
        const km = distanceAlong(coords, currentIndex, crossingIndex);
        if (crossingIndex >= currentIndex) etaMinutes = (km / Math.max(15, speed)) * 60;
      }
      predictions.push({
        trainNumber,
        trainName: data.train?.name ?? `Train ${trainNumber}`,
        status: 'live',
        currentLocation: current ? { ...current, speedKmh: speed } : null,
        delayMinutes: Number(data.delayMinutes ?? 0),
        etaMinutes,
        crossingTime: etaMinutes == null ? null : new Date(Date.now() + etaMinutes * 60000).toISOString(),
        confidence: 'live-telemetry',
        message: data.nextHalt ? `Next halt: ${data.nextHalt.stationName}. Live position updated ${data.lastUpdatedAt ? 'recently' : 'now'}.` : 'Live running status received.'
      });
    } catch (error) {
      predictions.push({ trainNumber, trainName: 'Unavailable', status: 'not-found', currentLocation: null, delayMinutes: 0, etaMinutes: null, crossingTime: null, confidence: 'estimated', message: error instanceof Error ? error.message : 'Could not fetch this train.' });
    }
  }
  return { mode: 'live', note: 'Live mode: railway data supplied by RailRadar.', predictions };
}

const pointNearPolyline = (point: Point, coords: Point[], thresholdKm: number) => {
  if (!coords.length) return false;
  if (coords.some(c => haversineKm(point, c) <= thresholdKm)) return true;
  const latScale = 111.32;
  const lngScale = 111.32 * Math.cos(deg(point.lat));
  const px = (point.lng - point.lng) * lngScale;
  const py = (point.lat - point.lat) * latScale;
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = (coords[i].lng - point.lng) * lngScale;
    const ay = (coords[i].lat - point.lat) * latScale;
    const bx = (coords[i + 1].lng - point.lng) * lngScale;
    const by = (coords[i + 1].lat - point.lat) * latScale;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx - ay * dy) / len2));
    const cx = ax + t * dx, cy = ay + t * dy;
    if (Math.hypot(px - cx, py - cy) <= thresholdKm) return true;
  }
  return false;
};

const mockRoutes = (crossing: Point) => {
  const make = (offset: number, label: string, passes: boolean) => ({
    label, distanceMeters: 4200 + offset * 600, durationSeconds: 780 + offset * 120, passesCrossing: passes, routeLabel: label,
    polyline: `${encodeURIComponent('')}`
  });
  return [make(0, 'DEFAULT_ROUTE', true), make(1, 'ALTERNATIVE 1', false), make(2, 'ALTERNATIVE 2', false)];
};

export async function getRoadRoutes(origin: Point | string, destination: Point | string, crossing: Point) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { mode: 'mock', note: 'Demo route mode: add GOOGLE_MAPS_API_KEY for real Google route alternatives.', routes: mockRoutes(crossing) };

  const normalize = (value: Point | string) => typeof value === 'string' ? { address: value } : { location: { latLng: { latitude: value.lat, longitude: value.lng } } };
  const body = {
    origin: normalize(origin), destination: normalize(destination), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', computeAlternativeRoutes: true,
    languageCode: 'en-IN', regionCode: 'IN'
  };
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.routeLabels' }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Google Routes returned ${res.status}`);
  const data = await res.json() as any;
  const routes = (data.routes ?? []).map((r: any, i: number) => {
    const polyline = r.polyline?.encodedPolyline ?? '';
    return {
      label: i === 0 ? 'DEFAULT_ROUTE' : `ALTERNATIVE ${i}`,
      distanceMeters: Number(r.distanceMeters ?? 0), durationSeconds: parseDurationSeconds(r.duration), polyline,
      passesCrossing: pointNearPolyline(crossing, decodePolyline(polyline), 0.12), routeLabel: r.routeLabels?.[0] ?? undefined
    };
  });
  return { mode: 'live', note: 'Live road routing supplied by Google Routes API.', routes };
}

function parseDurationSeconds(duration: string | undefined) {
  if (!duration) return 0;
  const m = /^([0-9.]+)s$/.exec(duration);
  return m ? Math.round(Number(m[1])) : 0;
}
