/* ═══════════════════════════════════════════════════════════════════
   RailDetour — Server Services
   Keeps ALL existing crossing/train/route logic unchanged.
   Adds: multimodal transit schedules, journey planning, community.
   ═══════════════════════════════════════════════════════════════════ */

// ─── Types ───────────────────────────────────────────────────────

type Crossing = { id: string; name: string; area: string; lat: number; lng: number; description: string };
type Point = { lat: number; lng: number };
type TransportMode = 'train' | 'bus' | 'ferry' | 'auto';
type TransitService = {
  id: string; mode: TransportMode; name: string; route: string;
  origin: string; destination: string;
  departureTime: string; arrivalTime: string;
  durationMinutes: number; delayMinutes: number;
  status: 'on-time' | 'delayed' | 'cancelled'; isDemo: boolean;
};
type TransferRisk = 'HIGH' | 'MEDIUM' | 'LOW';
type JourneyLeg = {
  service: TransitService; boardAt: string; alightAt: string;
  departureTime: string; arrivalTime: string;
  transferRisk?: TransferRisk; transferMinutes?: number;
  transferMessage?: string; alternative?: TransitService;
};
type JourneyOption = {
  id: string; legs: JourneyLeg[]; totalDurationMinutes: number;
  transfers: number; hasHighRisk: boolean; hasCrossingRisk: boolean; label: string;
};
type CommunityReport = {
  id: string; type: 'delay' | 'schedule-change' | 'disruption';
  mode: TransportMode; route: string; message: string;
  delayMinutes?: number; timestamp: string; reporter: string;
};

// ─── Utility helpers ─────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;
const deg = (x: number) => x * Math.PI / 180;
const haversineKm = (a: Point, b: Point) => {
  const dLat = deg(b.lat - a.lat), dLng = deg(b.lng - a.lng);
  const lat1 = deg(a.lat), lat2 = deg(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
};

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
function minToTime(m: number): string {
  const total = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════
// EXISTING: Crossings
// ═══════════════════════════════════════════════════════════════════

const crossings: Crossing[] = [
  { id: 'kollam-demo', name: 'Demo Crossing · Kollam', area: 'Prototype zone', lat: 8.8878, lng: 76.5954, description: 'Seed point for the hackathon demo. Replace with a surveyed crossing coordinate.' },
  { id: 'demo-north', name: 'Demo Crossing · North', area: 'Prototype zone', lat: 8.9008, lng: 76.6102, description: 'Sample crossing for testing multiple watches.' },
  { id: 'demo-east', name: 'Demo Crossing · East', area: 'Prototype zone', lat: 8.8731, lng: 76.6201, description: 'Sample crossing for testing map selection.' }
];

export const getCrossings = () => crossings;

// ═══════════════════════════════════════════════════════════════════
// EXISTING: Railway analysis (unchanged)
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// EXISTING: Road routes (unchanged)
// ═══════════════════════════════════════════════════════════════════

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

const mockRoutes = (_crossing: Point) => {
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

// ═══════════════════════════════════════════════════════════════════
// NEW: Demo transit schedules (Kollam / Kerala area)
// ═══════════════════════════════════════════════════════════════════

const demoServices: TransitService[] = [
  // ── Trains ──
  { id: 'TRN-001', mode: 'train', name: 'Kerala Express (12625)', route: 'Trivandrum Central → Kollam Junction', origin: 'Trivandrum Central', destination: 'Kollam Junction', departureTime: '06:30', arrivalTime: '07:45', durationMinutes: 75, delayMinutes: 25, status: 'delayed', isDemo: true },
  { id: 'TRN-002', mode: 'train', name: 'Venad Express (16301)', route: 'Kollam Junction → Alappuzha', origin: 'Kollam Junction', destination: 'Alappuzha', departureTime: '08:00', arrivalTime: '09:40', durationMinutes: 100, delayMinutes: 18, status: 'delayed', isDemo: true },
  { id: 'TRN-003', mode: 'train', name: 'Passenger (56377)', route: 'Kollam Junction → Kayamkulam Jn', origin: 'Kollam Junction', destination: 'Kayamkulam Junction', departureTime: '09:00', arrivalTime: '10:15', durationMinutes: 75, delayMinutes: 0, status: 'on-time', isDemo: true },
  { id: 'TRN-004', mode: 'train', name: 'Netravati Express (16346)', route: 'Kollam Junction → Ernakulam Jn', origin: 'Kollam Junction', destination: 'Ernakulam Junction', departureTime: '08:15', arrivalTime: '12:30', durationMinutes: 255, delayMinutes: 0, status: 'on-time', isDemo: true },
  { id: 'TRN-005', mode: 'train', name: 'Parasuram Express (16650)', route: 'Kollam Junction → Trivandrum Central', origin: 'Kollam Junction', destination: 'Trivandrum Central', departureTime: '14:20', arrivalTime: '15:45', durationMinutes: 85, delayMinutes: 0, status: 'on-time', isDemo: true },
  // ── KSRTC Buses ──
  { id: 'BUS-001', mode: 'bus', name: 'KSRTC Superfast', route: 'Kollam KSRTC Stand → Alappuzha', origin: 'Kollam KSRTC Stand', destination: 'Alappuzha', departureTime: '08:30', arrivalTime: '10:45', durationMinutes: 135, delayMinutes: 5, status: 'delayed', isDemo: true },
  { id: 'BUS-002', mode: 'bus', name: 'KSRTC Ordinary', route: 'Kollam KSRTC Stand → Trivandrum', origin: 'Kollam KSRTC Stand', destination: 'Trivandrum Central', departureTime: '07:00', arrivalTime: '09:15', durationMinutes: 135, delayMinutes: 0, status: 'on-time', isDemo: true },
  { id: 'BUS-003', mode: 'bus', name: 'KSRTC Fast Passenger', route: 'Kollam KSRTC Stand → Ernakulam', origin: 'Kollam KSRTC Stand', destination: 'Ernakulam Junction', departureTime: '08:45', arrivalTime: '13:00', durationMinutes: 255, delayMinutes: 10, status: 'delayed', isDemo: true },
  { id: 'BUS-004', mode: 'bus', name: 'KSRTC Town-to-Town', route: 'Kollam KSRTC Stand → Kottarakkara', origin: 'Kollam KSRTC Stand', destination: 'Kottarakkara', departureTime: '09:30', arrivalTime: '10:45', durationMinutes: 75, delayMinutes: 0, status: 'on-time', isDemo: true },
  { id: 'BUS-005', mode: 'bus', name: 'KSRTC Superfast', route: 'Trivandrum → Kollam KSRTC Stand', origin: 'Trivandrum Central', destination: 'Kollam KSRTC Stand', departureTime: '06:00', arrivalTime: '08:00', durationMinutes: 120, delayMinutes: 0, status: 'on-time', isDemo: true },
  // ── Ferries ──
  { id: 'FRY-001', mode: 'ferry', name: 'Backwater Cruise (SWTD)', route: 'Kollam Boat Jetty → Alappuzha', origin: 'Kollam Boat Jetty', destination: 'Alappuzha', departureTime: '10:30', arrivalTime: '18:30', durationMinutes: 480, delayMinutes: 0, status: 'on-time', isDemo: true },
  { id: 'FRY-002', mode: 'ferry', name: 'Local Ferry', route: 'Kollam Boat Jetty → Munroe Island', origin: 'Kollam Boat Jetty', destination: 'Munroe Island', departureTime: '09:00', arrivalTime: '09:45', durationMinutes: 45, delayMinutes: 20, status: 'delayed', isDemo: true },
  { id: 'FRY-003', mode: 'ferry', name: 'Local Ferry', route: 'Kollam Boat Jetty → Guhanandapuram', origin: 'Kollam Boat Jetty', destination: 'Guhanandapuram', departureTime: '08:30', arrivalTime: '09:15', durationMinutes: 45, delayMinutes: 0, status: 'on-time', isDemo: true },
  // ── Feeder Autos (on-demand) ──
  { id: 'AUT-001', mode: 'auto', name: 'Feeder Auto', route: 'Kollam Junction → Kollam Boat Jetty', origin: 'Kollam Junction', destination: 'Kollam Boat Jetty', departureTime: 'on-demand', arrivalTime: '', durationMinutes: 15, delayMinutes: 0, status: 'on-time', isDemo: true },
  { id: 'AUT-002', mode: 'auto', name: 'Feeder Auto', route: 'Kollam Junction → Kollam KSRTC Stand', origin: 'Kollam Junction', destination: 'Kollam KSRTC Stand', departureTime: 'on-demand', arrivalTime: '', durationMinutes: 10, delayMinutes: 0, status: 'on-time', isDemo: true },
  { id: 'AUT-003', mode: 'auto', name: 'Feeder Auto', route: 'Kollam Junction → Kollam Beach', origin: 'Kollam Junction', destination: 'Kollam Beach', departureTime: 'on-demand', arrivalTime: '', durationMinutes: 20, delayMinutes: 0, status: 'on-time', isDemo: true },
  { id: 'AUT-004', mode: 'auto', name: 'Feeder Auto', route: 'Kollam Beach → Kollam Boat Jetty', origin: 'Kollam Beach', destination: 'Kollam Boat Jetty', departureTime: 'on-demand', arrivalTime: '', durationMinutes: 12, delayMinutes: 0, status: 'on-time', isDemo: true },
  { id: 'AUT-005', mode: 'auto', name: 'Feeder Auto', route: 'Kollam KSRTC Stand → Kollam Boat Jetty', origin: 'Kollam KSRTC Stand', destination: 'Kollam Boat Jetty', departureTime: 'on-demand', arrivalTime: '', durationMinutes: 8, delayMinutes: 0, status: 'on-time', isDemo: true },
];

// ═══════════════════════════════════════════════════════════════════
// NEW: Journey builder
// ═══════════════════════════════════════════════════════════════════

type LegSpec = { serviceId: string; board: string; alight: string };

function svc(id: string): TransitService {
  return demoServices.find(s => s.id === id)!;
}

function makeJourney(id: string, label: string, specs: LegSpec[], crossingRisk: boolean): JourneyOption {
  const legs: JourneyLeg[] = [];

  for (let i = 0; i < specs.length; i++) {
    const s = { ...svc(specs[i].serviceId) };
    let dep: string, arr: string;

    if (s.departureTime === 'on-demand') {
      const prevArr = i > 0 ? legs[i - 1].arrivalTime : '08:00';
      dep = minToTime(timeToMin(prevArr) + 2);
      arr = minToTime(timeToMin(dep) + s.durationMinutes);
      s.departureTime = dep;
      s.arrivalTime = arr;
    } else {
      dep = minToTime(timeToMin(s.departureTime) + s.delayMinutes);
      arr = minToTime(timeToMin(s.arrivalTime) + s.delayMinutes);
    }

    legs.push({ service: s, boardAt: specs[i].board, alightAt: specs[i].alight, departureTime: dep, arrivalTime: arr });
  }

  // Transfer risk between consecutive legs
  for (let i = 0; i < legs.length - 1; i++) {
    const arrMin = timeToMin(legs[i].arrivalTime);
    const depMin = timeToMin(legs[i + 1].departureTime);
    const window = depMin - arrMin;
    legs[i].transferMinutes = window;
    legs[i].transferRisk = window < 10 ? 'HIGH' : window <= 20 ? 'MEDIUM' : 'LOW';

    if (legs[i].transferRisk === 'HIGH') {
      const curr = legs[i].service;
      const next = legs[i + 1].service;
      legs[i].transferMessage = `${curr.name} arrives at ${legs[i].arrivalTime}${curr.delayMinutes > 0 ? ` (${curr.delayMinutes} min late)` : ''}, leaving only ${Math.max(0, window)} min to board ${next.name}. High risk of missing this connection.`;
      // Find alternative service for the next leg's destination
      const alt = demoServices.find(a =>
        a.id !== next.id && a.destination === next.destination &&
        a.departureTime !== 'on-demand' && timeToMin(a.departureTime) > arrMin + 10
      );
      if (alt) legs[i].alternative = alt;
    } else if (legs[i].transferRisk === 'MEDIUM') {
      legs[i].transferMessage = `${window} min transfer window at ${legs[i].alightAt}. Allow time for platform changes.`;
    }
  }

  const firstDep = timeToMin(legs[0].departureTime);
  const lastArr = timeToMin(legs[legs.length - 1].arrivalTime);
  const total = lastArr >= firstDep ? lastArr - firstDep : (1440 - firstDep) + lastArr;

  return { id, legs, totalDurationMinutes: total, transfers: legs.length - 1, hasHighRisk: legs.some(l => l.transferRisk === 'HIGH'), hasCrossingRisk: crossingRisk, label };
}

// ═══════════════════════════════════════════════════════════════════
// NEW: Journey templates per origin-destination
// ═══════════════════════════════════════════════════════════════════

function journeys_TvmAlp(): JourneyOption[] {
  return [
    makeJourney('tvm-alp-1', 'FASTEST · Train → Train', [
      { serviceId: 'TRN-001', board: 'Trivandrum Central', alight: 'Kollam Junction' },
      { serviceId: 'TRN-002', board: 'Kollam Junction', alight: 'Alappuzha' },
    ], false),
    makeJourney('tvm-alp-2', 'RELIABLE · Train → Auto → Bus', [
      { serviceId: 'TRN-001', board: 'Trivandrum Central', alight: 'Kollam Junction' },
      { serviceId: 'AUT-002', board: 'Kollam Junction', alight: 'Kollam KSRTC Stand' },
      { serviceId: 'BUS-001', board: 'Kollam KSRTC Stand', alight: 'Alappuzha' },
    ], true),
    makeJourney('tvm-alp-3', 'SCENIC · Train → Auto → Ferry', [
      { serviceId: 'TRN-001', board: 'Trivandrum Central', alight: 'Kollam Junction' },
      { serviceId: 'AUT-001', board: 'Kollam Junction', alight: 'Kollam Boat Jetty' },
      { serviceId: 'FRY-001', board: 'Kollam Boat Jetty', alight: 'Alappuzha' },
    ], true),
    makeJourney('tvm-alp-4', 'BUS ONLY · Bus → Bus', [
      { serviceId: 'BUS-005', board: 'Trivandrum Central', alight: 'Kollam KSRTC Stand' },
      { serviceId: 'BUS-001', board: 'Kollam KSRTC Stand', alight: 'Alappuzha' },
    ], false),
  ];
}

function journeys_KlmAlp(): JourneyOption[] {
  return [
    makeJourney('klm-alp-1', 'TRAIN DIRECT', [
      { serviceId: 'TRN-002', board: 'Kollam Junction', alight: 'Alappuzha' },
    ], false),
    makeJourney('klm-alp-2', 'Auto → Bus', [
      { serviceId: 'AUT-002', board: 'Kollam Junction', alight: 'Kollam KSRTC Stand' },
      { serviceId: 'BUS-001', board: 'Kollam KSRTC Stand', alight: 'Alappuzha' },
    ], true),
    makeJourney('klm-alp-3', 'Auto → Ferry (scenic)', [
      { serviceId: 'AUT-001', board: 'Kollam Junction', alight: 'Kollam Boat Jetty' },
      { serviceId: 'FRY-001', board: 'Kollam Boat Jetty', alight: 'Alappuzha' },
    ], true),
  ];
}

function journeys_KlmErn(): JourneyOption[] {
  return [
    makeJourney('klm-ern-1', 'TRAIN DIRECT', [
      { serviceId: 'TRN-004', board: 'Kollam Junction', alight: 'Ernakulam Junction' },
    ], false),
    makeJourney('klm-ern-2', 'Auto → Bus', [
      { serviceId: 'AUT-002', board: 'Kollam Junction', alight: 'Kollam KSRTC Stand' },
      { serviceId: 'BUS-003', board: 'Kollam KSRTC Stand', alight: 'Ernakulam Junction' },
    ], false),
  ];
}

function journeys_KlmTvm(): JourneyOption[] {
  return [
    makeJourney('klm-tvm-1', 'TRAIN DIRECT', [
      { serviceId: 'TRN-005', board: 'Kollam Junction', alight: 'Trivandrum Central' },
    ], false),
    makeJourney('klm-tvm-2', 'Auto → Bus', [
      { serviceId: 'AUT-002', board: 'Kollam Junction', alight: 'Kollam KSRTC Stand' },
      { serviceId: 'BUS-002', board: 'Kollam KSRTC Stand', alight: 'Trivandrum Central' },
    ], false),
  ];
}

function journeys_KlmMunroe(): JourneyOption[] {
  return [
    makeJourney('klm-mun-1', 'Auto → Ferry', [
      { serviceId: 'AUT-001', board: 'Kollam Junction', alight: 'Kollam Boat Jetty' },
      { serviceId: 'FRY-002', board: 'Kollam Boat Jetty', alight: 'Munroe Island' },
    ], false),
  ];
}

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

export function planJourneyDemo(origin: string, destination: string, _departureTime: string, modes: TransportMode[]) {
  const oKey = normalizeKey(origin);
  const dKey = normalizeKey(destination);

  let allJourneys: JourneyOption[];

  if ((oKey.includes('trivandrum') || oKey.includes('tvm')) && (dKey.includes('alappuzha') || dKey.includes('alleppey'))) {
    allJourneys = journeys_TvmAlp();
  } else if ((oKey.includes('kollam') && !oKey.includes('ksrtc') && !oKey.includes('boat') && !oKey.includes('beach')) && (dKey.includes('alappuzha') || dKey.includes('alleppey'))) {
    allJourneys = journeys_KlmAlp();
  } else if (oKey.includes('kollam') && dKey.includes('ernakulam')) {
    allJourneys = journeys_KlmErn();
  } else if (oKey.includes('kollam') && (dKey.includes('trivandrum') || dKey.includes('tvm'))) {
    allJourneys = journeys_KlmTvm();
  } else if (oKey.includes('kollam') && dKey.includes('munroe')) {
    allJourneys = journeys_KlmMunroe();
  } else {
    // Fallback: show Trivandrum → Alappuzha as the best demo
    allJourneys = journeys_TvmAlp();
  }

  const filtered = allJourneys.filter(j => j.legs.every(l => modes.includes(l.service.mode)));

  return {
    journeys: filtered.length > 0 ? filtered : allJourneys,
    mode: 'mock' as const,
    note: filtered.length > 0
      ? 'Demo transit data for Kollam/Kerala area. Schedules and delays are simulated.'
      : 'No journeys match the selected modes. Showing all available options.'
  };
}

// ═══════════════════════════════════════════════════════════════════
// NEW: Community updates (in-memory, seeded with demo data)
// ═══════════════════════════════════════════════════════════════════

let reportCounter = 3;

const communityReports: CommunityReport[] = [
  { id: 'seed-1', type: 'delay', mode: 'bus', route: 'Kollam → Alappuzha (KSRTC Superfast)', message: 'Bus running about 15 min late due to traffic near Karunagappally.', delayMinutes: 15, timestamp: new Date(Date.now() - 25 * 60000).toISOString(), reporter: 'Commuter' },
  { id: 'seed-2', type: 'delay', mode: 'ferry', route: 'Kollam → Munroe Island Ferry', message: 'Ferry service delayed due to rough waters in Ashtamudi Lake.', delayMinutes: 20, timestamp: new Date(Date.now() - 45 * 60000).toISOString(), reporter: 'Commuter' },
  { id: 'seed-3', type: 'disruption', mode: 'train', route: 'Venad Express (Kollam → Shoranur)', message: 'Signal failure near Kayamkulam causing delays on this route.', delayMinutes: 18, timestamp: new Date(Date.now() - 60 * 60000).toISOString(), reporter: 'Station staff' },
];

export function getCommunityReports(): CommunityReport[] {
  return communityReports;
}

export function addCommunityReport(data: { type: CommunityReport['type']; mode: TransportMode; route: string; message: string; delayMinutes?: number }): CommunityReport {
  const report: CommunityReport = {
    id: `rpt-${++reportCounter}`,
    type: data.type,
    mode: data.mode,
    route: data.route,
    message: data.message,
    delayMinutes: data.delayMinutes,
    timestamp: new Date().toISOString(),
    reporter: 'Anonymous commuter',
  };
  communityReports.unshift(report);
  return report;
}
