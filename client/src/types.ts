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
