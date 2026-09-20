import type { Crossing, RouteOption, TrainPrediction, JourneyOption, CommunityReport, TransportMode } from './types';

// In production (Vercel) set VITE_API_BASE_URL to the Render backend URL.
// In local dev it stays empty so the Vite proxy forwards /api to localhost:4000.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) }
  });
  if (!res.ok) throw new Error((await res.text()) || `Request failed: ${res.status}`);
  return res.json();
};

/* ── Existing crossing APIs ─────────────────────────────────────────── */

export const getCrossings = () => api<{ crossings: Crossing[] }>('/api/crossings');

export const analyzeCrossing = (payload: {
  crossing: { lat: number; lng: number; name: string };
  trainNumbers: string[];
}) => api<{ predictions: TrainPrediction[]; mode: 'live' | 'mock'; note: string }>('/api/analyze-crossing', {
  method: 'POST',
  body: JSON.stringify(payload)
});

export const getRoutes = (payload: {
  origin: { lat: number; lng: number } | string;
  destination: { lat: number; lng: number } | string;
  crossing: { lat: number; lng: number };
}) => api<{ routes: RouteOption[]; mode: 'live' | 'mock'; note: string }>('/api/routes', {
  method: 'POST',
  body: JSON.stringify(payload)
});

/* ── Multimodal transit APIs ────────────────────────────────────────── */

export const planJourney = (payload: {
  origin: string;
  destination: string;
  departureTime: string;
  modes: TransportMode[];
}) => api<{ journeys: JourneyOption[]; mode: 'mock'; note: string }>('/api/transit/plan', {
  method: 'POST',
  body: JSON.stringify(payload)
});

export const getCommunityUpdates = () =>
  api<{ updates: CommunityReport[] }>('/api/community/updates');

export const submitCommunityUpdate = (payload: {
  type: 'delay' | 'schedule-change' | 'disruption';
  mode: TransportMode;
  route: string;
  message: string;
  delayMinutes?: number;
}) => api<{ update: CommunityReport }>('/api/community/updates', {
  method: 'POST',
  body: JSON.stringify(payload)
});
