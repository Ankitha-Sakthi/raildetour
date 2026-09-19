import type { Crossing, RouteOption, TrainPrediction } from './types';

const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) }
  });
  if (!res.ok) throw new Error((await res.text()) || `Request failed: ${res.status}`);
  return res.json();
};

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
