import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, Clock3, Crosshair, MapPinned, Radio, Route, Search, ShieldCheck, TrainFront, Zap } from 'lucide-react';
import { analyzeCrossing, getCrossings, getRoutes } from './api';
import MapView from './MapView';
import type { Crossing, RouteOption, TrainPrediction } from './types';

const formatDuration = (seconds: number) => {
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
const formatDistance = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

export default function App() {
  const [crossings, setCrossings] = useState<Crossing[]>([]);
  const [crossing, setCrossing] = useState<Crossing>({ id: 'custom', name: 'Demo Railway Crossing', area: 'Click the map to reposition', lat: 8.8878, lng: 76.5954, description: 'Prototype crossing location' });
  const [trainNumbers, setTrainNumbers] = useState('12625, 16346');
  const [predictions, setPredictions] = useState<TrainPrediction[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [origin, setOrigin] = useState('Kollam Railway Station');
  const [destination, setDestination] = useState('Kollam Beach');
  const [loading, setLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState('Not checked yet');

  useEffect(() => { getCrossings().then(r => setCrossings(r.crossings)).catch(() => {}); }, []);

  const imminent = useMemo(() => predictions.filter(p => p.etaMinutes !== null && p.etaMinutes <= 15), [predictions]);
  const affectedRoutes = useMemo(() => routes.filter(r => r.passesCrossing), [routes]);

  const runCheck = async () => {
    setLoading(true); setError('');
    try {
      const result = await analyzeCrossing({ crossing, trainNumbers: trainNumbers.split(',').map(s => s.trim()).filter(Boolean) });
      setPredictions(result.predictions);
      setLastRefresh(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not fetch train data'); }
    finally { setLoading(false); }
  };

  const planRoute = async () => {
    setRouteLoading(true); setError('');
    try {
      const result = await getRoutes({ origin, destination, crossing });
      setRoutes(result.routes);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not calculate route'); }
    finally { setRouteLoading(false); }
  };

  const pickCrossing = (lat: number, lng: number) => {
    setCrossing({ ...crossing, id: 'custom', lat, lng, name: 'Selected Railway Crossing', area: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><TrainFront size={20} /></div><div><span className="brand-name">RailDetour</span><span className="brand-sub">Crossing intelligence</span></div></div>
        <div className="status-pill"><Radio size={15} /> Prototype mode</div>
      </header>

      <main className="page">
        <section className="hero">
          <div><div className="eyebrow">SMART MOBILITY · HACKATHON MVP</div><h1>Know the crossing.<br /><span>Change the route.</span></h1><p>Monitor trains approaching a railway crossing and see road routes that pass through or avoid that crossing.</p></div>
          <div className="hero-card"><Zap size={18} /><div><strong>Live-ready architecture</strong><span>Rail data + Google routing + one decision layer</span></div></div>
        </section>

        <div className="dashboard-grid">
          <section className="panel control-panel">
            <div className="section-title"><div><span className="section-kicker">01 · WATCH</span><h2>Choose a crossing</h2></div><Crosshair size={19} /></div>
            <label>Saved crossing</label>
            <select value={crossing.id} onChange={e => { const c = crossings.find(x => x.id === e.target.value); if (c) setCrossing(c); }}>
              <option value="custom">Custom / map selection</option>
              {crossings.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="coord-row"><div><label>Latitude</label><input value={crossing.lat} onChange={e => setCrossing({ ...crossing, lat: Number(e.target.value) })} /></div><div><label>Longitude</label><input value={crossing.lng} onChange={e => setCrossing({ ...crossing, lng: Number(e.target.value) })} /></div></div>
            <button className="secondary-btn" onClick={() => setCrossing({ ...crossing, name: 'Map-selected Crossing' })}><MapPinned size={16} /> Click map to place crossing</button>

            <div className="section-divider" />
            <div className="section-title compact"><div><span className="section-kicker">02 · TRACK</span><h2>Train numbers</h2></div><TrainFront size={19} /></div>
            <label>Comma-separated train numbers</label>
            <div className="input-with-icon"><Search size={16} /><input value={trainNumbers} onChange={e => setTrainNumbers(e.target.value)} placeholder="12625, 16346" /></div>
            <button className="primary-btn" onClick={runCheck} disabled={loading}>{loading ? 'Checking live status…' : 'Check crossing' } <ArrowRight size={17} /></button>
            <div className="microcopy"><ShieldCheck size={14} /> Demo fallback is enabled until RailRadar is connected.</div>

            <div className="section-divider" />
            <div className="section-title compact"><div><span className="section-kicker">03 · DETOUR</span><h2>Plan a road trip</h2></div><Route size={19} /></div>
            <label>From</label><input value={origin} onChange={e => setOrigin(e.target.value)} />
            <label>To</label><input value={destination} onChange={e => setDestination(e.target.value)} />
            <button className="outline-btn" onClick={planRoute} disabled={routeLoading}>{routeLoading ? 'Finding routes…' : 'Find crossing-aware routes'} <ArrowRight size={16} /></button>
          </section>

          <section className="panel map-panel">
            <div className="map-header"><div><span className="section-kicker">LIVE VIEW</span><h2>{crossing.name}</h2></div><div className="update-time"><span className="dot" /> Last check {lastRefresh}</div></div>
            <MapView crossing={crossing} predictions={predictions} routes={routes} onPickCrossing={pickCrossing} />
          </section>
        </div>

        {error && <div className="error-banner"><AlertTriangle size={16} /> {error}</div>}

        <section className="insight-grid">
          <div className={`summary-card ${imminent.length ? 'alert' : ''}`}><div className="summary-icon"><Bell size={19} /></div><div><span className="metric-label">CROSSING ALERT</span><strong>{imminent.length ? `${imminent.length} train${imminent.length > 1 ? 's' : ''} within 15 min` : 'No imminent train detected'}</strong><span>{imminent.length ? 'Consider changing your road route.' : 'Run a check to refresh the prediction.'}</span></div></div>
          <div className="summary-card"><div className="summary-icon"><Route size={19} /></div><div><span className="metric-label">ROUTE IMPACT</span><strong>{affectedRoutes.length ? `${affectedRoutes.length} route${affectedRoutes.length > 1 ? 's' : ''} cross this point` : 'No route impact calculated'}</strong><span>Google route alternatives are compared to the crossing.</span></div></div>
          <div className="summary-card"><div className="summary-icon"><Clock3 size={19} /></div><div><span className="metric-label">PREDICTION</span><strong>{predictions.length ? 'Updated for this crossing' : 'Waiting for train data'}</strong><span>ETA is an estimate, not an official gate signal.</span></div></div>
        </section>

        <section className="content-section"><div className="section-heading"><div><span className="section-kicker">TRAINS</span><h2>Approaching this crossing</h2></div><span className="tag">{predictions.length} tracked</span></div>
          <div className="train-list">
            {predictions.length === 0 ? <div className="empty-state"><TrainFront size={25} /><strong>No train check yet</strong><span>Enter train numbers and press “Check crossing”.</span></div> : predictions.map(t => <div className="train-row" key={t.trainNumber}><div className="train-avatar"><TrainFront size={19} /></div><div className="train-main"><strong>{t.trainNumber} · {t.trainName}</strong><span>{t.message}</span></div><div className="train-delay"><span>DELAY</span><strong>{t.delayMinutes >= 0 ? `+${t.delayMinutes} min` : `${t.delayMinutes} min`}</strong></div><div className="train-eta"><span>ETA</span><strong>{t.etaMinutes === null ? '—' : `${Math.max(0, Math.round(t.etaMinutes))} min`}</strong></div><div className={`live-badge ${t.status === 'live' ? 'live' : ''}`}>{t.confidence === 'mock' ? 'DEMO' : 'LIVE'}</div></div>)}
          </div>
        </section>

        <section className="content-section"><div className="section-heading"><div><span className="section-kicker">ROUTES</span><h2>Crossing-aware alternatives</h2></div><span className="tag">{routes.length || 0} options</span></div>
          <div className="route-grid">
            {routes.length === 0 ? <div className="empty-state"><Route size={25} /><strong>No routes calculated</strong><span>Enter a start and destination, then calculate crossing-aware routes.</span></div> : routes.map((r, i) => <div className={`route-card ${r.passesCrossing ? 'affected' : 'clear'}`} key={`${r.label}-${i}`}><div className="route-card-top"><div><span className="metric-label">{i === 0 ? 'DEFAULT ROUTE' : `ALTERNATIVE ${i}`}</span><h3>{r.passesCrossing ? 'Passes railway crossing' : 'Avoids railway crossing'}</h3></div><div className="route-status">{r.passesCrossing ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}</div></div><div className="route-stats"><span>{formatDistance(r.distanceMeters)}</span><span>{formatDuration(r.durationSeconds)}</span></div>{r.passesCrossing && imminent.length > 0 && <div className="route-warning">Train movement detected within the current alert window.</div>}</div>)}
          </div>
        </section>

        <footer><span>RailDetour · prototype</span><span>Railway live data availability depends on provider access.</span></footer>
      </main>
    </div>
  );
}
