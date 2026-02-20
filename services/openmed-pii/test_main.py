"""
Tests for the OpenMed PII sidecar.

Run with: pytest test_main.py -v
(requires: pip install pytest httpx)
"""

from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient


# Mock openmed before importing main
mock_extract_pii = MagicMock()
with patch.dict("sys.modules", {"openmed": MagicMock(extract_pii=mock_extract_pii)}):
    with patch("main.extract_pii", mock_extract_pii):
        import main
        from main import app, _is_inside_placeholder, _find_entity_position


client = TestClient(app)


class FakeEntity:
    def __init__(self, text, label, confidence, start=None, end=None):
        self.text = text
        self.label = label
        self.confidence = confidence
        self.start = start
        self.end = end


class FakeResult:
    def __init__(self, entities):
        self.entities = entities


# ── Health endpoint ───────────────────────────────────────────────────

def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["model"] == "pii_detection_superclinical"
    assert "confidence_threshold" in data


# ── Detect endpoint ──────────────────────────────────────────────────

def test_detect_returns_entities():
    mock_extract_pii.return_value = FakeResult([
        FakeEntity("Maria Schmidt", "NAME", 0.95, start=10, end=24),
        FakeEntity("Bahnhofstrasse 42", "ADDRESS", 0.88, start=30, end=48),
    ])

    resp = client.post("/detect", json={
        "text": "Patientin Maria Schmidt, Bahnhofstrasse 42, Zürich",
        "lang": "de",
    })

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["entities"]) == 2
    assert data["entities"][0]["type"] == "NAME"
    assert data["entities"][1]["type"] == "ADDRESS"


def test_detect_filters_low_confidence():
    mock_extract_pii.return_value = FakeResult([
        FakeEntity("Maria", "NAME", 0.95, start=0, end=5),
        FakeEntity("der", "NAME", 0.3, start=10, end=13),  # below threshold
    ])

    resp = client.post("/detect", json={"text": "Maria und der Arzt", "lang": "de"})
    data = resp.json()
    assert len(data["entities"]) == 1
    assert data["entities"][0]["text"] == "Maria"


def test_detect_skips_placeholders():
    mock_extract_pii.return_value = FakeResult([
        FakeEntity("[NAME_1]", "NAME", 0.9, start=0, end=8),
    ])

    resp = client.post("/detect", json={"text": "[NAME_1] kommt morgen", "lang": "de"})
    data = resp.json()
    assert len(data["entities"]) == 0


def test_detect_finds_position_without_start_end():
    """Test fallback when openmed doesn't return start/end."""
    mock_extract_pii.return_value = FakeResult([
        FakeEntity("Maria", "NAME", 0.9),  # no start/end
    ])

    resp = client.post("/detect", json={"text": "Frau Maria war hier", "lang": "de"})
    data = resp.json()
    assert len(data["entities"]) == 1
    assert data["entities"][0]["start"] == 5
    assert data["entities"][0]["end"] == 10


def test_detect_empty_text():
    mock_extract_pii.return_value = FakeResult([])

    resp = client.post("/detect", json={"text": "", "lang": "de"})
    data = resp.json()
    assert len(data["entities"]) == 0


# ── Helper unit tests ────────────────────────────────────────────────

def test_is_inside_placeholder():
    text = "Herr [NAME_1] kommt am [DATE_1]"
    assert _is_inside_placeholder(text, 5, 13) is True  # [NAME_1]
    assert _is_inside_placeholder(text, 0, 4) is False  # "Herr"
    assert _is_inside_placeholder(text, 23, 31) is True  # [DATE_1]


def test_find_entity_position():
    text = "Maria und Maria"
    pos1 = _find_entity_position(text, "Maria", set())
    assert pos1 == (0, 5)

    pos2 = _find_entity_position(text, "Maria", {0})
    assert pos2 == (10, 15)

    pos3 = _find_entity_position(text, "Maria", {0, 10})
    assert pos3 is None


# ── Preload retry tests ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_preload_model_success_first_attempt():
    """Model loads on the first attempt — _model_ready should be True."""
    mock_extract_pii.reset_mock()
    mock_extract_pii.side_effect = None
    mock_extract_pii.return_value = MagicMock()
    main._model_ready = False
    main.PRELOAD_MAX_RETRIES = 3

    await main.preload_model()

    assert main._model_ready is True
    assert mock_extract_pii.call_count == 1


@pytest.mark.asyncio
async def test_preload_model_success_after_retry():
    """Model fails once then succeeds — _model_ready should be True."""
    mock_extract_pii.reset_mock()
    mock_extract_pii.side_effect = [RuntimeError("download failed"), MagicMock()]
    main._model_ready = False
    main.PRELOAD_MAX_RETRIES = 3
    main.PRELOAD_RETRY_DELAY = 0  # no delay in tests

    await main.preload_model()

    assert main._model_ready is True
    assert mock_extract_pii.call_count == 2


@pytest.mark.asyncio
async def test_preload_model_all_attempts_fail():
    """All retry attempts fail — service stays degraded."""
    mock_extract_pii.reset_mock()
    mock_extract_pii.side_effect = RuntimeError("model not found")
    main._model_ready = False
    main.PRELOAD_MAX_RETRIES = 3
    main.PRELOAD_RETRY_DELAY = 0

    await main.preload_model()

    assert main._model_ready is False
    assert mock_extract_pii.call_count == 3


@pytest.mark.asyncio
async def test_preload_model_single_retry_configured():
    """With max_retries=1, only one attempt is made."""
    mock_extract_pii.reset_mock()
    mock_extract_pii.side_effect = RuntimeError("fail")
    main._model_ready = False
    main.PRELOAD_MAX_RETRIES = 1
    main.PRELOAD_RETRY_DELAY = 0

    await main.preload_model()

    assert main._model_ready is False
    assert mock_extract_pii.call_count == 1
