# Python Backend

FastAPI service that pairs with the Vite React frontend.

## Endpoints
- `GET /health` — service uptime check
- `GET /api/ping` — quick connectivity test
- `POST /api/echo` — body: `{ "message": "your text" }`, echoes text and its length
- `GET /` — basic info and docs pointer

Interactive docs available at `/docs` (Swagger UI) and `/redoc` when the server is running.

## Run locally
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Notes
- CORS is permissive for local development so the frontend at `http://localhost:5173` and the Tailscale host can call the API.
- Adjust `allow_origins` in `main.py` before production hardening.
