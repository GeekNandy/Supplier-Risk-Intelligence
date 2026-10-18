"""Check the running API. Live research is opt-in and consumes provider credits."""

import argparse
import base64
import getpass
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from dotenv import dotenv_values


def call(base, path, body=None, headers=None, metrics=False):
    payload = json.dumps(body).encode() if body is not None else None
    request = Request(
        base.rstrip("/") + path,
        data=payload,
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urlopen(request, timeout=130) as response:
            if metrics and path in {"/api/chat", "/api/research"}:
                names = (
                    "X-AI-Model-Calls",
                    "X-AI-Search-Calls",
                    "X-AI-Extract-Calls",
                    "X-AI-Prompt-Tokens",
                    "X-AI-Completion-Tokens",
                    "X-AI-Total-Tokens",
                    "X-AI-Duration-Ms",
                )
                print(
                    "Usage:",
                    json.dumps(
                        {
                            name: response.headers[name]
                            for name in names
                            if name in response.headers
                        }
                    ),
                )
            return json.load(response)
    except HTTPError as error:
        message = error.read().decode()
        raise SystemExit(f"API returned HTTP {error.code}: {message}") from None
    except URLError:
        raise SystemExit(
            "Could not reach the API. Start Uvicorn or supply --api-url."
        ) from None


def verify_research_report(report):
    """A successful HTTP response alone does not prove report generation worked."""
    if report.get("status") == "needs_clarification":
        raise SystemExit(
            "Research needs clarification: "
            + (
                report.get("clarification_question")
                or "Specify the exact legal entity."
            )
            + " Retry with --country and --website."
        )
    if report.get("status") not in {"complete", "partial"}:
        raise SystemExit("Research returned an unsupported report status.")
    steps = report.get("steps", [])
    for step in steps:
        if (
            step.get("name") in {"Plan research", "Generate report"}
            and step.get("status") == "failed"
        ):
            raise SystemExit(
                f"Research stage failed: {step['name']}: {step.get('detail', '')}"
            )
    if not any(
        step.get("name") == "Generate report" and step.get("status") == "completed"
        for step in steps
    ):
        raise SystemExit("Research did not demonstrate completed report generation.")
    findings = report.get("findings", [])
    if not findings:
        raise SystemExit(
            "Research returned no cited findings. The smoke check is inconclusive; review the evidence gaps."
        )
    source_ids = {source["id"] for source in report.get("sources", [])}
    if any(
        not finding.get("source_ids")
        or not set(finding["source_ids"]).issubset(source_ids)
        for finding in findings
    ):
        raise SystemExit(
            "Research findings contain missing or unrecognized source references."
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--require-live", action="store_true")
    parser.add_argument(
        "--metrics", action="store_true", help="Print numeric AI usage headers"
    )
    parser.add_argument("--research", metavar="COMPANY")
    parser.add_argument(
        "--country", help="Country hint for the optional research request"
    )
    parser.add_argument(
        "--website", help="Official website hint for the optional research request"
    )
    parser.add_argument(
        "--jury-user", help="Prompt for this user's password without echoing it"
    )
    args = parser.parse_args()
    configuration = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
    username = (
        args.jury_user
        or os.getenv("JURY_USERNAME")
        or configuration.get("JURY_USERNAME")
    )
    password = os.getenv("JURY_PASSWORD") or configuration.get("JURY_PASSWORD")
    if args.jury_user:
        if not sys.stdin.isatty():
            raise SystemExit(
                "Use an interactive terminal for the hidden jury-password prompt."
            )
        password = getpass.getpass("Jury password (hidden): ")
    headers = {}
    if username and password:
        parsed = urlsplit(args.api_url)
        if parsed.scheme != "https" and parsed.hostname not in {
            "localhost",
            "127.0.0.1",
            "::1",
        }:
            raise SystemExit("Use an HTTPS URL for remote jury login.")
        headers["Authorization"] = (
            "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()
        )
    call(args.api_url, "/api/ready", headers=headers)
    status = call(args.api_url, "/api/status", headers=headers)
    print("Configuration:", json.dumps(status))
    if args.require_live and status["chat_mode"] != "live":
        raise SystemExit(
            "Live model configuration is missing; update the root .env and restart Python."
        )
    result = call(
        args.api_url,
        "/api/chat",
        {
            "message": "Which of SUPP_00012, SUPP_00450 and SUPP_00731 has the lowest financial risk?"
        },
        headers=headers,
        metrics=args.metrics,
    )
    if not any(
        item["supplier_id"] == "SUPP_00731"
        and item["field"] == "Financial_Health_Score"
        and item["value"] == 53
        for item in result["evidence"]
    ):
        raise SystemExit(
            "Financial comparison did not return the expected verified evidence."
        )
    if result["suggested_supplier_ids"] != ["SUPP_00731"]:
        raise SystemExit(
            "Financial comparison did not select the computed lowest-risk supplier."
        )
    if args.require_live and (
        result["mode"] != "live"
        or not any(tool["status"] == "completed" for tool in result["tool_calls"])
    ):
        raise SystemExit(
            "The comparison did not demonstrate live model use with a completed supplier tool."
        )
    print(
        f"Financial comparison passed; mode={result['mode']}, model={result['model']}"
    )
    result = call(
        args.api_url,
        "/api/chat",
        {"message": "Why is the Total Risk Index of SUPP_00018 so high?"},
        headers=headers,
        metrics=args.metrics,
    )
    if not any(
        item["supplier_id"] == "SUPP_00018"
        and item["field"] == "Total_Risk_Index"
        and item["value"] == 80
        for item in result["evidence"]
    ):
        raise SystemExit(
            "Risk explanation did not return the expected verified evidence."
        )
    if args.require_live and result["mode"] != "live":
        raise SystemExit("The explanation did not demonstrate live model use.")
    print(f"Risk explanation passed; mode={result['mode']}")
    if args.research:
        report = call(
            args.api_url,
            "/api/research",
            {
                "company_name": args.research,
                "country": args.country,
                "website": args.website,
            },
            headers=headers,
            metrics=args.metrics,
        )
        print(
            f"Research: status={report['status']}, findings={len(report['findings'])}, sources={len(report['sources'])}"
        )
        if report.get("limitations"):
            print(
                f"Research has {len(report['limitations'])} limitations; review them in the research view."
            )
        verify_research_report(report)
        print("Research report generation and source-reference checks passed.")
    if status["chat_mode"] == "data_only":
        print("Data-only checks passed. No live model call was made.")
