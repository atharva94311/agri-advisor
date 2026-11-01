# Fasal web frontend

React UI for the harvest advisor API (`agri_advisor/api/server.py`).

```bash
# terminal 1: backend on :8000
python main.py serve

# terminal 2: frontend on :5173
cd frontend && npm install && npm run dev
```

Vite proxies `/api/*` to `http://127.0.0.1:8000`, so the backend needs no CORS setup in development or with
`npm run preview`. Point it elsewhere with `API_TARGET=http://host:port npm run dev`, or build against a
different origin with `VITE_API_BASE=https://api.example.com npm run build` (that origin then needs CORS).

## Pages

| Route | What it does |
|---|---|
| `/` | Overview: greeting, totals, harvest calendar, farm cards, alerts across all farms |
| `/farms` | Search and filter farms by crop and status, sort, run a forecast for every farm |
| `/farms/:id` | KPIs, readiness / health / maturity curve with the harvest window, season timeline, alerts, mandi prices, soil, record a real harvest |
| `/farms/new` | 4-step registration wizard (farmer → crop → location → review), then runs the first forecast |
| `/advisor` | Chat per farm in 11 languages; tap the mic to speak, replies can be read aloud |
| `/system` | Data mode, model, LLM and voice status |

Press <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> anywhere to jump to a farm or page.

## Voice

Where the browser supports the Web Speech API (Chrome, Edge, Safari), speech is transcribed in the browser and sent
to `POST /chat`; replies are spoken with `speechSynthesis`. Otherwise the recorded audio goes to `POST /voice`, and
the server transcribes it with Sarvam AI and the reply plays as Sarvam text-to-speech audio.

## Stack

React 19, React Router, Tailwind CSS 4, Motion (animations), Recharts (forecast chart), cmdk (command palette),
sonner (toasts), lucide-react (icons). Chat threads are kept per farm in `sessionStorage`; theme in `localStorage`.

`src/data/regions.json` (state → districts, used for autocomplete) is generated from
`data/processed/district_rainfall_normals.csv`.
