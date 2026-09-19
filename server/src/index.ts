import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { analyzeCrossing, getCrossings, getRoadRoutes } from './services.js';

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

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`RailDetour API running on http://localhost:${port}`));
