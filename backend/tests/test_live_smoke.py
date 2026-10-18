"""Guard against treating a partial provider failure as a successful live demo."""

import runpy
from pathlib import Path

import pytest

VERIFY = runpy.run_path(str(Path(__file__).resolve().parents[2] / "scripts" / "smoke_ai.py"))[
    "verify_research_report"
]


@pytest.fixture
def report():
    return {
        "status": "partial",
        "findings": [{"source_ids": ["S1"]}],
        "sources": [{"id": "S1"}],
        "limitations": ["Publication date is unavailable."],
        "steps": [
            {"name": "Plan research", "status": "completed"},
            {"name": "Generate report", "status": "completed"},
        ],
    }


@pytest.mark.parametrize("status", ["complete", "partial"])
def test_live_smoke_accepts_cited_report_with_evidence_gaps(report, status):
    report["status"] = status
    VERIFY(report)


@pytest.mark.parametrize("stage", ["Plan research", "Generate report"])
def test_live_smoke_rejects_partial_model_failure(report, stage):
    report["findings"] = []
    report["steps"] = [
        {"name": stage, "status": "failed", "detail": "Model reached its output limit."}
    ]
    with pytest.raises(SystemExit, match="Model reached its output limit"):
        VERIFY(report)


def test_live_smoke_requires_completed_report_generation(report):
    report["steps"] = []
    with pytest.raises(SystemExit, match="completed report generation"):
        VERIFY(report)


def test_live_smoke_does_not_claim_success_for_no_findings(report):
    report["findings"] = []
    with pytest.raises(SystemExit, match="inconclusive"):
        VERIFY(report)


@pytest.mark.parametrize("citations", [[], ["S99"]])
def test_live_smoke_rejects_unverified_finding_references(report, citations):
    report["findings"][0]["source_ids"] = citations
    with pytest.raises(SystemExit, match="source references"):
        VERIFY(report)


def test_live_smoke_prompts_for_identity_hints(report):
    report.update(status="needs_clarification", clarification_question="Which legal entity?")
    with pytest.raises(SystemExit, match="Which legal entity.*--country and --website"):
        VERIFY(report)
