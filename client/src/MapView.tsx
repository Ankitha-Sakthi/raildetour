import { useEffect, useRef } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import type { Crossing, RouteOption, TrainPrediction } from './types';

const decodePolyline = (encoded: string): google.maps.LatLngLiteral[] => {
  let index = 0, lat = 0, lng = 0;
  const coordinates: google.maps.LatLngLiteral[] = [];
  while (index < encoded.length) {
    let shift = 0, result = 0, byte = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return coordinates;
};

export default function MapView({
  crossing,
  predictions,
  routes,
  onPickCrossing
}: {
  crossing: Crossing;
  predictions: TrainPrediction[];
  routes: RouteOption[];
  onPickCrossing: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<google.maps.MVCObject[]>([]);

  useEffect(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!key || !ref.current) return;
    let cancelled = false;
    (async () => {
      const loader = new Loader({ apiKey: key, version: 'weekly' });
      await loader.importLibrary('maps');
      if (cancelled || !ref.current) return;
      const map = new google.maps.Map(ref.current, {
        center: { lat: crossing.lat, lng: crossing.lng },
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: 'greedy'
      });
      mapRef.current = map;
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) onPickCrossing(e.latLng.lat(), e.latLng.lng());
      });
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    overlaysRef.current.forEach(o => {
      if ('setMap' in o && typeof (o as any).setMap === 'function') (o as any).setMap(null);
    });
    overlaysRef.current = [];

    const marker = new google.maps.Marker({ map, position: { lat: crossing.lat, lng: crossing.lng }, title: crossing.name, label: '🚧' });
    overlaysRef.current.push(marker);

    predictions.forEach(p => {
      if (!p.currentLocation) return;
      const m = new google.maps.Marker({ map, position: p.currentLocation, title: `${p.trainNumber} ${p.trainName}`, label: '🚆' });
      overlaysRef.current.push(m);
    });

    routes.forEach((route, idx) => {
      if (!route.polyline) return;
      const line = new google.maps.Polyline({
        map,
        path: decodePolyline(route.polyline),
        strokeOpacity: route.passesCrossing ? 0.85 : 0.65,
        strokeWeight: idx === 0 ? 5 : 4
      });
      overlaysRef.current.push(line);
    });

    map.panTo({ lat: crossing.lat, lng: crossing.lng });
  }, [crossing, predictions, routes]);

  if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return <div className="map-fallback"><div className="map-fallback-grid" /><div className="map-fallback-content"><span className="map-icon">⌖</span><strong>Interactive map ready</strong><p>Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to load Google Maps. You can still use the full demo flow without a key.</p></div></div>;
  }
  return <div ref={ref} className="map" />;
}
