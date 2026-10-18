"""Update the checked-in API contract, or verify it with --check."""

import argparse
import json
from pathlib import Path

from app.main import app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    path = Path(__file__).resolve().parents[1] / "docs" / "openapi.json"
    content = json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"
    if args.check:
        if not path.exists() or path.read_text() != content:
            raise SystemExit(
                "OpenAPI snapshot is stale. Run python scripts/export_openapi.py"
            )
        print("OpenAPI contract matches the backend.")
    else:
        path.write_text(content)
        print("Updated docs/openapi.json")


if __name__ == "__main__":
    main()
