"""Check the running API. Live research is opt-in and consumes provider credits."""
import argparse
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def call(base, path, body=None):
    payload = json.dumps(body).encode() if body is not None else None
    request = Request(base.rstrip("/") + path, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=130) as response:
            return json.load(response)
    except HTTPError as error:
        message = error.read().decode()
        raise SystemExit(f"API returned HTTP {error.code}: {message}") from None
    except URLError:
        raise SystemExit("Could not reach the API. Start Uvicorn or supply --api-url.") from None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--require-live", action="store_true")
    parser.add_argument("--research", metavar="COMPANY")
    args = parser.parse_args()
    status = call(args.api_url, "/api/status")
    print("Configuration:", json.dumps(status))
    if args.require_live and status["chat_mode"] != "live":
        raise SystemExit("Live model configuration is missing; update the root .env and restart Python.")
    result = call(args.api_url, "/api/chat", {"message": "Which of SUPP_00012, SUPP_00450 and SUPP_00731 has the lowest financial risk?"})
    if not any(item["supplier_id"] == "SUPP_00731" and item["field"] == "Financial_Health_Score" and item["value"] == 53 for item in result["evidence"]):
        raise SystemExit("Financial comparison did not return the expected verified evidence.")
    print(f"Financial comparison passed; mode={result['mode']}, model={result['model']}")
    result = call(args.api_url, "/api/chat", {"message": "Why is the Total Risk Index of SUPP_00018 so high?"})
    if not any(item["supplier_id"] == "SUPP_00018" and item["field"] == "Total_Risk_Index" and item["value"] == 80 for item in result["evidence"]):
        raise SystemExit("Risk explanation did not return the expected verified evidence.")
    print(f"Risk explanation passed; mode={result['mode']}")
    if args.research:
        report = call(args.api_url, "/api/research", {"company_name": args.research})
        print(f"Research: status={report['status']}, findings={len(report['findings'])}, sources={len(report['sources'])}")
        if report["clarification_question"]:
            print(report["clarification_question"])
    if status["chat_mode"] == "data_only":
        print("Data-only checks passed. No live model call was made.")
