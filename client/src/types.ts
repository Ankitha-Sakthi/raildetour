/* ── Existing railway-crossing types ────────────────────────────────── */

export type Crossing = {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  description: string;
};

export type TrainPrediction = {
  trainNumber: string;
  trainName: string;
  status: 'live' | 'scheduled' | 'not-found';
  currentLocation: { lat: number; lng: number; speedKmh?: number } | null;
  delayMinutes: number;
  etaMinutes: number | null;
  crossingTime: string | null;
  confidence: 'live-telemetry' | 'estimated' | 'mock';
  message: string;
};

export type RouteOption = {
  label: string;
  distanceMeters: number;
  durationSeconds: number;
  polyline: string;
  passesCrossing: boolean;
  routeLabel?: string;
};

/* ── Multimodal transit types ───────────────────────────────────────── */

export type TransportMode = 'train' | 'bus' | 'ferry' | 'auto';

export type TransitService = {
  id: string;
  mode: TransportMode;
  name: string;
  route: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  delayMinutes: number;
  status: 'on-time' | 'delayed' | 'cancelled';
  isDemo: boolean;
};

export type TransferRisk = 'HIGH' | 'MEDIUM' | 'LOW';

export type JourneyLeg = {
  service: TransitService;
  boardAt: string;
  alightAt: string;
  departureTime: string;
  arrivalTime: string;
  transferRisk?: TransferRisk;
  transferMinutes?: number;
  transferMessage?: string;
  alternative?: TransitService;
};

export type JourneyOption = {
  id: string;
  legs: JourneyLeg[];
  totalDurationMinutes: number;
  transfers: number;
  hasHighRisk: boolean;
  hasCrossingRisk: boolean;
  label: string;
};

export type CommunityReport = {
  id: string;
  type: 'delay' | 'schedule-change' | 'disruption';
  mode: TransportMode;
  route: string;
  message: string;
  delayMinutes?: number;
  timestamp: string;
  reporter: string;
};
