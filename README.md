# RailDetour — Spidey-Sense Transit 🚆🚌⛴️🛺

> **Sync your transit. Skip the wait.**

RailDetour is a hackathon prototype for **multimodal transit synchronization** in Kerala. Commuters juggling local trains, KSRTC buses, passenger ferries, and feeder autos face stranded waits due to unsynchronized schedules and sudden delays. RailDetour shows delay-aware multimodal journeys, transfer-risk warnings, community reports, and railway-crossing disruption alerts — all in one lightweight planner.

## Problem Statement

**Spidey-Sense Transit (Multimodal Transit Sync):** Commuting between local buses (like KSRTC), passenger ferries, and feeder autos often leaves passengers stranded due to unsynchronized timetables and sudden delays. Build a lightweight multimodal transit planner providing live/crowdsourced schedule updates, simple transfer notifications, and alternative route suggestions.

## What RailDetour Does

1. **Multimodal Journey Planning** — Plan trips across trains, KSRTC buses, ferries, and feeder autos with one search.
2. **Transfer-Risk Detection** — Compares arrival times with next departures. Shows HIGH / MEDIUM / LOW risk with clear explanations and alternative connections when a transfer is likely to be missed.
3. **Delay Tracking** — Each service shows delay data. Delays cascade into transfer-risk calculations.
4. **Community Updates** — Report delays, schedule changes, or disruptions. Recent reports are visible to all users.
5. **Railway-Crossing Intelligence** — Treats a level crossing as a road disruption. Monitors approaching trains and warns if your route passes the crossing.
6. **Alternative Routes** — Shows crossing-aware road alternatives when a train is approaching.

## Demo Mode

The prototype works fully **without any API keys**. All transit schedules, delays, and journey options use clearly labelled demo data for the **Kollam / Kerala area**. No data is claimed to be real-time official information.

## Run Locally

### 1. Install

```bash
npm install
```

### 2. Configure Environment

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Keys can be left empty for the full demo.

### 3. Start

```bash
npm run dev
```

Open `http://localhost:5173`.

## Demo Flow for Judges

1. Open the app — see the multimodal transit dashboard.
2. Select **Trivandrum Central → Alappuzha** and click **Plan journey**.
3. See the **Train → Train** option with a **HIGH** transfer risk — Kerala Express is 25 min late, leaving only 8 min to catch Venad Express at Kollam Junction.
4. See the suggested alternative: KSRTC Superfast bus from Kollam KSRTC Stand.
5. See the **Train → Auto → Bus** option as a safer MEDIUM-risk alternative.
6. See the **Bus → Bus** option with LOW transfer risk.
7. Scroll to **Community Updates** — see recent delay reports from commuters.
8. Submit a new community report (delay / schedule change / disruption).
9. Check the **Railway Crossing** section — enter train numbers, see the crossing alert, and see how it flags road segments as disrupted.

## Architecture

- **Frontend**: React + TypeScript + Vite (port 5173)
- **Backend**: Express + TypeScript (port 4000)
- **Demo mode** built in — no external API keys required.
- **RailRadar** + **Google Maps** integrations available when API keys are provided.

## Deployment

- **Vercel** for the frontend (set `VITE_API_BASE_URL` to the backend URL)
- **Render** for the backend (set `FRONTEND_URL` for CORS)

See `.env.example` files in `client/` and `server/` for all configuration options.

## Important Prototype Limitations

- All transit schedules are simulated demo data for the Kollam / Kerala area.
- Transfer-risk ETAs are estimates, not official gate signals or schedule commitments.
- Community updates are stored in server memory (reset on restart).
- For production: integrate with KSRTC, IRCTC, SWTD APIs; add persistent storage; add push notifications.

## One-Line Pitch

> **RailDetour syncs multimodal transit across trains, buses, ferries, and autos — predicting transfer risks, sharing community delay reports, and alerting drivers to railway-crossing disruptions.**
