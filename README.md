# RailDetour 🚆

RailDetour is a hackathon-ready prototype for **railway crossing intelligence**.

The idea is simple: a user watches a railway crossing, the app checks approaching trains, estimates when a train may reach that crossing, and compares driving routes so the user can see which routes pass near the crossing.

## Why this architecture

- **RailRadar** is used on the server side for live train running status + train route geometry when `RAILRADAR_API_KEY` is available.
- **Google Maps / Routes API** is used for the interactive map and driving-route alternatives when `GOOGLE_MAPS_API_KEY` / `VITE_GOOGLE_MAPS_API_KEY` are available.
- **Demo mode** is built in, so judges can see the complete UI even before external API keys are connected.

## Run locally

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy:

```text
server/.env.example -> server/.env
client/.env.example -> client/.env
```

For the first demo, keys can be left empty.

### 3. Start

```bash
npm run dev
```

Open `http://localhost:5173`.

## Live integrations

### RailRadar

Set:

```env
RAILRADAR_API_KEY=your_key
```

The server uses the live train-status and train-route endpoints. Keep this key in the server and never commit it.

### Google Maps

Set:

```env
GOOGLE_MAPS_API_KEY=your_server_key
```

in `server/.env`, and:

```env
VITE_GOOGLE_MAPS_API_KEY=your_browser_restricted_key
```

in `client/.env`.

Enable the required Maps/Routes APIs in Google Cloud and apply API-key restrictions.

## Demo flow

1. Select a crossing or click on the map to choose one.
2. Enter train numbers such as `12625, 16346`.
3. Click **Check crossing**.
4. Enter a start and destination.
5. Click **Find crossing-aware routes**.
6. Show the judge the crossing alert + route comparison together.

## Important prototype limitation

There is no assumption that a public railway API gives a direct "which train will cross this exact road crossing" field. RailDetour derives a crossing ETA from train live position, train route geometry, distance along the route, and current speed. The result is an estimate and is clearly presented as such.

For a production version, maintain a surveyed crossing dataset and add a stronger train-position interpolation model, historical delay correction, and notification service.

## Suggested repository name

`raildetour`

## Suggested one-line pitch

> **RailDetour predicts railway-crossing delays and shows drivers route alternatives before they get stuck.**
