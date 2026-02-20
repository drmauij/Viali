"""
OpenMed PII Detection Sidecar

Lightweight FastAPI service that runs OpenMed's ML-based PII detection
locally. Called by Viali's Node backend as a third anonymization layer
after known-value replacement and regex sweeps.

Usage:
    uvicorn main:app --host 127.0.0.1 --port 5050
"""

import os
import re
import logging
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field
from openmed import extract_pii

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("openmed-pii")

CONFIDENCE_THRESHOLD = float(os.environ.get("OPENMED_CONFIDENCE_THRESHOLD", "0.7"))
MODEL_NAME = os.environ.get("OPENMED_MODEL", "pii_detection_superclinical")

app = FastAPI(title="OpenMed PII Sidecar", version="1.0.0")

# ── Warm up model on startup ──────────────────────────────────────────
_model_ready = False


@app.on_event("startup")
async def preload_model():
    """Load the model on startup so first request isn't slow."""
    global _model_ready
    logger.info("Preloading OpenMed model '%s' ...", MODEL_NAME)
    try:
        extract_pii("warmup", model_name=MODEL_NAME)
        _model_ready = True
        logger.info("Model loaded successfully.")
    except Exception as e:
        logger.error("Failed to preload model: %s", e)
        _model_ready = False


# ── Schemas ───────────────────────────────────────────────────────────
class DetectRequest(BaseModel):
    text: str
    lang: str = "de"


class Entity(BaseModel):
    start: int
    end: int
    text: str
    type: str
    confidence: float


class DetectResponse(BaseModel):
    entities: list[Entity]


class HealthResponse(BaseModel):
    status: str
    model: str
    model_ready: bool
    confidence_threshold: float


# ── Helpers ───────────────────────────────────────────────────────────
PLACEHOLDER_RE = re.compile(r"\[[A-Z_]+_\d+\]")


def _find_entity_position(text: str, entity_text: str, used_positions: set[int]) -> Optional[tuple[int, int]]:
    """Find the start/end position of an entity in the text, skipping already-used positions."""
    search_start = 0
    while True:
        idx = text.find(entity_text, search_start)
        if idx == -1:
            return None
        if idx not in used_positions:
            return (idx, idx + len(entity_text))
        search_start = idx + 1


def _is_inside_placeholder(text: str, start: int, end: int) -> bool:
    """Check if the span [start:end) falls inside an existing [CATEGORY_N] placeholder."""
    for m in PLACEHOLDER_RE.finditer(text):
        if start >= m.start() and end <= m.end():
            return True
    return False


# ── Endpoints ─────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok" if _model_ready else "degraded",
        model=MODEL_NAME,
        model_ready=_model_ready,
        confidence_threshold=CONFIDENCE_THRESHOLD,
    )


@app.post("/detect", response_model=DetectResponse)
async def detect(req: DetectRequest):
    result = extract_pii(
        req.text,
        model_name=MODEL_NAME,
        use_smart_merging=True,
    )

    entities: list[Entity] = []
    used_positions: set[int] = set()

    for ent in result.entities:
        confidence = getattr(ent, "confidence", 0.0)
        if confidence < CONFIDENCE_THRESHOLD:
            continue

        entity_text = getattr(ent, "text", "")
        entity_type = getattr(ent, "label", "UNKNOWN")

        if not entity_text or len(entity_text.strip()) < 2:
            continue

        # Try to get start/end from entity, fall back to text search
        start = getattr(ent, "start", None)
        end = getattr(ent, "end", None)

        if start is None or end is None:
            pos = _find_entity_position(req.text, entity_text, used_positions)
            if pos is None:
                continue
            start, end = pos

        # Skip entities that fall inside existing placeholders
        if _is_inside_placeholder(req.text, start, end):
            continue

        used_positions.add(start)
        entities.append(Entity(
            start=start,
            end=end,
            text=entity_text,
            type=entity_type,
            confidence=confidence,
        ))

    return DetectResponse(entities=entities)
