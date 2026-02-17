"""
FastAPI backend for the starter project.

Endpoints
- GET /health      -> simple uptime check
- GET /api/ping    -> returns {"ping": "pong"}
- POST /api/echo   -> echoes back posted message

Run locally:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Starter Backend", version="1.0.0")

# Allow frontend dev server and Tailscale host; widen for local dev convenience.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EchoRequest(BaseModel):
    message: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/ping")
def ping():
    return {"ping": "pong"}


@app.post("/api/echo")
def echo(body: EchoRequest):
    return {"echo": body.message, "length": len(body.message)}


@app.get("/")
def root():
    return {"service": "starter-backend", "docs": "/docs"}
