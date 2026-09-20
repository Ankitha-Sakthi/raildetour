import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, Bus, Car, Clock3, Crosshair, MapPinned, Radio, Route, Search, Ship, ShieldCheck, TrainFront, Users, Zap } from 'lucide-react';
import { analyzeCrossing, getCrossings, getRoutes, planJourney, getCommunityUpdates, submitCommunityUpdate } from './api';
import MapView from './MapView';
import type { Crossing, RouteOption, TrainPrediction, TransportMode, JourneyOption, CommunityReport } from './types';

/* ── Constants / helpers ────────────────────────────────────────── */

const DEMO_LOCATIONS = ['Trivandrum Central', 'Kollam Junction', 'Kollam KSRTC Stand', 'Kollam Boat Jetty', 'Kollam Beach', 'Alappuzha', 'Kayamkulam Junction', 'Ernakulam Junction', 'Munroe Island', 'Kottarakkara'];

const formatDuration = (seconds: number) => {
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
const formatDistance = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
const modeLabel = (mode: TransportMode) => ({ train: 'Train', bus: 'KSRTC Bus', ferry: 'Ferry', auto: 'Auto' }[mode]);
const ModeIcon = ({ mode, size = 16 }: { mode: TransportMode; size?: number }) => {
  switch (mode) {
    case 'train': return <TrainFront size={size} />;
    case 'bus': return <Bus size={size} />;
    case 'ferry': return <Ship size={size} />;
    case 'auto': return <Car size={size} />;
  }
};

/* ── App ────────────────────────────────────────────────────────── */

export default function App() {
  /* ── Existing crossing state ──────────────────── */
  const [crossings, setCrossings] = useState<Crossing[]>([]);
  const [crossing, setCrossing] = useState<Crossing>({ id: 'custom', name: 'Demo Railway Crossing', area: 'Click the map to reposition', lat: 8.8878, lng: 76.5954, description: 'Prototype crossing location' });
  const [trainNumbers, setTrainNumbers] = useState('12625, 16346');
  const [predictions, setPredictions] = useState<TrainPrediction[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState('Not checked yet');
  const [roadOrigin, setRoadOrigin] = useState('Kollam Railway Station');
  const [roadDest, setRoadDest] = useState('Kollam Beach');

  /* ── Journey planner state ────────────────────── */
  const [jOrigin, setJOrigin] = useState('Trivandrum Central');
  const [jDest, setJDest] = useState('Alappuzha');
  const [jTime, setJTime] = useState('06:30');
  const [jModes, setJModes] = useState<TransportMode[]>(['train', 'bus', 'ferry', 'auto']);
  const [journeys, setJourneys] = useState<JourneyOption[]>([]);
  const [jLoading, setJLoading] = useState(false);

  /* ── Community state ──────────────────────────── */
  const [updates, setUpdates] = useState<CommunityReport[]>([]);
  const [rType, setRType] = useState<CommunityReport['type']>('delay');
  const [rMode, setRMode] = useState<TransportMode>('bus');
  const [rRoute, setRRoute] = useState('');
  const [rMsg, setRMsg] = useState('');
  const [rDelay, setRDelay] = useState('');

  /* ── Effects ──────────────────────────────────── */
  useEffect(() => { getCrossings().then(r => setCrossings(r.crossings)).catch(() => {}); }, []);
  useEffect(() => { getCommunityUpdates().then(r => setUpdates(r.updates)).catch(() => {}); }, []);

  /* ── Derived ──────────────────────────────────── */
  const imminent = useMemo(() => predictions.filter(p => p.etaMinutes !== null && p.etaMinutes <= 15), [predictions]);
  const affectedRoutes = useMemo(() => routes.filter(r => r.passesCrossing), [routes]);
  const highRiskCount = useMemo(() => journeys.filter(j => j.hasHighRisk).length, [journeys]);
  const delayedCount = useMemo(() => {
    const ids = new Set<string>();
    journeys.forEach(j => j.legs.forEach(l => { if (l.service.delayMinutes > 0) ids.add(l.service.id); }));
    return ids.size;
  }, [journeys]);

  /* ── Handlers ─────────────────────────────────── */
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
    try { setRoutes((await getRoutes({ origin: roadOrigin, destination: roadDest, crossing })).routes); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not calculate route'); }
    finally { setRouteLoading(false); }
  };

  const pickCrossing = (lat: number, lng: number) => setCrossing({ ...crossing, id: 'custom', lat, lng, name: 'Selected Railway Crossing', area: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });

  const handlePlanJourney = async () => {
    setJLoading(true); setError('');
    try { setJourneys((await planJourney({ origin: jOrigin, destination: jDest, departureTime: jTime, modes: jModes })).journeys); }
    catch (e) { setError(e instanceof Error ? e.message : 'Journey planning failed'); }
    finally { setJLoading(false); }
  };

  const toggleMode = (mode: TransportMode) => setJModes(prev => prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]);

  const handleSubmitReport = async () => {
    if (!rRoute || !rMsg) return;
    try {
      const result = await submitCommunityUpdate({ type: rType, mode: rMode, route: rRoute, message: rMsg, delayMinutes: rDelay ? Number(rDelay) : undefined });
      setUpdates(prev => [result.update, ...prev]);
      setRRoute(''); setRMsg(''); setRDelay('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Report submission failed'); }
  };

  /* ── Render ───────────────────────────────────── */
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><TrainFront size={20} /></div><div><span className="brand-name">RailDetour</span><span className="brand-sub">Multimodal transit sync</span></div></div>
        <div className="status-pill"><Radio size={15} /> Demo mode</div>
      </header>

      <main className="page">
        {/* ── Hero ──────────────────────────────── */}
        <section className="hero">
          <div><div className="eyebrow">SPIDEY-SENSE TRANSIT · HACKATHON MVP</div><h1>Sync your transit.<br /><span>Skip the wait.</span></h1><p>Plan multimodal journeys across trains, KSRTC buses, ferries, and feeder autos — with transfer-risk alerts, community delay reports, and railway-crossing intelligence.</p></div>
          <div className="hero-card"><Zap size={18} /><div><strong>Multimodal intelligence</strong><span>Trains + Buses + Ferries + Autos → one smart planner</span></div></div>
        </section>

        {/* ── Dashboard grid ────────────────────── */}
        <div className="dashboard-grid">
          <section className="panel control-panel">
            {/* 01 · PLAN */}
            <div className="section-title"><div><span className="section-kicker">01 · PLAN</span><h2>Plan your journey</h2></div><MapPinned size={19} /></div>
            <label>From</label>
            <select value={jOrigin} onChange={e => setJOrigin(e.target.value)}>{DEMO_LOCATIONS.map(l => <option key={l}>{l}</option>)}</select>
            <label>To</label>
            <select value={jDest} onChange={e => setJDest(e.target.value)}>{DEMO_LOCATIONS.map(l => <option key={l}>{l}</option>)}</select>
            <div className="coord-row"><div><label>Departure time</label><input type="time" value={jTime} onChange={e => setJTime(e.target.value)} /></div><div /></div>

            {/* 02 · MODES */}
            <div className="section-divider" />
            <div className="section-title compact"><div><span className="section-kicker">02 · MODES</span><h2>Transport modes</h2></div></div>
            <div className="mode-toggles">
              {(['train', 'bus', 'ferry', 'auto'] as TransportMode[]).map(m => (
                <button key={m} className={`mode-btn ${jModes.includes(m) ? 'active' : ''}`} onClick={() => toggleMode(m)}><ModeIcon mode={m} size={14} /> {modeLabel(m)}</button>
              ))}
            </div>
            <button className="primary-btn" onClick={handlePlanJourney} disabled={jLoading}>{jLoading ? 'Planning…' : 'Plan journey'} <ArrowRight size={17} /></button>
            <div className="microcopy"><ShieldCheck size={14} /> Demo schedules for Kollam / Kerala. Not official data.</div>

            {/* 03 · CROSSING */}
            <div className="section-divider" />
            <div className="section-title compact"><div><span className="section-kicker">03 · CROSSING</span><h2>Railway crossing watch</h2></div><Crosshair size={19} /></div>
            <label>Saved crossing</label>
            <select value={crossing.id} onChange={e => { const c = crossings.find(x => x.id === e.target.value); if (c) setCrossing(c); }}>
              <option value="custom">Custom / map selection</option>
              {crossings.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label>Train numbers (comma-separated)</label>
            <div className="input-with-icon"><Search size={16} /><input value={trainNumbers} onChange={e => setTrainNumbers(e.target.value)} placeholder="12625, 16346" /></div>
            <button className="outline-btn" onClick={runCheck} disabled={loading}>{loading ? 'Checking…' : 'Check crossing'} <ArrowRight size={16} /></button>
            <label style={{ marginTop: 12 }}>Road trip from</label><input value={roadOrigin} onChange={e => setRoadOrigin(e.target.value)} />
            <label>To</label><input value={roadDest} onChange={e => setRoadDest(e.target.value)} />
            <button className="secondary-btn" onClick={planRoute} disabled={routeLoading}>{routeLoading ? 'Finding…' : 'Crossing-aware routes'} <ArrowRight size={16} /></button>
          </section>

          <section className="panel map-panel">
            <div className="map-header"><div><span className="section-kicker">LIVE VIEW</span><h2>{crossing.name}</h2></div><div className="update-time"><span className="dot" /> Last check {lastRefresh}</div></div>
            <MapView crossing={crossing} predictions={predictions} routes={routes} onPickCrossing={pickCrossing} />
          </section>
        </div>

        {error && <div className="error-banner"><AlertTriangle size={16} /> {error}</div>}

        {/* ── Insight grid (4 cards) ────────────── */}
        <section className="insight-grid">
          <div className={`summary-card ${highRiskCount ? 'alert' : ''}`}><div className="summary-icon"><AlertTriangle size={19} /></div><div><span className="metric-label">TRANSFER RISK</span><strong>{highRiskCount ? `${highRiskCount} high-risk transfer${highRiskCount > 1 ? 's' : ''}` : 'No transfer risks'}</strong><span>Plan a journey to check transfer windows.</span></div></div>
          <div className={`summary-card ${delayedCount ? 'warn' : ''}`}><div className="summary-icon"><Clock3 size={19} /></div><div><span className="metric-label">ACTIVE DELAYS</span><strong>{delayedCount ? `${delayedCount} service${delayedCount > 1 ? 's' : ''} delayed` : 'No delays reported'}</strong><span>Demo delay data for prototype.</span></div></div>
          <div className="summary-card"><div className="summary-icon"><Users size={19} /></div><div><span className="metric-label">COMMUNITY</span><strong>{updates.length ? `${updates.length} report${updates.length > 1 ? 's' : ''}` : 'No reports yet'}</strong><span>Crowdsourced transit updates.</span></div></div>
          <div className={`summary-card ${imminent.length ? 'alert' : ''}`}><div className="summary-icon"><Bell size={19} /></div><div><span className="metric-label">CROSSING ALERT</span><strong>{imminent.length ? `${imminent.length} train${imminent.length > 1 ? 's' : ''} within 15 min` : 'No imminent train'}</strong><span>Road disruption from railway crossing.</span></div></div>
        </section>

        {/* ── Journey results ──────────────────── */}
        <section className="content-section"><div className="section-heading"><div><span className="section-kicker">JOURNEYS</span><h2>Multimodal options</h2></div><span className="tag">{journeys.length} found</span></div>
          <div className="journey-list">
            {journeys.length === 0 ? (
              <div className="empty-state"><Route size={25} /><strong>No journeys planned yet</strong><span>Select origin, destination and modes, then press "Plan journey".</span></div>
            ) : journeys.map(j => (
              <div className={`journey-card ${j.hasHighRisk ? 'high-risk' : ''}`} key={j.id}>
                <div className="journey-card-header"><div><span className="metric-label">{j.label}</span><h3>{j.legs.map(l => modeLabel(l.service.mode)).join(' → ')}</h3></div><div className="journey-stats"><span>{formatDuration(j.totalDurationMinutes * 60)}</span><span>{j.transfers} transfer{j.transfers !== 1 ? 's' : ''}</span></div></div>
                {j.hasCrossingRisk && <div className="crossing-risk-badge"><AlertTriangle size={14} /> Route segment passes railway crossing with approaching train</div>}
                <div className="journey-legs">
                  {j.legs.map((leg, li) => (
                    <Fragment key={li}>
                      <div className="journey-leg"><div className={`mode-badge mode-${leg.service.mode}`}><ModeIcon mode={leg.service.mode} /></div><div className="leg-details"><strong>{leg.service.name}</strong><span>{leg.boardAt} → {leg.alightAt}</span><div className="leg-times">{leg.departureTime} → {leg.arrivalTime}{leg.service.delayMinutes > 0 && <span className="delay-badge">+{leg.service.delayMinutes} min late</span>}</div></div></div>
                      {leg.transferRisk && (
                        <div className={`transfer-indicator risk-${leg.transferRisk.toLowerCase()}`}>
                          <span className="transfer-risk-badge">{leg.transferRisk}</span>
                          <span>{leg.transferMinutes != null && leg.transferMinutes >= 0 ? `${leg.transferMinutes} min transfer` : 'Transfer window missed'}</span>
                          {leg.transferMessage && <p>{leg.transferMessage}</p>}
                          {leg.alternative && <div className="alternative-suggestion">💡 Alternative: {leg.alternative.name} ({modeLabel(leg.alternative.mode)}) departing {leg.alternative.departureTime} from {leg.alternative.origin}</div>}
                        </div>
                      )}
                    </Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Community updates ─────────────────── */}
        <section className="content-section"><div className="section-heading"><div><span className="section-kicker">COMMUNITY</span><h2>Transit reports</h2></div><span className="tag">{updates.length} reports</span></div>
          <div className="report-form">
            <div className="report-form-grid">
              <div><label>Type</label><select value={rType} onChange={e => setRType(e.target.value as CommunityReport['type'])}><option value="delay">Delay</option><option value="schedule-change">Schedule Change</option><option value="disruption">Disruption</option></select></div>
              <div><label>Mode</label><select value={rMode} onChange={e => setRMode(e.target.value as TransportMode)}><option value="train">Train</option><option value="bus">Bus / KSRTC</option><option value="ferry">Ferry</option><option value="auto">Auto</option></select></div>
              <div><label>Route / Service</label><input value={rRoute} onChange={e => setRRoute(e.target.value)} placeholder="e.g. Kollam → Alappuzha bus" /></div>
              {rType === 'delay' && <div><label>Delay (min)</label><input type="number" value={rDelay} onChange={e => setRDelay(e.target.value)} placeholder="15" /></div>}
            </div>
            <label>Details</label><input value={rMsg} onChange={e => setRMsg(e.target.value)} placeholder="What's happening?" />
            <button className="outline-btn" onClick={handleSubmitReport}>Submit report <ArrowRight size={16} /></button>
          </div>
          <div className="updates-list">
            {updates.length === 0 ? <div className="empty-state"><Users size={25} /><strong>No community reports</strong><span>Be the first to report a transit update.</span></div> : updates.map(u => (
              <div className="update-row" key={u.id}><div className={`mode-badge mode-${u.mode}`}><ModeIcon mode={u.mode} /></div><div className="update-main"><strong>{u.route}</strong><span>{u.message}</span></div>
                <div className="update-meta"><span className={`update-type type-${u.type}`}>{u.type.replace(/-/g, ' ')}</span>{u.delayMinutes != null && u.delayMinutes > 0 && <span>+{u.delayMinutes}m</span>}<span>{new Date(u.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Approaching trains (existing) ──── */}
        <section className="content-section"><div className="section-heading"><div><span className="section-kicker">CROSSING MONITOR</span><h2>Approaching trains</h2></div><span className="tag">{predictions.length} tracked</span></div>
          <div className="train-list">
            {predictions.length === 0 ? <div className="empty-state"><TrainFront size={25} /><strong>No train check yet</strong><span>Enter train numbers and press "Check crossing".</span></div> : predictions.map(t => <div className="train-row" key={t.trainNumber}><div className="train-avatar"><TrainFront size={19} /></div><div className="train-main"><strong>{t.trainNumber} · {t.trainName}</strong><span>{t.message}</span></div><div className="train-delay"><span>DELAY</span><strong>{t.delayMinutes >= 0 ? `+${t.delayMinutes} min` : `${t.delayMinutes} min`}</strong></div><div className="train-eta"><span>ETA</span><strong>{t.etaMinutes === null ? '—' : `${Math.max(0, Math.round(t.etaMinutes))} min`}</strong></div><div className={`live-badge ${t.status === 'live' ? 'live' : ''}`}>{t.confidence === 'mock' ? 'DEMO' : 'LIVE'}</div></div>)}
          </div>
        </section>

        {/* ── Road routes (existing) ───────────── */}
        {routes.length > 0 && (
          <section className="content-section"><div className="section-heading"><div><span className="section-kicker">ROAD ROUTES</span><h2>Crossing-aware alternatives</h2></div><span className="tag">{routes.length} options</span></div>
            <div className="route-grid">
              {routes.map((r, i) => <div className={`route-card ${r.passesCrossing ? 'affected' : 'clear'}`} key={`${r.label}-${i}`}><div className="route-card-top"><div><span className="metric-label">{i === 0 ? 'DEFAULT ROUTE' : `ALTERNATIVE ${i}`}</span><h3>{r.passesCrossing ? 'Passes railway crossing' : 'Avoids railway crossing'}</h3></div><div className="route-status">{r.passesCrossing ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}</div></div><div className="route-stats"><span>{formatDistance(r.distanceMeters)}</span><span>{formatDuration(r.durationSeconds)}</span></div>{r.passesCrossing && imminent.length > 0 && <div className="route-warning">Train movement detected within the current alert window.</div>}</div>)}
            </div>
          </section>
        )}

        <footer><span>RailDetour · hackathon prototype</span><span>All transit data in demo mode is simulated. Not official timetable data.</span></footer>
      </main>
    </div>
  );
}
