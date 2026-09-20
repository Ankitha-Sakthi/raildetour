import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { analyzeCrossing, getCrossings, getRoadRoutes, planJourneyDemo, getCommunityReports, addCommunityReport } from './services.js';

const app = express();

// CORS: allow the deployed Vercel frontend (FRONTEND_URL) and localhost for dev.
const allowedOrigins: string[] = ['http://localhost:5173'];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL.replace(/\/+$/, ''));
}
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: false
}));

app.use(express.json());

/* ── Existing endpoints (unchanged) ─────────────────────────────── */

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'raildetour-api' }));
app.get('/api/crossings', (_req, res) => res.json({ crossings: getCrossings() }));

app.post('/api/analyze-crossing', async (req, res) => {
  try {
    const { crossing, trainNumbers } = req.body ?? {};
    if (!crossing || typeof crossing.lat !== 'number' || typeof crossing.lng !== 'number') {
      return res.status(400).send('crossing.lat and crossing.lng are required');
    }
    if (!Array.isArray(trainNumbers) || trainNumbers.length === 0) return res.status(400).send('At least one train number is required');
    const result = await analyzeCrossing(crossing, trainNumbers.slice(0, 6));
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(502).send(error instanceof Error ? error.message : 'Train provider error');
  }
});

app.post('/api/routes', async (req, res) => {
  try {
    const { origin, destination, crossing } = req.body ?? {};
    if (!origin || !destination || !crossing) return res.status(400).send('origin, destination and crossing are required');
    res.json(await getRoadRoutes(origin, destination, crossing));
  } catch (error) {
    console.error(error);
    res.status(502).send(error instanceof Error ? error.message : 'Routes provider error');
  }
});

/* ── Multimodal transit endpoints (new) ─────────────────────────── */

app.post('/api/transit/plan', (req, res) => {
  try {
    const { origin, destination, departureTime, modes } = req.body ?? {};
    if (!origin || !destination) return res.status(400).send('origin and destination are required');
    res.json(planJourneyDemo(origin, destination, departureTime ?? '08:00', modes ?? ['train', 'bus', 'ferry', 'auto']));
  } catch (error) {
    console.error(error);
    res.status(500).send(error instanceof Error ? error.message : 'Journey planning error');
  }
});

app.get('/api/community/updates', (_req, res) => {
  res.json({ updates: getCommunityReports() });
});

app.post('/api/community/updates', (req, res) => {
  try {
    const { type, mode, route, message, delayMinutes } = req.body ?? {};
    if (!type || !mode || !route || !message) return res.status(400).send('type, mode, route, and message are required');
    const update = addCommunityReport({ type, mode, route, message, delayMinutes: delayMinutes ? Number(delayMinutes) : undefined });
    res.json({ update });
  } catch (error) {
    console.error(error);
    res.status(500).send(error instanceof Error ? error.message : 'Report submission error');
  }
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`RailDetour API running on http://localhost:${port}`));
